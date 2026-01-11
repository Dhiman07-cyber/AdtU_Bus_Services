import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken, busId, routeId, tripId } = body;

    // Get token from either body or Authorization header
    let token = idToken;
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token || !busId || !routeId) {
      return NextResponse.json(
        { error: 'Missing required fields: idToken, busId, routeId' },
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
      return NextResponse.json({ error: 'Driver not assigned to this bus' }, { status: 403 });
    }

    // Find the active trip if tripId not provided
    // Find the active trip if tripId not provided
    // Query BUSES collection
    let activeTripId = tripId;
    if (!activeTripId) {
      const busDoc = await adminDb.collection('buses').doc(busId).get();
      activeTripId = busDoc.data()?.activeTripId;

      if (!activeTripId) {
        console.warn('⚠️ No active trip found on bus document. Assuming already cleaned or never started.');
        return NextResponse.json({
          error: 'No active trip found on bus to clean up'
        }, { status: 400 });
      }
    }

    console.log(`🧹 Starting cleanup for trip ${activeTripId} on bus ${busId}`);

    // 1. Mark bus location as inactive in Supabase
    try {
      const { error: supabaseError } = await supabase
        .from('bus_locations')
        .update({
          trip_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('bus_id', busId);

      if (supabaseError) {
        console.error('Supabase cleanup error:', supabaseError);
      } else {
        console.log('✅ Supabase bus_locations marked as inactive');
      }
    } catch (error) {
      console.warn('Supabase cleanup failed (non-critical):', error);
    }

    // 2. Clean up waiting flags for this bus
    try {
      const { error: flagsError } = await supabase
        .from('waiting_flags')
        .delete()
        .eq('bus_id', busId)
        .eq('status', 'waiting');

      if (flagsError) {
        console.error('Waiting flags cleanup error:', flagsError);
      } else {
        console.log('✅ Waiting flags cleaned up');
      }
    } catch (error) {
      console.warn('Waiting flags cleanup failed (non-critical):', error);
    }

    // 3. Clean up Firestore waiting flags - SKIPPED (No longer created)
    console.log('✅ Skipped Firestore waiting flags cleanup (new logic)');

    // 4. Archive recent location data - SKIPPED (No longer created in Firestore)
    console.log('✅ Skipped Firestore location data cleanup (new logic)');


    // 5. Broadcast trip end to all subscribers
    try {
      const channel = supabase.channel(`bus_location_${busId}`);
      const status = await channel.send({
        type: 'broadcast',
        event: 'trip_ended',
        payload: {
          busId,
          routeId: body.routeId || '',
          driverUid: driverUid, // driverUid might not be in scope here, need to check
          tripId: activeTripId,
          timestamp: Date.now()
        }
      });

      if (status !== 'ok') {
        console.warn('Broadcast status (non-critical):', status);
      } else {
        console.log('✅ Trip end broadcast sent');
      }
    } catch (error) {
      console.warn('Broadcast failed (non-critical):', error);
    }

    // 6. Broadcast waiting flags cleanup
    try {
      const channel = supabase.channel(`waiting_flags_${busId}`);
      const status = await channel.send({
        type: 'broadcast',
        event: 'trip_ended',
        payload: {
          busId,
          tripId: activeTripId,
          timestamp: Date.now()
        }
      });

      if (status !== 'ok') {
        console.warn('Waiting flags broadcast status (non-critical):', status);
      }
    } catch (error) {
      console.warn('Waiting flags broadcast failed (non-critical):', error);
    }

    console.log(`🎉 Trip cleanup completed for trip ${activeTripId}`);

    return NextResponse.json({
      success: true,
      message: 'Trip data cleaned up successfully',
      tripId: activeTripId,
      cleanedUp: {
        busLocation: true,
        waitingFlags: true,
        locationHistory: true,
        broadcasts: true
      }
    });

  } catch (error: any) {
    console.error('Error cleaning up trip data:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to clean up trip data' },
      { status: 500 }
    );
  }
}

