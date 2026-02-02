import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/driver/check-active-trip
 * 
 * Body: { busId, idToken }
 * 
 * Checks if there's an active trip for the driver and bus
 * Returns trip data if found, null if not
 */
export async function POST(request: Request) {
  try {
    console.log('🔄 Check active trip API called');

    const body = await request.json();
    const { idToken, busId } = body;

    console.log('📋 Request data:', { hasIdToken: !!idToken, busId });

    // Get token from either body or Authorization header
    let token = idToken;
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    // Validate required fields
    if (!token || !busId) {
      console.error('❌ Missing required fields:', { hasToken: !!token, busId });
      return NextResponse.json(
        { error: 'Missing required fields: idToken (or Authorization header), busId' },
        { status: 400 }
      );
    }

    // Verify Firebase ID token
    if (!auth) {
      console.error('❌ Firebase Admin not initialized');
      return NextResponse.json(
        { error: 'Firebase Admin not initialized' },
        { status: 500 }
      );
    }

    console.log('✅ Firebase Admin initialized, verifying token...');

    let driverUid: string;
    try {
      const decodedToken = await auth.verifyIdToken(token);
      driverUid = decodedToken.uid;
      console.log('✅ Token verified, driver UID:', driverUid);
    } catch (authError: any) {
      console.error('❌ Token verification failed:', authError.message);
      return NextResponse.json(
        { error: 'Invalid or expired token', details: authError.message },
        { status: 401 }
      );
    }

    // Verify user exists and is a driver
    const userDoc = await adminDb.collection('users').doc(driverUid).get();
    if (!userDoc.exists) {
      console.error('❌ User not found in users collection:', driverUid);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log('✅ User found, checking for active trips...');

    const userData = userDoc.data();
    if (userData?.role !== 'driver') {
      return NextResponse.json(
        { error: 'User is not authorized as a driver' },
        { status: 403 }
      );
    }

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
      console.log(`🔒 Bus ${busId} is locked by driver ${lock.driverId}, current driver is ${driverUid}`);
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

    // Check for active trip using Supabase (matching start-journey-v2 logic)
    console.log('🔍 Querying Supabase driver_status for active trip:', { busId });

    // Initialize Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing Supabase credentials');
      return NextResponse.json({
        hasActiveTrip: false,
        tripData: null,
        error: 'Server configuration error',
        debug: { missingCredentials: true }
      }, { status: 200 }); // Return 200 with error info instead of 500
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    let statusData = null;
    try {
      const { data, error: statusError } = await supabase
        .from('driver_status')
        .select('id, status, driver_uid, bus_id, started_at') // Select only needed fields
        .eq('driver_uid', driverUid)
        .order('last_updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (statusError) {
        console.error('❌ Error querying Supabase driver_status:', statusError);
        // Don't throw - return graceful response
        return NextResponse.json({
          hasActiveTrip: false,
          tripData: null,
          debug: {
            supabaseError: statusError.message,
            code: statusError.code
          }
        });
      }

      statusData = data;
    } catch (queryError: any) {
      console.error('❌ Supabase query exception:', queryError);
      return NextResponse.json({
        hasActiveTrip: false,
        tripData: null,
        debug: { queryException: queryError.message }
      });
    }

    if (statusData) {
      console.log('🚌 Driver status data:', {
        driverUid: statusData.driver_uid,
        status: statusData.status,
        startedAt: statusData.started_at
      });

      // Check if status is on_trip or enroute and driver matches
      // Note: we check driver_uid from the status record to ensure the current driver is the one on the trip
      if ((statusData.status === 'on_trip' || statusData.status === 'enroute') && statusData.driver_uid === driverUid && statusData.bus_id === busId) {
        console.log('✅ Active trip found in Supabase');

        const startTime = statusData.started_at ? new Date(statusData.started_at).getTime() : Date.now();
        // Construct a consistent tripId based on start time
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
      } else if (statusData) {
        console.warn(`⚠️ Trip found but conditions failed:`, {
          status: statusData.status,
          driverMatch: statusData.driver_uid === driverUid,
          expectedDriver: driverUid,
          actualDriver: statusData.driver_uid
        });
      }
    } else {
      console.log(`ℹ️ No row found in driver_status for bus_id: ${busId}`);
    }

    console.log('ℹ️ No active trip found in Supabase');
    return NextResponse.json({
      hasActiveTrip: false,
      tripData: null,
      debug: statusData ? {
        foundRow: true,
        status: statusData.status,
        driverMatch: statusData.driver_uid === driverUid,
        driverUid: statusData.driver_uid // Be careful returning this if insensitive, but driverUid is just an ID
      } : {
        foundRow: false,
        busIdChecked: busId
      }
    });

  } catch (error: any) {
    console.error('❌ Error checking active trip:', error);
    // console.error('❌ Error stack:', error.stack); // Reduce noise
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code || 'unknown',
      name: error.name
    });
    return NextResponse.json(
      {
        error: error.message || 'Failed to check active trip',
        details: error.code || 'Unknown error',
        // stack: process.env.NODE_ENV === 'development' ? error.stack : undefined // Don't expose stack
      },
      { status: 500 }
    );
  }
}

