import { NextResponse } from 'next/server';
import { auth, db as adminDb, FieldValue } from '@/lib/firebase-admin';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // SERVICE ROLE for writing assignments
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken, requestId } = body;

    // Authenticate candidate
    let token = idToken;
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token || !requestId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const decodedToken = await auth.verifyIdToken(token);
    const candidateUid = decodedToken.uid;

    console.log('✅ Accepting swap request:', requestId, 'by', candidateUid);

    // Fetch the swap request
    const { data: swapRequest, error: fetchError } = await supabase
      .from('driver_swap_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError || !swapRequest) {
      return NextResponse.json(
        { error: 'Swap request not found' },
        { status: 404 }
      );
    }

    // Validate candidate is the recipient
    if (swapRequest.candidate_driver_uid !== candidateUid) {
      return NextResponse.json(
        { error: 'You are not the designated candidate for this swap' },
        { status: 403 }
      );
    }

    // Validate request is still pending
    if (swapRequest.status !== 'pending') {
      return NextResponse.json(
        { error: `Request is already ${swapRequest.status}` },
        { status: 409 }
      );
    }

    // Check for conflicting assignments
    const { data: conflictingAssignment } = await supabase
      .from('temporary_assignments')
      .select('*')
      .eq('bus_id', swapRequest.bus_id)
      .eq('active', true)
      .single();

    if (conflictingAssignment) {
      return NextResponse.json(
        { error: 'This bus already has an active temporary assignment' },
        { status: 409 }
      );
    }

    // === ATOMIC TRANSACTION START ===
    // Create temporary assignment
    const { data: assignment, error: assignmentError } = await supabase
      .from('temporary_assignments')
      .insert({
        bus_id: swapRequest.bus_id,
        original_driver_uid: swapRequest.requester_driver_uid,
        current_driver_uid: candidateUid,
        route_id: swapRequest.route_id,
        starts_at: swapRequest.starts_at,
        ends_at: swapRequest.ends_at,
        active: true,
        created_by: 'system',
        source_request_id: requestId,
        reason: swapRequest.reason
      })
      .select()
      .single();

    if (assignmentError) {
      console.error('❌ Error creating assignment:', assignmentError);
      return NextResponse.json(
        { error: 'Failed to create assignment' },
        { status: 500 }
      );
    }

    // Update swap request status
    const { error: updateError } = await supabase
      .from('driver_swap_requests')
      .update({
        status: 'accepted',
        accepted_by: candidateUid,
        accepted_at: new Date().toISOString()
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('❌ Error updating swap request:', updateError);
      // Rollback assignment creation
      await supabase
        .from('temporary_assignments')
        .delete()
        .eq('id', assignment.id);
      return NextResponse.json(
        { error: 'Failed to update swap request' },
        { status: 500 }
      );
    }

    // Update bus temp driver fields (Firestore)
    try {
      await adminDb.collection('buses').doc(swapRequest.bus_id).update({
        tempDriverUid: candidateUid,
        tempDriverExpiresAt: new Date(swapRequest.ends_at)
      });
    } catch (busUpdateError) {
      console.warn('⚠️ Failed to update bus temp driver:', busUpdateError);
    }

    // Log to assignment history
    await supabase
      .from('temporary_assignment_history')
      .insert({
        assignment_id: assignment.id,
        bus_id: swapRequest.bus_id,
        original_driver_uid: swapRequest.requester_driver_uid,
        new_driver_uid: candidateUid,
        action: 'accepted',
        actor_uid: candidateUid,
        notes: `Swap request accepted by ${swapRequest.candidate_name}`
      });

    // If applyToActiveTrip, update active trip session
    if (swapRequest.meta?.applyToActiveTrip) {
      try {
        const activeTripsSnapshot = await adminDb
          .collection('trip_sessions')
          .where('busId', '==', swapRequest.bus_id)
          .where('endedAt', '==', null)
          .limit(1)
          .get();

        if (!activeTripsSnapshot.empty) {
          const tripDoc = activeTripsSnapshot.docs[0];
          await tripDoc.ref.update({
            driverUid: candidateUid,
            previousDriverUid: swapRequest.requester_driver_uid,
            swappedAt: FieldValue.serverTimestamp()
          });
          console.log('✅ Updated active trip session with new driver');
        }
      } catch (tripUpdateError) {
        console.warn('⚠️ Failed to update active trip:', tripUpdateError);
      }
    }

    // === ATOMIC TRANSACTION END ===

    console.log('✅ Assignment created:', assignment.id);

    // Broadcast events
    try {
      // Notify bus channel (students)
      const busChannel = supabase.channel(`bus:${swapRequest.bus_id}`);
      await busChannel.send({
        type: 'broadcast',
        event: 'assignment_created',
        payload: {
          assignmentId: assignment.id,
          busId: swapRequest.bus_id,
          newDriverUid: candidateUid,
          newDriverName: swapRequest.candidate_name,
          endsAt: swapRequest.ends_at
        }
      });

      // Notify requester
      const requesterChannel = supabase.channel(`driver_swap_requests:${swapRequest.requester_driver_uid}`);
      await requesterChannel.send({
        type: 'broadcast',
        event: 'swap_accepted',
        payload: {
          requestId,
          candidateName: swapRequest.candidate_name,
          busId: swapRequest.bus_id
        }
      });

      console.log('📢 Real-time events sent');
    } catch (broadcastError) {
      console.warn('⚠️ Failed to send real-time events:', broadcastError);
    }

    // Send FCM notifications
    try {
      // Get bus details
      const busDoc = await adminDb.collection('buses').doc(swapRequest.bus_id).get();
      const busData = busDoc.data();
      const busNumber = busData?.busNumber || swapRequest.bus_id;

      // Notify requester
      const requesterDoc = await adminDb.collection('drivers').doc(swapRequest.requester_driver_uid).get();
      const requesterFcmToken = requesterDoc.data()?.fcmToken;

      if (requesterFcmToken) {
        const messaging = (await import('firebase-admin/messaging')).getMessaging();
        await messaging.send({
          token: requesterFcmToken,
          notification: {
            title: 'Swap Request Accepted',
            body: `${swapRequest.candidate_name} accepted your swap request for Bus ${busNumber}`,
          },
          data: {
            type: 'SWAP_ACCEPTED',
            requestId,
            assignmentId: assignment.id
          }
        });
      }

      // Notify students on the route
      const studentsSnapshot = await adminDb
        .collection('students')
        .where('busId', '==', swapRequest.bus_id)
        .get();

      const studentTokens: string[] = [];
      studentsSnapshot.docs.forEach(doc => {
        const token = doc.data().fcmToken;
        if (token) studentTokens.push(token);
      });

      if (studentTokens.length > 0) {
        const messaging = (await import('firebase-admin/messaging')).getMessaging();
        await messaging.sendEachForMulticast({
          tokens: studentTokens,
          notification: {
            title: 'Driver Change',
            body: `${swapRequest.candidate_name} will be driving Bus ${busNumber} temporarily`,
          },
          data: {
            type: 'DRIVER_CHANGE',
            busId: swapRequest.bus_id,
            routeId: swapRequest.route_id,
            newDriverName: swapRequest.candidate_name
          }
        });
        console.log(`📱 Notified ${studentTokens.length} students of driver change`);
      }
    } catch (fcmError) {
      console.warn('⚠️ Failed to send FCM notifications:', fcmError);
    }

    return NextResponse.json({
      success: true,
      assignmentId: assignment.id,
      message: 'Swap request accepted and assignment created'
    });

  } catch (error: any) {
    console.error('❌ Error in swap accept:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






