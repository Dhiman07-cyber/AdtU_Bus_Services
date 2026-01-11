import { NextResponse } from 'next/server';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Initialize Firebase Admin SDK
let adminApp: any;
let auth: any;
let adminDb: any;

try {
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    if (!getApps().length) {
      // Fix private key parsing issue
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
      adminApp = initializeApp({
        credential: require('firebase-admin').cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
    } else {
      adminApp = getApps()[0];
    }

    auth = getAuth(adminApp);
    adminDb = getFirestore(adminApp);
  }
} catch (error) {
  console.log('Failed to initialize Firebase Admin SDK:', error);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken, swapData } = body;

    // Verify Firebase ID token
    if (!auth) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }
    
    const decodedToken = await auth.verifyIdToken(idToken);
    const driverUid = decodedToken.uid;

    // Verify that the driver exists
    const driverDoc = await adminDb.collection('drivers').doc(driverUid).get();
    if (!driverDoc.exists) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    // Create driver swap request in Firestore
    const swapId = await adminDb.collection('driver_swaps').add({
      ...swapData,
      requesterUid: driverUid,
      status: 'pending',
      requestedAt: adminDb.FieldValue.serverTimestamp()
    });

    // Send FCM notification to moderators
    try {
      // Get all moderators
      const moderatorsSnapshot = await adminDb.collection('moderators').get();
      const moderatorTokens: string[] = [];

      for (const doc of moderatorsSnapshot.docs) {
        // Get FCM tokens for this moderator
        const tokensSnapshot = await adminDb
          .collection('fcm_tokens')
          .where('userUid', '==', doc.id)
          .get();

        tokensSnapshot.docs.forEach((tokenDoc: any) => {
          moderatorTokens.push(tokenDoc.data().deviceToken);
        });
      }

      // Send FCM notification
      if (moderatorTokens.length > 0) {
        const message = {
          notification: {
            title: 'Bus Swap Request',
            body: `Driver ${driverDoc.data().fullName || driverUid} has requested a bus swap`
          },
          tokens: moderatorTokens
        };

        await auth.messaging().sendMulticast(message);
      }
    } catch (fcmError) {
      console.error('Error sending FCM notifications to moderators:', fcmError);
    }

    return NextResponse.json({ 
      success: true,
      message: 'Bus swap request submitted successfully',
      swapId: swapId.id
    });
  } catch (error: any) {
    console.error('Error submitting bus swap request:', error);
    return NextResponse.json({ error: error.message || 'Failed to submit bus swap request' }, { status: 500 });
  }
}