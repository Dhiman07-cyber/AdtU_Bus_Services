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
 * POST /api/admin/swap-bus
 * 
 * Body: { routeId, fromBusId, toBusId, idToken }
 * 
 * Admin-only endpoint to swap buses on a route (for maintenance, etc.)
 * 
 * Atomic actions:
 * - Update routes/{routeId}.currentBusId = toBusId
 * - Update buses/{fromBusId}.status = "maintenance"
 * - Update buses/{toBusId}.status = "active"
 * - Append audit_logs
 * - Broadcast to students on the route
 * - Send FCM notifications
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken, routeId, fromBusId, toBusId } = body;

    // Validate required fields
    if (!idToken || !routeId || !fromBusId || !toBusId) {
      return NextResponse.json(
        { error: 'Missing required fields: idToken, routeId, fromBusId, toBusId' },
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
    const adminUid = decodedToken.uid;

    // Verify user exists and is an admin
    const userDoc = await adminDb.collection('users').doc(adminUid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    if (userData?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized - admin only' },
        { status: 403 }
      );
    }

    // Verify route exists
    const routeDoc = await adminDb.collection('routes').doc(routeId).get();
    if (!routeDoc.exists) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    // Verify both buses exist
    const fromBusDoc = await adminDb.collection('buses').doc(fromBusId).get();
    const toBusDoc = await adminDb.collection('buses').doc(toBusId).get();

    if (!fromBusDoc.exists) {
      return NextResponse.json(
        { error: `Bus ${fromBusId} not found` },
        { status: 404 }
      );
    }

    if (!toBusDoc.exists) {
      return NextResponse.json(
        { error: `Bus ${toBusId} not found` },
        { status: 404 }
      );
    }

    // ===== ATOMIC TRANSACTION =====
    const batch = adminDb.batch();

    // 1. Update route currentBusId
    batch.update(routeDoc.ref, {
      currentBusId: toBusId
    });

    // 2. Update fromBus status to maintenance
    batch.update(fromBusDoc.ref, {
      status: 'maintenance'
    });

    // 3. Update toBus status to active and assign to route
    batch.update(toBusDoc.ref, {
      status: 'active',
      routeId: routeId
    });

    // Commit the batch
    await batch.commit();

    // Log operation (audit_logs moved to Supabase)
    console.log('📝 Bus swapped:', {
      actorUid: adminUid,
      action: 'admin_swap_bus',
      routeId, fromBusId, toBusId,
      timestamp: new Date().toISOString()
    });

    // ===== Post-transaction actions =====

    // Broadcast to route channel
    const channel = supabase.channel(`route_${routeId}`);
    await channel.send({
      type: 'broadcast',
      event: 'bus_swapped',
      payload: {
        routeId,
        fromBusId,
        toBusId,
        timestamp: new Date().toISOString()
      }
    });

    // Send FCM notification to all students on the route
    try {
      const studentsSnapshot = await adminDb
        .collection('students')
        .where('routeId', '==', routeId)
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

      const toBusData = toBusDoc.data();

      if (fcmTokens.length > 0 && auth.messaging) {
        await auth.messaging().sendEach(
          fcmTokens.map(token => ({
            token,
            notification: {
              title: 'Bus Changed',
              body: `Your route bus has been changed to ${toBusData?.busNumber || toBusId}`
            },
            data: {
              type: 'bus_swapped',
              routeId,
              newBusId: toBusId
            }
          }))
        );
      }
    } catch (fcmError) {
      console.error('Error sending FCM notifications:', fcmError);
      // Don't fail the request
    }

    const fromBusData = fromBusDoc.data();
    const toBusData = toBusDoc.data();

    return NextResponse.json({
      success: true,
      message: 'Bus swapped successfully',
      data: {
        routeId,
        fromBus: {
          busId: fromBusId,
          busNumber: fromBusData?.busNumber,
          status: 'maintenance'
        },
        toBus: {
          busId: toBusId,
          busNumber: toBusData?.busNumber,
          status: 'active'
        }
      }
    });

  } catch (error: any) {
    console.error('Error swapping bus:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to swap bus' },
      { status: 500 }
    );
  }
}
