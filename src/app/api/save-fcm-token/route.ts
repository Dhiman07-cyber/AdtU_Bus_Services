import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { verifyTokenOnly } from '@/lib/security/api-auth';
import { checkRateLimit, createRateLimitId } from '@/lib/security/rate-limiter';

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Verify authentication
    const user = await verifyTokenOnly(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { userUid, token, platform } = await request.json();

    // SECURITY: Users can only save tokens for their own UID
    if (userUid !== user.uid) {
      return NextResponse.json(
        { success: false, error: 'Cannot save tokens for other users' },
        { status: 403 }
      );
    }

    // SECURITY: Rate limit token saves (10 per minute)
    const rateLimitId = createRateLimitId(user.uid, 'save-fcm-token');
    const rateCheck = checkRateLimit(rateLimitId, 10, 60000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests' },
        { status: 429 }
      );
    }

    if (!userUid || !token || !platform) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if token already exists for this user
    const fcmTokensRef = collection(db, 'fcm_tokens');
    const q = query(
      fcmTokensRef,
      where('userUid', '==', userUid),
      where('deviceToken', '==', token)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      // Add new token
      await addDoc(fcmTokensRef, {
        userUid,
        deviceToken: token,
        platform,
        createdAt: new Date(),
      });
    } else {
      // Update existing token timestamp
      const docRef = querySnapshot.docs[0].ref;
      await updateDoc(docRef, {
        updatedAt: new Date(),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving FCM token:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save FCM token' },
      { status: 500 }
    );
  }
}