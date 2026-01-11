import { NextResponse } from 'next/server';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';

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

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken, waitingFlagId } = body;

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

    // Get the waiting flag from Supabase
    const { data: waitingFlag, error: selectError } = await supabase
      .from('waiting_flags')
      .select('*')
      .eq('id', waitingFlagId)
      .single();

    if (selectError || !waitingFlag) {
      return NextResponse.json({ error: 'Waiting flag not found' }, { status: 404 });
    }

    // Verify that the driver is assigned to the same bus
    const driverData = driverDoc.data();
    if (driverData?.assignedBusId !== waitingFlag.bus_id) {
      return NextResponse.json({ error: 'Driver is not assigned to this bus' }, { status: 403 });
    }

    // Update waiting flag status to acknowledged
    const { error: updateError } = await supabase
      .from('waiting_flags')
      .update({ status: 'acknowledged' })
      .eq('id', waitingFlagId);

    if (updateError) {
      return NextResponse.json({ error: 'Failed to acknowledge waiting flag' }, { status: 500 });
    }

    // Send FCM notification to student
    try {
      // Get FCM tokens for this student
      const tokensSnapshot = await adminDb
        .collection('fcm_tokens')
        .where('userUid', '==', waitingFlag.student_uid)
        .get();

      const studentTokens: string[] = [];
      tokensSnapshot.docs.forEach((tokenDoc: any) => {
        studentTokens.push(tokenDoc.data().deviceToken);
      });

      // Send FCM notification
      if (studentTokens.length > 0) {
        const message = {
          notification: {
            title: 'Bus Acknowledged',
            body: `The bus driver has acknowledged your waiting request`
          },
          tokens: studentTokens
        };

        await auth.messaging().sendMulticast(message);
      }
    } catch (fcmError) {
      console.error('Error sending FCM notification:', fcmError);
    }

    return NextResponse.json({ 
      success: true,
      message: 'Waiting flag acknowledged successfully'
    });
  } catch (error: any) {
    console.error('Error acknowledging waiting flag:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to acknowledge waiting flag' },
      { status: 500 }
    );
  }
}