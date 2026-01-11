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
    const {
      idToken,
      busId,
      routeId,
      candidateDriverUid,
      startsAt,
      endsAt,
      reason,
      applyToActiveTrip
    } = body;

    // Authenticate requester
    let token = idToken;
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token || !busId || !candidateDriverUid || !endsAt) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const decodedToken = await auth.verifyIdToken(token);
    const requesterUid = decodedToken.uid;

    console.log('🔄 Driver swap request from:', requesterUid, 'for bus:', busId);

    // Validate requester is the current driver of the bus
    const busDoc = await adminDb.collection('buses').doc(busId).get();
    if (!busDoc.exists) {
      return NextResponse.json({ error: 'Bus not found' }, { status: 404 });
    }

    const busData = busDoc.data();
    const permanentDriver = busData?.driverUid || busData?.driver_uid;

    if (permanentDriver !== requesterUid) {
      return NextResponse.json(
        { error: 'You are not the assigned driver of this bus' },
        { status: 403 }
      );
    }

    // Get requester details
    const requesterDoc = await adminDb.collection('drivers').doc(requesterUid).get();
    const requesterData = requesterDoc.data();
    const requesterName = requesterData?.fullName || requesterData?.name || 'Unknown Driver';

    // Get candidate details
    const candidateDoc = await adminDb.collection('drivers').doc(candidateDriverUid).get();
    if (!candidateDoc.exists) {
      return NextResponse.json(
        { error: 'Candidate driver not found' },
        { status: 404 }
      );
    }

    const candidateData = candidateDoc.data();
    const candidateName = candidateData?.fullName || candidateData?.name || 'Unknown Driver';

    // Check for conflicting pending requests
    const { data: existingRequests, error: checkError } = await supabase
      .from('driver_swap_requests')
      .select('*')
      .eq('bus_id', busId)
      .in('status', ['pending', 'accepted'])
      .single();

    if (existingRequests && !checkError) {
      return NextResponse.json(
        { error: 'There is already an active or pending swap request for this bus' },
        { status: 409 }
      );
    }

    // Create swap request in Supabase
    const { data: swapRequest, error: insertError } = await supabase
      .from('driver_swap_requests')
      .insert({
        requester_driver_uid: requesterUid,
        requester_name: requesterName,
        bus_id: busId,
        route_id: routeId,
        candidate_driver_uid: candidateDriverUid,
        candidate_name: candidateName,
        starts_at: startsAt || new Date().toISOString(),
        ends_at: endsAt,
        reason: reason || null,
        status: 'pending',
        meta: { applyToActiveTrip: applyToActiveTrip || false }
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Error creating swap request:', insertError);
      return NextResponse.json(
        { error: 'Failed to create swap request' },
        { status: 500 }
      );
    }

    console.log('✅ Swap request created:', swapRequest.id);

    // Broadcast real-time event to candidate
    try {
      const channel = supabase.channel(`driver_swap_requests:${candidateDriverUid}`);
      await channel.send({
        type: 'broadcast',
        event: 'swap_requested',
        payload: {
          requestId: swapRequest.id,
          requesterName,
          busId,
          routeId,
          startsAt: swapRequest.starts_at,
          endsAt: swapRequest.ends_at,
          reason: swapRequest.reason
        }
      });
      console.log('📢 Real-time event sent to candidate');
    } catch (broadcastError) {
      console.warn('⚠️ Failed to send real-time event:', broadcastError);
    }

    // Send FCM notification to candidate (if FCM token exists)
    try {
      const candidateStudentDoc = await adminDb.collection('students').doc(candidateDriverUid).get();
      const candidateDriverDoc = await adminDb.collection('drivers').doc(candidateDriverUid).get();
      
      const fcmToken = candidateStudentDoc.data()?.fcmToken || candidateDriverDoc.data()?.fcmToken;

      if (fcmToken) {
        const messaging = (await import('firebase-admin/messaging')).getMessaging();
        await messaging.send({
          token: fcmToken,
          notification: {
            title: 'Driver Swap Request',
            body: `${requesterName} requested you to drive Bus ${busData?.busNumber || busId}`,
          },
          data: {
            type: 'SWAP_REQUEST',
            requestId: swapRequest.id,
            busId,
            routeId
          }
        });
        console.log('📱 FCM notification sent to candidate');
      }
    } catch (fcmError) {
      console.warn('⚠️ Failed to send FCM notification:', fcmError);
    }

    return NextResponse.json({
      success: true,
      requestId: swapRequest.id,
      message: 'Swap request created and notification sent to candidate driver'
    });

  } catch (error: any) {
    console.error('❌ Error in driver swap creation:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






