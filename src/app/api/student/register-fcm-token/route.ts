import { NextResponse } from 'next/server';
import { auth, db as adminDb, FieldValue } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken, fcmToken } = body;

    // Get token from either body or Authorization header
    let token = idToken;
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token || !fcmToken) {
      return NextResponse.json(
        { error: 'Missing required fields: idToken, fcmToken' },
        { status: 400 }
      );
    }

    if (!auth) {
      return NextResponse.json(
        { error: 'Firebase Admin not initialized' },
        { status: 500 }
      );
    }

    // Verify Firebase ID token
    let decodedToken;
    let studentUid;
    
    try {
      decodedToken = await auth.verifyIdToken(token);
      studentUid = decodedToken.uid;
      console.log('🔔 Registering FCM token for student:', studentUid);
    } catch (tokenError) {
      console.error('❌ Token verification failed:', tokenError);
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Store FCM token in fcm_tokens collection
    try {
      const tokenDocId = `${studentUid}_${Date.now()}`;
      console.log('💾 Storing FCM token for student:', studentUid, 'with ID:', tokenDocId);

      await adminDb.collection('fcm_tokens').doc(tokenDocId).set({
        userUid: studentUid,
        deviceToken: fcmToken,
        platform: 'web', // or detect platform
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      console.log('✅ FCM token registered successfully for student:', studentUid);

      return NextResponse.json({
        success: true,
        message: 'FCM token registered successfully',
        studentUid: studentUid,
        fcmTokenPreview: fcmToken.substring(0, 20) + '...'
      });

    } catch (tokenError: any) {
      console.error('❌ Error storing FCM token:', tokenError);
      return NextResponse.json(
        { error: 'Failed to register FCM token' },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('❌ Error registering FCM token:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to register FCM token' },
      { status: 500 }
    );
  }
}
