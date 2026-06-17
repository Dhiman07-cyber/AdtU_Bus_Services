import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { notifyRoute } from '@/lib/services/fcm-notification-service';
import { getSupabaseServer } from '@/lib/supabase-server';
import { tripLockService } from '@/lib/services/trip-lock-service';
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

    const requestedTripId = crypto.randomUUID();
    const lockResult = await tripLockService.startTrip(driverUid, busId, routeId, 'both', requestedTripId);
    if (!lockResult.success) {
      return NextResponse.json(
        { error: lockResult.reason || 'Lock acquisition failed', errorCode: lockResult.errorCode },
        { status: lockResult.errorCode === 'LOCKED_BY_OTHER' ? 409 : 500 }
      );
    }

    const tripId = lockResult.tripId || requestedTripId;
    const isExistingTrip = tripId !== requestedTripId;

    // 2. Parallelize State Initialization
    const supabase = getSupabaseServer();
    const stops = busData?.route?.stops || busData?.stops || [];
    const rawRouteName = busData?.route?.routeName || busData?.routeName || routeId;
    const routeName = formatIdForDisplay(rawRouteName);
    const busNumber = formatIdForDisplay(busData?.busNumber || busId);
    const nowIso = new Date().toISOString();

    const initializationTasks: any[] = [
      // Supabase: Driver Status
      supabase.from('driver_status').upsert({
        driver_uid: driverUid, bus_id: busId, route_id: routeId, status: 'on_trip',
        started_at: nowIso, last_updated_at: nowIso, trip_id: tripId
      }, { onConflict: 'driver_uid' }),
    ];

    if (!isExistingTrip) {
      initializationTasks.push(
        supabase.from('bus_locations').insert({
          bus_id: busId, route_id: routeId, driver_uid: driverUid, lat: 0, lng: 0, speed: 0,
          heading: 0, accuracy: 0, timestamp: nowIso, is_snapshot: true, trip_id: tripId
        })
      );
    }

    const initializationResults = await Promise.allSettled(initializationTasks);
    const initializationFailed = initializationResults.some((result) => (
      result.status === 'rejected' || Boolean(result.value?.error)
    ));

    if (initializationFailed) {
      if (!isExistingTrip) {
        await tripLockService.endTrip(tripId, driverUid, busId).catch((error) => {
          console.error('Failed to rollback trip after initialization failure:', error);
        });
      }

      return NextResponse.json(
        { error: 'Failed to initialize journey state' },
        { status: 500 }
      );
    }

    // 3. Fire-and-forget Broadcasts and Notifications
    if (!isExistingTrip) (async () => {
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
      message: isExistingTrip ? 'Journey already active' : 'Journey started successfully',
      tripId,
      busId,
      routeId,
      timestamp: nowIso,
      processingTimeMs: elapsed
    });
  },
  {
    requiredRoles: ['driver'],
    schema: StartTripSchema,
    rateLimit: RateLimits.CREATE,
    allowBodyToken: true
  }
);
