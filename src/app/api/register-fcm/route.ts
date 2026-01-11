import { NextResponse } from 'next/server';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

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
    const { idToken, deviceToken, platform } = body;

    // Verify Firebase ID token
    if (!auth) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }
    
    const decodedToken = await auth.verifyIdToken(idToken);
    const userUid = decodedToken.uid;

    // Validate input
    if (!deviceToken || !platform) {
      return NextResponse.json(
        { error: 'Device token and platform are required' },
        { status: 400 }
      );
    }

    // Store FCM token in Firestore
    await adminDb.collection('fcm_tokens').add({
      userUid,
      deviceToken,
      platform,
      createdAt: new Date()
    });

    return NextResponse.json({ 
      success: true,
      message: 'FCM token registered successfully'
    });
  } catch (error: any) {
    console.error('Error registering FCM token:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to register FCM token' },
      { status: 500 }
    );
  }
}