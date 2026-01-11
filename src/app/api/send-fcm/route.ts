import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export async function POST(request: NextRequest) {
  try {
    const { userId, title, body, data, notificationId } = await request.json();

    if (!userId || (!title && !notificationId)) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // If notificationId is provided, fetch notification details
    let notificationData = { title, body, data };
    if (notificationId) {
      const notificationDoc = await getDoc(doc(db, 'notifications', notificationId));
      if (notificationDoc.exists()) {
        notificationData = notificationDoc.data() as any;
      }
    }

    // Get FCM tokens for the user
    const fcmTokensRef = collection(db, 'fcm_tokens');
    const q = query(fcmTokensRef, where('userUid', '==', userId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return NextResponse.json(
        { success: false, error: 'No FCM tokens found for user' },
        { status: 404 }
      );
    }

    // Send notification to all devices
    const tokens = querySnapshot.docs.map(doc => doc.data().deviceToken);
    const messaging = admin.messaging();
    
    // Send to each token individually to avoid token limit issues
    let successCount = 0;
    let failureCount = 0;
    
    for (const token of tokens) {
      try {
        await messaging.send({
          token,
          notification: {
            title: notificationData.title,
            body: notificationData.body,
          },
          data: notificationData.data || {},
        });
        successCount++;
      } catch (error) {
        console.error('Error sending to token:', token, error);
        failureCount++;
      }
    }

    // Update notification status if notificationId was provided
    if (notificationId) {
      await updateDoc(doc(db, 'notifications', notificationId), {
        status: 'sent',
        sentAt: new Date(),
      });
    }

    return NextResponse.json({
      success: true,
      sentCount: successCount,
      failedCount: failureCount,
    });
  } catch (error) {
    console.error('Error sending FCM notification:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}