import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';

/**
 * POST /api/student/check-active-trip
 * 
 * Body: { busId, idToken }
 * 
 * Checks if there's an active trip for the student's assigned bus
 * Returns trip data if found, null if not
 * 
 * NOTE: This is different from /api/driver/check-active-trip
 * because students don't have driver profiles
 */
export async function POST(request: Request) {
  try {
    console.log('🔄 Student check active trip API called');
    
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
    const studentUid = decodedToken.uid;

    console.log('✅ Token verified, student UID:', studentUid);

    // Verify user exists and is a student
    const userDoc = await adminDb.collection('users').doc(studentUid).get();
    if (!userDoc.exists) {
      console.error('❌ User not found in users collection:', studentUid);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log('✅ User found, checking for active trips...');

    const userData = userDoc.data();
    if (userData?.role !== 'student') {
      return NextResponse.json(
        { error: 'User is not authorized as a student' },
        { status: 403 }
      );
    }

    // Check for active trip sessions for this bus (don't need driver check for students)
    console.log('🔍 Querying for active trips for bus:', busId);
    
    // Simple query to avoid index issues - just check if bus has any active trips
    const activeTripsSnapshot = await adminDb
      .collection('trip_sessions')
      .where('busId', '==', busId)
      .where('tripStatus', '==', 'active')
      .limit(1)
      .get();

    console.log(`📊 Found ${activeTripsSnapshot.size} active trips for bus ${busId}`);

    if (!activeTripsSnapshot.empty) {
      const activeTrip = activeTripsSnapshot.docs[0];
      const tripData = activeTrip.data();
      
      // Also check bus status
      const busDoc = await adminDb.collection('buses').doc(busId).get();
      let busStatus = null;
      if (busDoc.exists) {
        const busData = busDoc.data();
        busStatus = busData?.status;
      }

      console.log('✅ Active trip found:', {
        tripId: activeTrip.id,
        busStatus,
        driverUid: tripData.driverUid
      });

      return NextResponse.json({
        hasActiveTrip: true,
        tripData: {
          tripId: activeTrip.id,
          ...tripData,
          busStatus
        }
      });
    } else {
      console.log('ℹ️ No active trip found for bus:', busId);
      return NextResponse.json({
        hasActiveTrip: false,
        tripData: null
      });
    }

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

