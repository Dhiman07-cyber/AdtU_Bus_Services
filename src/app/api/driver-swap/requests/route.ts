import { NextResponse } from 'next/server';
import { auth } from '@/lib/firebase-admin';
import { DriverSwapService } from '@/lib/driver-swap-service';
import type { DocumentSnapshot } from 'firebase-admin/firestore';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      idToken,
      fromDriverUID,
      toDriverUID,
      busId,
      routeId,
      timePeriod
    } = body;

    // Authenticate requester
    let token = idToken;
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const decodedToken = await auth.verifyIdToken(token);
    const requesterUID = decodedToken.uid;

    // Validate requester is the fromDriver
    if (requesterUID !== fromDriverUID) {
      return NextResponse.json(
        { error: 'You can only create swap requests for yourself' },
        { status: 403 }
      );
    }

    // Log received data for debugging
    console.log('📥 Swap request data received:', {
      fromDriverUID,
      toDriverUID,
      busId,
      routeId,
      timePeriod
    });

    // Validate required fields
    if (!toDriverUID || !busId || !routeId) {
      console.error('❌ Missing required fields:', { toDriverUID, busId, routeId });
      return NextResponse.json(
        { error: 'Missing required fields: toDriverUID, busId, routeId' },
        { status: 400 }
      );
    }

    // Validate time period
    if (!timePeriod || !timePeriod.type) {
      console.error('❌ Invalid time period:', timePeriod);
      return NextResponse.json(
        { error: 'Time period is required' },
        { status: 400 }
      );
    }

    // Create the swap request
    const result = await DriverSwapService.createSwapRequest(
      fromDriverUID,
      toDriverUID,
      busId,
      routeId,
      timePeriod
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to create swap request' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      requestId: result.requestId,
      message: 'Swap request created successfully'
    });

  } catch (error: any) {
    console.error('Error in driver swap request creation:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    // Get authentication token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('❌ No authorization header');
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const decodedToken = await auth.verifyIdToken(token);
    const userUID = decodedToken.uid;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const busId = searchParams.get('busId');
    const type = searchParams.get('type'); // 'incoming' | 'outgoing' | 'all'

    console.log('📥 GET swap requests query:', { userUID: userUID.substring(0, 8), status, busId, type });

    // Import Firestore here to query
    const { db } = await import('@/lib/firebase-admin');
    
    let query = db.collection('driver_swap_requests');

    // Filter by type
    if (type === 'incoming') {
      query = query.where('toDriverUID', '==', userUID) as any;
    } else if (type === 'outgoing') {
      query = query.where('fromDriverUID', '==', userUID) as any;
    } else {
      // All - both incoming and outgoing (would need compound query)
      // For now, we'll fetch all and filter in memory
    }

    if (status) {
      query = query.where('status', '==', status) as any;
    }

    if (busId) {
      query = query.where('busId', '==', busId) as any;
    }

    // Try to order by createdAt, but fall back to unordered if index doesn't exist
    let snapshot;
    try {
      snapshot = await query.orderBy('createdAt', 'desc').limit(50).get();
    } catch (indexError) {
      console.warn('⚠️ Firestore index missing for orderBy, fetching unordered:', indexError);
      snapshot = await query.limit(50).get();
    }

    const requests = snapshot.docs.map((doc: DocumentSnapshot) => ({
      id: doc.id,
      ...doc.data()
    }));

    // If type is 'all', filter in memory
    let filteredRequests = type === 'all' 
      ? requests.filter((r: any) => r.fromDriverUID === userUID || r.toDriverUID === userUID)
      : requests;

    // Sort in memory if we couldn't order in Firestore
    filteredRequests = filteredRequests.sort((a: any, b: any) => {
      const aTime = a.createdAt?.toDate?.() || a.createdAt || 0;
      const bTime = b.createdAt?.toDate?.() || b.createdAt || 0;
      return bTime - aTime;
    });

    return NextResponse.json({
      success: true,
      requests: filteredRequests
    });

  } catch (error: any) {
    console.error('❌ Error fetching swap requests:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3)
    });
    return NextResponse.json(
      { 
        error: error.message || 'Internal server error',
        success: false,
        requests: [] // Return empty array to prevent client crashes
      },
      { status: 500 }
    );
  }
}
