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

    console.log('❌ Rejecting swap request:', requestId, 'by', candidateUid);

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

    // Update request status to rejected
    const { error: updateError } = await supabase
      .from('driver_swap_requests')
      .update({
        status: 'rejected',
        rejected_by: candidateUid,
        rejected_at: new Date().toISOString()
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('❌ Error rejecting swap request:', updateError);
      return NextResponse.json(
        { error: 'Failed to reject swap request' },
        { status: 500 }
      );
    }

    console.log('✅ Swap request rejected');

    // Broadcast real-time event to requester
    try {
      const channel = supabase.channel(`driver_swap_requests:${swapRequest.requester_driver_uid}`);
      await channel.send({
        type: 'broadcast',
        event: 'swap_rejected',
        payload: {
          requestId,
          candidateName: swapRequest.candidate_name,
          busId: swapRequest.bus_id
        }
      });
      console.log('📢 Real-time event sent to requester');
    } catch (broadcastError) {
      console.warn('⚠️ Failed to send real-time event:', broadcastError);
    }

    // Send FCM notification to requester
    try {
      const requesterDoc = await adminDb.collection('drivers').doc(swapRequest.requester_driver_uid).get();
      const requesterFcmToken = requesterDoc.data()?.fcmToken;

      if (requesterFcmToken) {
        const messaging = (await import('firebase-admin/messaging')).getMessaging();
        await messaging.send({
          token: requesterFcmToken,
          notification: {
            title: 'Swap Request Rejected',
            body: `${swapRequest.candidate_name} rejected your swap request`,
          },
          data: {
            type: 'SWAP_REJECTED',
            requestId,
            busId: swapRequest.bus_id
          }
        });
        console.log('📱 FCM notification sent to requester');
      }
    } catch (fcmError) {
      console.warn('⚠️ Failed to send FCM notification:', fcmError);
    }

    return NextResponse.json({
      success: true,
      message: 'Swap request rejected'
    });

  } catch (error: any) {
    console.error('❌ Error in swap rejection:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






