import { NextResponse } from 'next/server';
import { auth, db as adminDb, FieldValue } from '@/lib/firebase-admin';
import { createClient } from '@supabase/supabase-js';
import { DriverSwapSupabaseService } from '@/lib/driver-swap-supabase';

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

    // Use the central service to handle acceptance
    // This handles both Assignment cases and True Swap cases
    const result = await DriverSwapSupabaseService.acceptSwapRequest(requestId, candidateUid);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to accept swap request' },
        { status: 400 }
      );
    }

    // Broadcast success
    try {
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
      console.log('📢 Real-time swap_accepted broadcast sent');
    } catch (e) {
      console.warn('⚠️ Broadcast failed:', e);
    }

    return NextResponse.json({
      success: true,
      message: 'Swap request accepted successfully'
    });

  } catch (error: any) {
    console.error('❌ Error in swap accept:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






