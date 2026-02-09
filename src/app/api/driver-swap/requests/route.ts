import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';
import { DriverSwapSupabaseService } from '@/lib/driver-swap-supabase';
import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    // Get driver and bus details from Firestore for names
    const [fromDriverDoc, toDriverDoc, busDoc] = await Promise.all([
      adminDb.collection('drivers').doc(fromDriverUID).get(),
      adminDb.collection('drivers').doc(toDriverUID).get(),
      adminDb.collection('buses').doc(busId).get()
    ]);

    const fromDriverData = fromDriverDoc.data();
    const toDriverData = toDriverDoc.data();
    const busData = busDoc.data();

    const fromDriverName = fromDriverData?.fullName || fromDriverData?.name || 'Driver';
    const toDriverName = toDriverData?.fullName || toDriverData?.name || 'Driver';
    const busNumber = busData?.busNumber || busId;

    // Get route name if available
    let routeName = '';
    if (routeId) {
      const routeDoc = await adminDb.collection('routes').doc(routeId).get();
      routeName = routeDoc.data()?.routeName || routeDoc.data()?.name || '';
    }

    // Check if candidate driver has a bus (for TRUE SWAP)
    let swapType: 'assignment' | 'swap' = 'assignment';
    let secondaryBusId = undefined;
    let secondaryBusNumber = undefined;
    let secondaryRouteId = undefined;
    let secondaryRouteName = undefined;

    const candidateBusId = toDriverData?.assignedBusId || toDriverData?.busId;

    // Check if candidate bus is valid (not reserved/unassigned)
    const isCandidateReserved = !candidateBusId ||
      (typeof candidateBusId === 'string' && ['reserved', 'none', 'unassigned'].includes(candidateBusId.toLowerCase()));

    if (!isCandidateReserved) {
      console.log('🔄 Candidate has bus, setting as TRUE SWAP:', candidateBusId);
      swapType = 'swap';
      secondaryBusId = candidateBusId;

      // Get secondary bus details
      const secondaryBusDoc = await adminDb.collection('buses').doc(candidateBusId).get();
      const secondaryBusData = secondaryBusDoc.data();

      secondaryBusNumber = secondaryBusData?.busNumber || candidateBusId;
      secondaryRouteId = secondaryBusData?.routeId || secondaryBusData?.assignedRouteId;

      if (secondaryRouteId) {
        const secRouteDoc = await adminDb.collection('routes').doc(secondaryRouteId).get();
        secondaryRouteName = secRouteDoc.data()?.routeName || secRouteDoc.data()?.name;
      }
    }

    // Create the swap request using Supabase
    const result = await DriverSwapSupabaseService.createSwapRequest({
      fromDriverUID,
      fromDriverName,
      toDriverUID,
      toDriverName,
      busId,
      busNumber,
      routeId,
      routeName,
      secondaryBusId,
      secondaryBusNumber,
      secondaryRouteId,
      secondaryRouteName,
      startTime: timePeriod.startTime,
      endTime: timePeriod.endTime,
      timePeriodType: timePeriod.type,
      swapType
    });

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
    const type = searchParams.get('type') || 'all'; // 'incoming' | 'outgoing' | 'all'

    console.log('📥 GET swap requests query (Supabase):', { userUID: userUID.substring(0, 8), status, busId, type });

    // Use Supabase for fetching
    const result = await DriverSwapSupabaseService.getSwapRequests({
      driverUid: userUID,
      type: type as 'incoming' | 'outgoing' | 'all',
      status: status || undefined
    });

    if (result.error) {
      console.error('❌ Supabase error:', result.error);
      return NextResponse.json(
        { error: result.error, success: false, requests: [] },
        { status: 500 }
      );
    }

    // Filter by busId if provided
    let requests = result.requests;
    if (busId) {
      requests = requests.filter((r: any) => r.busId === busId);
    }

    return NextResponse.json({
      success: true,
      requests
    });

  } catch (error: any) {
    console.error('❌ Error fetching swap requests:', error);
    return NextResponse.json(
      {
        error: error.message || 'Internal server error',
        success: false,
        requests: []
      },
      { status: 500 }
    );
  }
}
