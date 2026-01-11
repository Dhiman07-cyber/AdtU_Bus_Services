import { NextResponse } from 'next/server';
import { auth } from '@/lib/firebase-admin';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  try {
    // Get query params
    const { searchParams } = new URL(request.url);
    const forParam = searchParams.get('for');

    // Authenticate
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing authorization token' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const decodedToken = await auth.verifyIdToken(token);
    const driverUid = decodedToken.uid;

    console.log('📋 Listing swap requests for driver:', driverUid);

    const response: any = {
      incoming: [],
      outgoing: [],
      active: []
    };

    // Get incoming requests (where candidate = me)
    const { data: incomingRequests, error: incomingError } = await supabase
      .from('driver_swap_requests')
      .select('*')
      .eq('candidate_driver_uid', driverUid)
      .order('created_at', { ascending: false });

    if (!incomingError && incomingRequests) {
      response.incoming = incomingRequests;
    }

    // Get outgoing requests (where requester = me)
    const { data: outgoingRequests, error: outgoingError } = await supabase
      .from('driver_swap_requests')
      .select('*')
      .eq('requester_driver_uid', driverUid)
      .order('created_at', { ascending: false});

    if (!outgoingError && outgoingRequests) {
      response.outgoing = outgoingRequests;
    }

    // Get active assignments (where I'm either original or current driver)
    const { data: activeAssignments, error: assignmentsError } = await supabase
      .from('temporary_assignments')
      .select('*')
      .eq('active', true)
      .or(`original_driver_uid.eq.${driverUid},current_driver_uid.eq.${driverUid}`)
      .order('created_at', { ascending: false });

    if (!assignmentsError && activeAssignments) {
      response.active = activeAssignments;
    }

    // Calculate summary stats
    const summary = {
      pendingIncoming: incomingRequests?.filter(r => r.status === 'pending').length || 0,
      pendingOutgoing: outgoingRequests?.filter(r => r.status === 'pending').length || 0,
      activeAssignments: activeAssignments?.length || 0
    };

    return NextResponse.json({
      success: true,
      ...response,
      summary
    });

  } catch (error: any) {
    console.error('❌ Error listing swap requests:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}






