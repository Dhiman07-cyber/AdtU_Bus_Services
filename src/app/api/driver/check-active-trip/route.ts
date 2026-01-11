import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';

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

    const decodedToken = await auth.verifyIdToken(token);
    const driverUid = decodedToken.uid;

    console.log('✅ Token verified, driver UID:', driverUid);

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

    // Check for active trip in BUS collection (since we moved away from trip_sessions)
    console.log('🔍 Querying bus document for active trip:', { busId });

    const busDoc = await adminDb.collection('buses').doc(busId).get();

    if (busDoc.exists) {
      const busData = busDoc.data();
      console.log('🚌 Bus data:', {
        id: busDoc.id,
        status: busData?.status,
        activeDriverId: busData?.activeDriverId,
        activeTripId: busData?.activeTripId
      });

      // Check if bus is enroute and driver matches
      if (busData?.status === 'enroute' && busData?.activeDriverId === driverUid) {
        console.log('✅ Active trip found on bus document');

        return NextResponse.json({
          hasActiveTrip: true,
          tripData: {
            tripId: busData.activeTripId || `trip_${busId}_legacy`,
            startTime: busData.lastStartedAt,
            busId: busId,
            driverUid: driverUid,
            busStatus: 'enroute'
          }
        });
      }
    }

    console.log('ℹ️ No active trip found on bus document');
    return NextResponse.json({
      hasActiveTrip: false,
      tripData: null
    });

  } catch (error: any) {
    console.error('❌ Error checking active trip:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error details:', {
      message: error.message,
      code: error.code,
      name: error.name
    });
    return NextResponse.json(
      {
        error: error.message || 'Failed to check active trip',
        details: error.code || 'Unknown error',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

