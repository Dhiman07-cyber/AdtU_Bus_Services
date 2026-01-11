import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';
import { createClient } from '@supabase/supabase-js';
import { supabaseService } from '@/lib/supabase-service';
import { FieldValue } from 'firebase-admin/firestore';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken, busId } = body;

    // Verify Firebase ID token
    if (!auth) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }
    
    const decodedToken = await auth.verifyIdToken(idToken);
    const driverUid = decodedToken.uid;

    // Verify that the user exists and is a driver
    const userDoc = await adminDb.collection('users').doc(driverUid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    if (userData?.role !== 'driver') {
      return NextResponse.json({ error: 'User is not authorized as a driver' }, { status: 403 });
    }

    // Verify that the driver is assigned to this bus
    const driverDoc = await adminDb.collection('drivers').doc(driverUid).get();
    if (!driverDoc.exists) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    const driverData = driverDoc.data();
    if (driverData?.assignedBusId !== busId) {
      return NextResponse.json({ error: 'Driver is not assigned to this bus' }, { status: 403 });
    }

    const timestamp = new Date().toISOString();

    // Update Firestore: buses/{busId} → set status = "enroute", driverUID = driverUid, lastStartedAt = now()
    // Use set with merge to create document if it doesn't exist
    await adminDb.collection('buses').doc(busId).set({
      status: 'enroute',
      driverUID: driverUid,
      lastStartedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    // Use the new Supabase service to start journey
    const success = await supabaseService.startJourney(busId, driverUid);
    
    if (!success) {
      return NextResponse.json({ error: 'Failed to initialize Supabase journey data' }, { status: 500 });
    }

    // Send FCM notification to all students assigned to this bus
    try {
      const studentsSnapshot = await adminDb
        .collection('students')
        .where('assignedBusId', '==', busId)
        .get();

      const studentTokens: string[] = [];
      const studentData: any[] = [];

      for (const doc of studentsSnapshot.docs) {
        const student = doc.data();
        studentData.push({ uid: doc.id, ...student });

        // Get FCM tokens for this student
        const tokensSnapshot = await adminDb
          .collection('fcm_tokens')
          .where('userUid', '==', doc.id)
          .get();

        tokensSnapshot.docs.forEach((tokenDoc: any) => {
          studentTokens.push(tokenDoc.data().deviceToken);
        });
      }

      // Send FCM notification
      if (studentTokens.length > 0) {
        const message = {
          notification: {
            title: 'Bus Started',
            body: `Bus ${busId} has started its journey`
          },
          tokens: studentTokens
        };

        await auth.messaging().sendEach(
          studentTokens.map(token => ({
            token,
            notification: {
              title: 'Bus Started',
              body: `Bus ${busId} has started its journey`
            }
          }))
        );
      }
    } catch (fcmError: any) {
      console.error('Error sending FCM notifications:', fcmError);
    }

    return NextResponse.json({ 
      success: true,
      message: 'Journey started successfully',
      payload: {
        driverUid,
        busId,
        ts: timestamp
      }
    });
  } catch (error: any) {
    console.error('Error starting journey:', error);
    return NextResponse.json({ error: error.message || 'Failed to start journey' }, { status: 500 });
  }
}