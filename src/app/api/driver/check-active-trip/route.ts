import { NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';
import { getSupabaseServer } from '@/lib/supabase-server';
import { withSecurity } from '@/lib/security/api-security';
import { BusIdSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * POST /api/driver/check-active-trip
 * 
 * Body: { busId }
 * 
 * Checks if there's an active trip for the driver and bus
 * Returns trip data if found, null if not
 */
export const POST = withSecurity(
  async (request, { auth, body }) => {
    const { busId } = body as any;
    const driverUid = auth.uid;

    console.log(`🔄 Check active trip API called for bus ${busId}`);

    // Verify driver is assigned to this bus
    const driverDoc = await adminDb.collection('drivers').doc(driverUid).get();
    if (!driverDoc.exists) {
      return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
    }

    const driverData = driverDoc.data();
    const driverClaimsBus =
      driverData?.assignedBusId === busId ||
      driverData?.busId === busId;

    if (!driverClaimsBus) {
      return NextResponse.json(
        { error: 'Driver is not assigned to this bus' },
        { status: 403 }
      );
    }

    // =====================================================
    // MULTI-DRIVER LOCK CHECK
    // Check if bus is locked by another driver
    // =====================================================
    const busDoc = await adminDb.collection('buses').doc(busId).get();
    if (!busDoc.exists) {
      return NextResponse.json({ error: 'Bus not found' }, { status: 404 });
    }

    const busData = busDoc.data();
    const lock = busData?.activeTripLock;

    // Check if lock has expired (stale lock recovery)
    let isLockExpired = false;
    if (lock?.expiresAt) {
      const expiryTime = lock.expiresAt._seconds
        ? lock.expiresAt._seconds * 1000
        : new Date(lock.expiresAt).getTime();
      isLockExpired = Date.now() > expiryTime;

      if (isLockExpired) {
        console.log(`⏰ Lock for bus ${busId} has expired (was held by ${lock.driverId}), allowing new operations`);
      }
    }

    // If another driver has an active, NON-EXPIRED lock on this bus
    if (lock?.active && lock.driverId && lock.driverId !== driverUid && !isLockExpired) {
      console.log(`🔒 Bus ${busId} is locked by driver ${lock.driverId}`);
      return NextResponse.json({
        hasActiveTrip: false,
        tripData: null,
        busLockedByOther: true,
        lockInfo: {
          lockedByDriver: lock.driverId,
          tripId: lock.tripId,
          since: lock.since?._seconds ? new Date(lock.since._seconds * 1000).toISOString() : null
        },
        reason: 'This bus is currently being operated by another driver. Please wait or try again later.'
      });
    }

    // Check for active trip using Supabase
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing Supabase credentials');
      return NextResponse.json({
        hasActiveTrip: false,
        tripData: null,
        error: 'Server configuration error'
      });
    }

    const supabase = getSupabaseServer();

    let statusData = null;
    let retryCount = 0;
    while (retryCount < 2) {
      try {
        const { data, error: statusError } = await supabase
          .from('driver_status')
          .select('id, status, driver_uid, bus_id, started_at')
          .eq('driver_uid', driverUid)
          .order('last_updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (statusError) {
          if (statusError.message?.includes('fetch failed') || statusError.details?.includes('ECONNRESET')) {
            throw statusError;
          }
          console.error('❌ Error querying Supabase driver_status:', statusError);
          return NextResponse.json({
            hasActiveTrip: false,
            tripData: null
          });
        }

        statusData = data;
        break;
      } catch (queryError: any) {
        console.error(`❌ Supabase query exception (attempt ${retryCount + 1}):`, queryError);
        retryCount++;
        if (retryCount >= 2) {
          return NextResponse.json({
            hasActiveTrip: false,
            tripData: null
          });
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (statusData) {
      if ((statusData.status === 'on_trip' || statusData.status === 'enroute') && 
          statusData.driver_uid === driverUid && statusData.bus_id === busId) {
        console.log('✅ Active trip found in Supabase');

        const startTime = statusData.started_at ? new Date(statusData.started_at).getTime() : Date.now();
        const tripId = `trip_${busId}_${startTime}`;

        return NextResponse.json({
          hasActiveTrip: true,
          tripData: {
            tripId: tripId,
            startTime: startTime,
            busId: busId,
            driverUid: driverUid,
            busStatus: 'enroute'
          }
        });
      }
    }

    console.log('ℹ️ No active trip found in Supabase');
    return NextResponse.json({
      hasActiveTrip: false,
      tripData: null,
    });
  },
  {
    requiredRoles: ['driver'],
    schema: BusIdSchema,
    rateLimit: RateLimits.READ,
    allowBodyToken: true
  }
);

