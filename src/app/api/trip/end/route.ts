import { NextRequest, NextResponse } from 'next/server';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { cert } from 'firebase-admin/app';
import { CleanupService } from '@/lib/cleanup-service';

// Initialize Firebase Admin
let adminApp: any;
let db: any;
let messaging: any;

try {
  if (!getApps().length) {
    adminApp = initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } else {
    adminApp = getApps()[0];
  }
  
  db = getFirestore(adminApp);
  messaging = getMessaging(adminApp);
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { trip_id, bus_id, driver_uid } = body;

    if (!trip_id) {
      return NextResponse.json(
        { success: false, error: 'Missing trip_id' },
        { status: 400 }
      );
    }

    // 1. Update trip record
    await db.collection('trips').doc(trip_id).update({
      ended_at: new Date().toISOString(),
      status: 'ended',
      updated_at: new Date().toISOString(),
    });

    console.log('✅ Trip ended:', trip_id);

    // 1.5. Trigger cleanup for this specific trip
    if (bus_id && driver_uid) {
      await CleanupService.cleanupOnTripEnd(bus_id, driver_uid);
      console.log('✅ Trip-specific cleanup completed');
    }

    // 2. Delete/mark all trip notifications for this trip_id
    const notificationsSnapshot = await db
      .collection('notifications')
      .where('type', '==', 'trip')
      .where('tripId', '==', trip_id)
      .get();

    const deletePromises = notificationsSnapshot.docs.map((doc: any) => 
      doc.ref.delete()
    );

    await Promise.all(deletePromises);
    console.log(`✅ Deleted ${deletePromises.length} trip notifications`);

    // 3. Optionally send FCM "Trip Ended" notification
    // (Commented out - enable if needed)
    /*
    const tripDoc = await db.collection('trips').doc(trip_id).get();
    const tripData = tripDoc.data();
    
    if (tripData) {
      const studentsSnapshot = await db
        .collection('students')
        .where('routeId', '==', tripData.route_id)
        .get();
      
      const studentUids = studentsSnapshot.docs.map((doc: any) => doc.id);
      
      const fcmTokensSnapshot = await db
        .collection('fcm_tokens')
        .where('role', '==', 'student')
        .get();

      const tokens: string[] = [];
      fcmTokensSnapshot.docs.forEach((doc: any) => {
        const data = doc.data();
        if (studentUids.includes(data.userId) && data.token) {
          tokens.push(data.token);
        }
      });

      if (tokens.length > 0) {
        await messaging.sendEachForMulticast({
          tokens,
          notification: {
            title: '🏁 Bus Trip Ended',
            body: 'Your bus has completed the trip. Thank you!',
          },
          data: {
            type: 'trip',
            trip_id: trip_id,
            action: 'ended',
          },
        });
      }
    }
    */

    // Trigger opportunistic cleanup in background
    CleanupService.runOpportunisticCleanup().catch(err => {
      console.error('Background cleanup error:', err);
    });

    return NextResponse.json({
      success: true,
      trip_id,
      notifications_deleted: deletePromises.length,
    });
  } catch (error: any) {
    console.error('❌ Error ending trip:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}



