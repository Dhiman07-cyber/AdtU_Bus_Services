import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * POST /api/driver/swap-request
 * 
 * Body: { busId, toDriverUid, idToken }
 * 
 * Creates a swap request from current driver to another driver
 * Notifies the target driver via FCM
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken, busId, toDriverUid } = body;

    // Validate required fields
    if (!idToken || !busId || !toDriverUid) {
      return NextResponse.json(
        { error: 'Missing required fields: idToken, busId, toDriverUid' },
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
    const fromDriverUid = decodedToken.uid;

    // Verify user exists and is a driver
    const userDoc = await adminDb.collection('users').doc(fromDriverUid).get();
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

    // Verify target user is also a driver
    const toUserDoc = await adminDb.collection('users').doc(toDriverUid).get();
    if (!toUserDoc.exists || toUserDoc.data()?.role !== 'driver') {
      return NextResponse.json(
        { error: 'Target user is not a driver' },
        { status: 400 }
      );
    }

    // Verify bus exists and current driver is assigned
    const busDoc = await adminDb.collection('buses').doc(busId).get();
    if (!busDoc.exists) {
      return NextResponse.json({ error: 'Bus not found' }, { status: 404 });
    }

    const busData = busDoc.data();

    // Check both new fields (assignedDriverId, activeDriverId) and legacy field (driverUID)
    const isAssignedDriver =
      busData?.assignedDriverId === fromDriverUid ||
      busData?.activeDriverId === fromDriverUid ||
      busData?.driverUID === fromDriverUid;

    if (!isAssignedDriver) {
      return NextResponse.json(
        { error: 'You are not assigned to this bus' },
        { status: 403 }
      );
    }

    // Check for existing pending swap requests
    const existingSwaps = await adminDb
      .collection('swap_requests')
      .where('busId', '==', busId)
      .where('fromDriverUid', '==', fromDriverUid)
      .where('status', '==', 'pending')
      .get();

    if (!existingSwaps.empty) {
      return NextResponse.json(
        { error: 'You already have a pending swap request for this bus' },
        { status: 400 }
      );
    }

    const requestId = `swap_${busId}_${new Date().getTime()}`;

    // Create swap request
    await adminDb.collection('swap_requests').doc(requestId).set({
      id: requestId,
      busId,
      fromDriverUid,
      toDriverUid,
      status: 'pending',
      requestedAt: FieldValue.serverTimestamp(),
      acceptedAt: null,
      handledBy: null
    });

    // Log operation (audit_logs moved to Supabase)
    console.log('📝 Swap request created:', {
      actorUid: fromDriverUid,
      action: 'driver_create_swap_request',
      requestId, busId, toDriverUid,
      timestamp: new Date().toISOString()
    });

    // Send FCM notification to target driver
    try {
      const tokensSnapshot = await adminDb
        .collection('fcm_tokens')
        .where('userUid', '==', toDriverUid)
        .get();

      const driverTokens: string[] = [];
      tokensSnapshot.docs.forEach((tokenDoc: any) => {
        driverTokens.push(tokenDoc.data().deviceToken);
      });

      if (driverTokens.length > 0 && auth.messaging) {
        await auth.messaging().sendEach(
          driverTokens.map(token => ({
            token,
            notification: {
              title: 'Driver Swap Request',
              body: `${userData?.name || 'A driver'} wants to swap bus duty with you`
            },
            data: {
              type: 'swap_request',
              requestId,
              fromDriverUid,
              busId
            }
          }))
        );
      }
    } catch (fcmError) {
      console.error('Error sending FCM notification:', fcmError);
      // Don't fail the request
    }

    return NextResponse.json({
      success: true,
      message: 'Swap request created successfully',
      data: {
        requestId,
        busId,
        fromDriverUid,
        toDriverUid,
        status: 'pending'
      }
    });

  } catch (error: any) {
    console.error('Error creating swap request:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create swap request' },
      { status: 500 }
    );
  }
}
