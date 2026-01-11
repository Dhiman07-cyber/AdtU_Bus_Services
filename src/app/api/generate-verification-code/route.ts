import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import CryptoJS from 'crypto-js';
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    });
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK:', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { applicationId } = await request.json();

    if (!applicationId) {
      return NextResponse.json(
        { success: false, error: 'Missing applicationId' },
        { status: 400 }
      );
    }

    // Get the application
    const applicationDoc = await getDoc(doc(db, 'applications', applicationId));
    
    if (!applicationDoc.exists()) {
      return NextResponse.json(
        { success: false, error: 'Application not found' },
        { status: 404 }
      );
    }

    const applicationData = applicationDoc.data();

    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Hash the verification code for security
    const hashedCode = CryptoJS.SHA256(verificationCode).toString();
    
    // Update application with verification details
    await updateDoc(doc(db, 'applications', applicationId), {
      verification: {
        ...applicationData.verification,
        codeHash: hashedCode,
        codeExpiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes from now
        codeStatus: 'sent'
      },
      status: 'code_sent'
    });

    // Create notification for the moderator
    const notificationData = {
      title: 'Student Verification Code',
      message: `Verification code for application ${applicationId.substring(0, 8)}: ${verificationCode}`,
      type: 'verification_code',
      audience: [`Moderator:${applicationData.verification.moderatorUID}`],
      meta: {
        applicationId,
        codeSentToModeratorUID: applicationData.verification.moderatorUID
      },
      status: 'sent',
      createdBy: 'system',
      createdAt: new Date()
    };

    await addDoc(collection(db, 'notifications'), notificationData);

    // Send FCM notification to moderator
    try {
      // Get FCM tokens for the moderator
      const fcmTokensRef = collection(db, 'fcm_tokens');
      const q = query(
        fcmTokensRef,
        where('userUid', '==', applicationData.verification.moderatorUID)
      );
      
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const tokens = querySnapshot.docs.map((docSnapshot: any) => docSnapshot.data().deviceToken);
        const messaging = admin.messaging();
        
        // Send notification to all devices
        const message = {
          notification: {
            title: 'Student Verification Code',
            body: `Verification code for application ${applicationId.substring(0, 8)}: ${verificationCode}`
          },
          tokens: tokens
        };
        
        // Send to each token individually to avoid token limit issues
        for (const token of tokens) {
          try {
            await messaging.send({
              token,
              notification: {
                title: 'Student Verification Code',
                body: `Verification code for application ${applicationId.substring(0, 8)}: ${verificationCode}`
              }
            });
          } catch (error) {
            console.error('Error sending to token:', token, error);
          }
        }
      }
    } catch (fcmError) {
      console.error('Error sending FCM notification:', fcmError);
      // Don't fail the whole request if FCM fails
    }

    return NextResponse.json({
      success: true,
      message: 'Verification code generated and sent to moderator'
    });
  } catch (error) {
    console.error('Error generating verification code:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate verification code' },
      { status: 500 }
    );
  }
}