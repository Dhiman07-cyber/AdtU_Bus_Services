import { NextRequest, NextResponse } from 'next/server';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { cert } from 'firebase-admin/app';

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
    const { trip_id, bus_id, driver_uid, route_id, started_at } = body;

    if (!trip_id || !bus_id || !driver_uid || !route_id) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 1. Create trip record in Firestore
    await db.collection('trips').doc(trip_id).set({
      trip_id,
      bus_id,
      driver_uid,
      route_id,
      started_at: started_at || new Date().toISOString(),
      status: 'active',
      created_at: new Date().toISOString(),
    });

    console.log('✅ Trip created:', trip_id);

    // 2. Get all students for this route
    const studentsSnapshot = await db
      .collection('students')
      .where('routeId', '==', route_id)
      .get();

    const students = studentsSnapshot.docs.map((doc: any) => ({
      uid: doc.id,
      ...doc.data(),
    }));

    console.log(`📚 Found ${students.length} students for route ${route_id}`);

    // 3. Create in-app trip notification for each student
    const notificationPromises = students.map(async (student: any) => {
      return db.collection('notifications').add({
        type: 'trip',
        title: 'Bus Trip Started',
        message: `Your bus (${bus_id}) has started the trip on ${route_id}. Track it live now!`,
        audience: {
          scope: 'route',
          routes: [route_id],
        },
        author: {
          uid: driver_uid,
          role: 'driver',
        },
        tripId: trip_id,
        busId: bus_id,
        routeId: route_id,
        createdAt: new Date(),
        startDate: new Date(),
        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      });
    });

    await Promise.all(notificationPromises);
    console.log('✅ In-app notifications created');

    // 4. Send FCM push notifications (high priority)
    const fcmTokensSnapshot = await db
      .collection('fcm_tokens')
      .where('role', '==', 'student')
      .get();

    const tokens: string[] = [];
    const studentUids = students.map((s: any) => s.uid);

    fcmTokensSnapshot.docs.forEach((doc: any) => {
      const data = doc.data();
      if (studentUids.includes(data.userId) && data.token) {
        tokens.push(data.token);
      }
    });

    if (tokens.length > 0) {
      try {
        const fcmMessage = {
          notification: {
            title: '🚌 Bus Trip Started!',
            body: `Your bus has started the trip. Track it live now!`,
          },
          data: {
            type: 'trip',
            trip_id: trip_id,
            bus_id: bus_id,
            route_id: route_id,
            action: 'started',
          },
          android: {
            priority: 'high' as const,
          },
          apns: {
            headers: {
              'apns-priority': '10',
            },
          },
        };

        const response = await messaging.sendEachForMulticast({
          tokens,
          ...fcmMessage,
        });

        console.log(`✅ FCM sent: ${response.successCount}/${tokens.length} successful`);
      } catch (fcmError) {
        console.error('❌ FCM error:', fcmError);
        // Don't fail the whole request if FCM fails
      }
    }

    return NextResponse.json({
      success: true,
      trip_id,
      students_notified: students.length,
      fcm_sent: tokens.length,
    });
  } catch (error: any) {
    console.error('❌ Error starting trip:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}



