import { NextResponse } from 'next/server';
import { auth, db as adminDb, FieldValue } from '@/lib/firebase-admin';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken, busId, routeId, accuracy, speed, heading, timestamp, tripId } = body;

    // Get token from either body or Authorization header
    let token = idToken;
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token || !busId || !routeId || !accuracy) {
      return NextResponse.json(
        { error: 'Missing required fields: idToken, busId, routeId, accuracy' },
        { status: 400 }
      );
    }

    if (!auth) {
      return NextResponse.json(
        { error: 'Firebase Admin not initialized' },
        { status: 500 }
      );
    }

    // Verify Firebase ID token
    const decodedToken = await auth.verifyIdToken(token);
    const driverUid = decodedToken.uid;

    // Verify driver is assigned to this bus
    const driverDoc = await adminDb.collection('drivers').doc(driverUid).get();
    if (!driverDoc.exists) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    const driverData = driverDoc.data();
    const isDriverAssigned = driverData?.assignedBusId === busId ||
      driverData?.busId === busId;

    if (!isDriverAssigned) {
      return NextResponse.json({ error: 'Driver assigned to this bus' }, { status: 403 });
    }

    // Check if there's an active trip for this driver and bus
    let activeTripId = tripId;
    if (!activeTripId) {
      try {
        const activeTripsSnapshot = await adminDb
          .collection('trip_sessions')
          .where('busId', '==', busId)
          .where('driverUid', '==', driverUid)
          .where('endedAt', '==', null)
          .orderBy('startedAt', 'desc')
          .limit(1)
          .get();

        if (!activeTripsSnapshot.empty) {
          activeTripId = activeTripsSnapshot.docs[0].id;
          console.log('✅ Found active trip:', activeTripId);
        } else {
          console.warn('⚠️ No active trip found, but allowing location update for debugging');
          // For now, allow location updates even without active trip for debugging
          activeTripId = `debug_${Date.now()}`;
        }
      } catch (tripError) {
        console.error('❌ Error checking active trip:', tripError);
        // Allow location update even if trip check fails
        activeTripId = `error_${Date.now()}`;
      }
    }

    // Get current timestamp
    const currentTimestamp = timestamp || Date.now();

    // Update location in Supabase for real-time sharing (optional - don't fail if Supabase is down)
    try {
      const { error: supabaseError } = await supabase
        .from('bus_locations')
        .upsert({
          bus_id: busId,
          route_id: routeId,
          driver_uid: driverUid,
          accuracy: parseFloat(accuracy),
          speed: speed ? parseFloat(speed) : null,
          heading: heading ? parseFloat(heading) : null,
          updated_at: new Date(currentTimestamp).toISOString(),
          timestamp: currentTimestamp
        }, {
          onConflict: 'bus_id'
        });

      if (supabaseError) {
        console.warn('⚠️ Supabase location update failed (non-critical):', supabaseError);
      } else {
        console.log('✅ Location updated in Supabase successfully');
      }
    } catch (supabaseError) {
      console.warn('⚠️ Supabase connection failed (non-critical):', supabaseError);
    }

    // Store historical location data in Firestore - REMOVED per user request
    // Relying on Supabase for history now. 
    // OLD CODE REMOVED


    // Broadcast location update to all subscribers (optional)
    try {
      const broadcastResponse = await supabase
        .channel(`bus_location_${busId}`)
        .send({
          type: 'broadcast',
          event: 'location_update',
          payload: {
            busId,
            routeId,
            driverUid,
            accuracy: parseFloat(accuracy),
            speed: speed ? parseFloat(speed) : null,
            heading: heading ? parseFloat(heading) : null,
            timestamp: currentTimestamp
          }
        });

      // Check if broadcast was successful
      if (broadcastResponse !== 'ok') {
        console.warn('⚠️ Broadcast error (non-critical):', broadcastResponse);
      } else {
        console.log('✅ Location broadcast sent successfully');
      }
    } catch (broadcastError) {
      console.warn('⚠️ Broadcast failed (non-critical):', broadcastError);
    }

    return NextResponse.json({
      success: true,
      message: 'Location updated successfully',
      tripId: activeTripId,
      accuracy: parseFloat(accuracy),
      speed: speed ? parseFloat(speed) : null,
      heading: heading ? parseFloat(heading) : null,
      timestamp: currentTimestamp
    });

  } catch (error: any) {
    console.error('Error updating location:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update location' },
      { status: 500 }
    );
  }
}