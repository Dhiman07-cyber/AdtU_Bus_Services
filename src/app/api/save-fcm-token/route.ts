import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';

export async function POST(request: NextRequest) {
  try {
    const { userUid, token, platform } = await request.json();

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