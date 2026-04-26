import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { notifyRoute } from '@/lib/services/fcm-notification-service';
import { getSupabaseServer } from '@/lib/supabase-server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { withSecurity } from '@/lib/security/api-security';
import { StartTripSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';
import { formatIdForDisplay } from '@/lib/utils';
import crypto from 'crypto';

/**
 * POST /api/driver/start-journey-v2
 * 
 * Optimized:
 * - Parallelized document fetching (Driver and Bus)
 * - Removed external geocoding dependencies (Nominatim)
 * - Parallelized Supabase state initialization
 * - Non-blocking background notifications and broadcasts
 */
export const POST = withSecurity(
  async (request, { auth, body }) => {
    const startTime = Date.now();
    const { busId, routeId } = body as any;
    const driverUid = auth.uid;

    // 1. Parallelize document fetching (Driver and Bus)
    const [driverSnap, busSnap] = await adminDb.getAll(
      adminDb.collection('drivers').doc(driverUid),
      adminDb.collection('buses').doc(busId)
    ) as any[];

    if (!driverSnap.exists) return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
    if (!busSnap.exists) return NextResponse.json({ error: 'Bus not found' }, { status: 404 });

    const driverData = driverSnap.data();
    const busData = busSnap.data();

    // Validate driver assignment
    const isAssigned = (driverData?.assignedBusId === busId || driverData?.busId === busId) ||
                       (busData?.assignedDriverId === driverUid || busData?.activeDriverId === driverUid || busData?.driverUID === driverUid);

    if (!isAssigned) {
      return NextResponse.json({ error: 'Driver is not assigned to this bus' }, { status: 403 });
    }

    const tripId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 300000); // 5 mins lock

    try {
      await adminDb.runTransaction(async (transaction: any) => {
        const busDocSnap = await transaction.get(adminDb.collection('buses').doc(busId));
        const currentBusData = busDocSnap.data();
        const lock = currentBusData?.activeTripLock;

        let isLockExpired = lock?.expiresAt && Date.now() > (lock.expiresAt.toMillis ? lock.expiresAt.toMillis() : new Date(lock.expiresAt).getTime());

        if (lock?.active && lock.driverId && lock.driverId !== driverUid && !isLockExpired) {
          throw new Error('LOCKED_BY_OTHER_DRIVER');
        }

        if (lock?.active && lock.driverId === driverUid && lock.tripId && !isLockExpired) {
          throw new Error(`ALREADY_ACTIVE:${lock.tripId}`);
        }

        transaction.update(adminDb.collection('buses').doc(busId), {
          activeTripLock: {
            active: true, tripId, driverId: driverUid, shift: 'both',
            since: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromDate(expiresAt),
            startFcmSent: false, endFcmSent: false,
          },
          activeDriverId: driverUid, activeTripId: tripId
        });
      });
    } catch (txError: any) {
      if (txError.message === 'LOCKED_BY_OTHER_DRIVER') return NextResponse.json({ error: 'Bus operated by another driver', errorCode: 'LOCKED_BY_OTHER' }, { status: 409 });
      if (txError.message.startsWith('ALREADY_ACTIVE:')) return NextResponse.json({ success: true, message: 'Trip already active', tripId: txError.message.split(':')[1] });
      return NextResponse.json({ error: 'Lock acquisition failed' }, { status: 500 });
    }

    // 2. Parallelize State Initialization
    const supabase = getSupabaseServer();
    const stops = busData?.route?.stops || busData?.stops || [];
    const rawRouteName = busData?.route?.routeName || busData?.routeName || routeId;
    const routeName = formatIdForDisplay(rawRouteName);
    const busNumber = formatIdForDisplay(busData?.busNumber || busId);
    const nowIso = new Date().toISOString();

    const initializationTasks = [
      // Supabase: Driver Status
      supabase.from('driver_status').upsert({
        driver_uid: driverUid, bus_id: busId, route_id: routeId, status: 'on_trip',
        started_at: nowIso, last_updated_at: nowIso, trip_id: tripId
      }, { onConflict: 'driver_uid' }),

      // Supabase: Active Trip
      supabase.from('active_trips').insert({
        bus_id: busId, driver_id: driverUid, route_id: routeId, shift: 'both', status: 'active',
        start_time: nowIso, last_heartbeat: nowIso,
        metadata: { appTripId: tripId, routeName, busNumber, stopsCount: stops.length }
      }),

      // Supabase: Initial Location
      supabase.from('bus_locations').insert({
        bus_id: busId, route_id: routeId, driver_uid: driverUid, lat: 0, lng: 0, speed: 0,
        heading: 0, accuracy: 0, timestamp: nowIso, is_snapshot: true, trip_id: tripId
      })
    ];

    await Promise.all(initializationTasks);

    // 3. Fire-and-forget Broadcasts and Notifications
    (async () => {
        try {
            const channel = supabase.channel(`trip-status-${busId}`);
            await channel.subscribe();
            await channel.send({
                type: 'broadcast', event: 'trip_started',
                payload: { busId, routeId, driverUid, tripId, routeName, busNumber, timestamp: nowIso }
            });
            await supabase.removeChannel(channel);

            await notifyRoute({ routeId, tripId, routeName: routeName as string, busId });
        } catch (e) {
            console.error('Non-critical notification/broadcast failed:', e);
        }
    })();

    const elapsed = Date.now() - startTime;
    return NextResponse.json({
      success: true,
      message: 'Journey started successfully',
      tripId,
      busId,
      routeId,
      timestamp: nowIso,
      processingTimeMs: elapsed
    });
  },
  {
    requiredRoles: ['driver', 'admin'],
    schema: StartTripSchema,
    rateLimit: RateLimits.CREATE,
    allowBodyToken: true
  }
);