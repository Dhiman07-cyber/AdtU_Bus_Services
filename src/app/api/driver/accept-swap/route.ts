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
 * POST /api/driver/accept-swap
 * 
 * Body: { swapRequestId, idToken }
 * 
 * Validates:
 * - Requester is the toDriverUid
 * 
 * Atomic actions:
 * - Update swap_requests.status = "accepted"
 * - Update buses/{busId}.activeDriverId = toDriverUid
 * - Append audit_logs
 * - Broadcast to students & moderators
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken, swapRequestId } = body;

    // Validate required fields
    if (!idToken || !swapRequestId) {
      return NextResponse.json(
        { error: 'Missing required fields: idToken, swapRequestId' },
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
    const toDriverUid = decodedToken.uid;

    // Verify user exists and is a driver
    const userDoc = await adminDb.collection('users').doc(toDriverUid).get();
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

    // Get swap request
    const swapDoc = await adminDb.collection('swap_requests').doc(swapRequestId).get();
    if (!swapDoc.exists) {
      return NextResponse.json(
        { error: 'Swap request not found' },
        { status: 404 }
      );
    }

    const swapData = swapDoc.data();

    // Validate requester is the target driver
    if (swapData?.toDriverUid !== toDriverUid) {
      return NextResponse.json(
        { error: 'You are not the target driver for this swap request' },
        { status: 403 }
      );
    }

    // Validate swap is still pending
    if (swapData?.status !== 'pending') {
      return NextResponse.json(
        { error: `Swap request is already ${swapData?.status}` },
        { status: 400 }
      );
    }

    const busId = swapData.busId;
    const fromDriverUid = swapData.fromDriverUid;

    // ===== ATOMIC TRANSACTION =====
    // Use Firestore batch for atomicity
    const batch = adminDb.batch();

    // 1. Update swap request status
    batch.update(swapDoc.ref, {
      status: 'accepted',
      acceptedAt: FieldValue.serverTimestamp(),
      handledBy: toDriverUid
    });

    // 2. Update bus activeDriverId
    const busRef = adminDb.collection('buses').doc(busId);
    batch.update(busRef, {
      activeDriverId: toDriverUid
    });

    // Commit the batch
    await batch.commit();

    // Log operation (audit_logs moved to Supabase)
    console.log('📝 Swap accepted:', {
      actorUid: toDriverUid,
      action: 'driver_accept_swap',
      swapRequestId, busId, fromDriverUid, toDriverUid,
      timestamp: new Date().toISOString()
    });

    // ===== Post-transaction actions =====

    // Get bus data for notifications
    const busDoc = await busRef.get();
    const busData = busDoc.data();
    const routeId = busData?.routeId;

    // Update driver status in Supabase if there's an active trip
    if (routeId) {
      const { error: driverStatusError } = await supabase
        .from('driver_status')
        .update({
          driverUid: toDriverUid,
          lastUpdatedAt: new Date().toISOString()
        })
        .eq('busId', busId);

      if (driverStatusError) {
        console.error('Error updating driver status:', driverStatusError);
      }

      // Broadcast to route channel
      const channel = supabase.channel(`route_${routeId}`);
      await channel.send({
        type: 'broadcast',
        event: 'driver_swapped',
        payload: {
          busId,
          routeId,
          fromDriverUid,
          toDriverUid,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Send FCM notification to all students on the bus
    try {
      const studentsSnapshot = await adminDb
        .collection('students')
        .where('assignedBusId', '==', busId)
        .get();

      const fcmTokens: string[] = [];

      for (const doc of studentsSnapshot.docs) {
        const tokensSnapshot = await adminDb
          .collection('fcm_tokens')
          .where('userUid', '==', doc.id)
          .get();

        tokensSnapshot.docs.forEach((tokenDoc: any) => {
          fcmTokens.push(tokenDoc.data().deviceToken);
        });
      }

      if (fcmTokens.length > 0 && auth.messaging) {
        await auth.messaging().sendEach(
          fcmTokens.map(token => ({
            token,
            notification: {
              title: 'Driver Changed',
              body: `Your bus driver has been changed for this trip`
            },
            data: {
              type: 'driver_swapped',
              busId,
              newDriverUid: toDriverUid
            }
          }))
        );
      }
    } catch (fcmError) {
      console.error('Error sending FCM notifications:', fcmError);
      // Don't fail the request
    }

    // Notify the original driver
    try {
      const tokensSnapshot = await adminDb
        .collection('fcm_tokens')
        .where('userUid', '==', fromDriverUid)
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
              title: 'Swap Request Accepted',
              body: `${userData?.name || 'The driver'} has accepted your swap request`
            },
            data: {
              type: 'swap_accepted',
              swapRequestId,
              busId
            }
          }))
        );
      }
    } catch (fcmError) {
      console.error('Error sending FCM notification:', fcmError);
    }

    return NextResponse.json({
      success: true,
      message: 'Swap request accepted successfully',
      data: {
        swapRequestId,
        busId,
        fromDriverUid,
        toDriverUid,
        status: 'accepted'
      }
    });

  } catch (error: any) {
    console.error('Error accepting swap request:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to accept swap request' },
      { status: 500 }
    );
  }
}
