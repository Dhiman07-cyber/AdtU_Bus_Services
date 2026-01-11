import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';
import { createClient } from '@supabase/supabase-js';
import { FieldValue } from 'firebase-admin/firestore';

// Initialize Supabase client with service role
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * POST /api/driver/ack-flag
 * 
 * Body: { flagId, idToken }
 * 
 * Validates:
 * - Driver is authenticated and assigned to the route/bus
 * 
 * Actions:
 * - Update waiting_flags.status = "acknowledged"
 * - Set ackByDriverUid
 * - Broadcast update to route channel
 * - Send FCM notification to student
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken, flagId } = body;

    // Validate required fields
    if (!idToken || !flagId) {
      return NextResponse.json(
        { error: 'Missing required fields: idToken, flagId' },
        { status: 400 }
      );
    }

    // Verify Firebase ID token
    if (!auth) {
      return NextResponse.json(
        { error: 'Firebase Admin not initialized' },
        { status: 500 }
      );
    }

    const decodedToken = await auth.verifyIdToken(idToken);
    const driverUid = decodedToken.uid;

    // Verify user exists and is a driver
    const userDoc = await adminDb.collection('users').doc(driverUid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    if (userData?.role !== 'driver') {
      return NextResponse.json(
        { error: 'User is not authorized as a driver' },
        { status: 403 }
      );
    }

    // Get waiting flag
    const { data: flagData, error: flagError } = await supabase
      .from('waiting_flags')
      .select('*')
      .eq('id', flagId)
      .single();

    if (flagError || !flagData) {
      return NextResponse.json(
        { error: 'Waiting flag not found' },
        { status: 404 }
      );
    }

    // Verify driver is assigned to this bus/route
    // First check if the driver document claims this bus
    const driverDoc = await adminDb.collection('drivers').doc(driverUid).get();
    if (!driverDoc.exists) {
      return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
    }

    const driverData = driverDoc.data();
    const driverClaimsBus =
      driverData?.assignedBusId === flagData.bus_id ||
      driverData?.busId === flagData.bus_id;

    // Also verify the bus exists
    const busDoc = await adminDb.collection('buses').doc(flagData.bus_id).get();
    if (!busDoc.exists) {
      return NextResponse.json({ error: 'Bus not found' }, { status: 404 });
    }

    const busData = busDoc.data();

    // Check if bus also claims this driver (bidirectional validation)
    const busClaimsDriver =
      busData?.assignedDriverId === driverUid ||
      busData?.activeDriverId === driverUid ||
      busData?.driverUID === driverUid;

    // Driver must claim the bus (primary validation)
    if (!driverClaimsBus) {
      console.error('Driver assignment validation failed:', {
        driverUid,
        busId: flagData.bus_id,
        driverData: {
          assignedBusId: driverData?.assignedBusId,
          busId: driverData?.busId
        }
      });
      return NextResponse.json(
        { error: 'Driver is not assigned to this bus' },
        { status: 403 }
      );
    }

    // Update waiting flag status
    const { error: updateError } = await supabase
      .from('waiting_flags')
      .update({
        status: 'acknowledged',
        ack_by_driver_uid: driverUid
      })
      .eq('id', flagId);

    if (updateError) {
      console.error('Error acknowledging flag:', updateError);
      return NextResponse.json(
        { error: 'Failed to acknowledge flag' },
        { status: 500 }
      );
    }

    // Broadcast to multiple channels for instant UI updates
    try {
      // 1. Broadcast to waiting_flags channel (for driver UI update)
      const flagsChannel = supabase.channel(`waiting_flags_${flagData.bus_id}`);
      await flagsChannel.send({
        type: 'broadcast',
        event: 'waiting_flag_acknowledged',
        payload: {
          flagId,
          studentUid: flagData.student_uid,
          status: 'acknowledged'
        }
      });
      await supabase.removeChannel(flagsChannel);

      // 2. Broadcast to student-specific channel (for student UI update)
      const studentChannel = supabase.channel(`student_${flagData.student_uid}`);
      await studentChannel.send({
        type: 'broadcast',
        event: 'flag_acknowledged',
        payload: {
          flagId,
          busId: flagData.bus_id,
          ackByDriverUid: driverUid,
          timestamp: new Date().toISOString(),
          message: 'Driver has acknowledged your waiting flag!'
        }
      });
      await supabase.removeChannel(studentChannel);

      // 3. Broadcast to route channel (for admin/monitoring)
      const routeChannel = supabase.channel(`route_${flagData.route_id}`);
      await routeChannel.send({
        type: 'broadcast',
        event: 'waiting_flag_acknowledged',
        payload: {
          flagId,
          studentUid: flagData.student_uid,
          busId: flagData.bus_id,
          routeId: flagData.route_id,
          ackByDriverUid: driverUid,
          timestamp: new Date().toISOString()
        }
      });
      await supabase.removeChannel(routeChannel);
    } catch (broadcastError) {
      console.error('Broadcast error (non-critical):', broadcastError);
    }

    // Get active trip ID to link this log to the current journey
    // Check BUS collection instead of trip_sessions
    const activeBusDoc = await adminDb.collection('buses').doc(flagData.bus_id).get();
    const tripId = activeBusDoc.exists ? activeBusDoc.data()?.activeTripId : null;

    // Log to audit_logs - REMOVED per request


    // NOTE: No FCM for flag acknowledgment - only in-app toast via broadcast
    // Student will see instant toast via student_{uid} channel
    console.log('✅ Flag acknowledged - student will see in-app toast via broadcast');

    return NextResponse.json({
      success: true,
      message: 'Flag acknowledged successfully',
      data: {
        flagId,
        studentUid: flagData.student_uid,
        ackByDriverUid: driverUid
      }
    });

  } catch (error: any) {
    console.error('Error acknowledging flag:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to acknowledge flag' },
      { status: 500 }
    );
  }
}
