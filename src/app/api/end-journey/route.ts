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

    // Update Firestore: buses/{busId} → set status = "idle", lastEndedAt = now()
    // Use set with merge to create document if it doesn't exist
    await adminDb.collection('buses').doc(busId).set({
      status: 'idle',
      lastEndedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    // Reset bus passenger count to 0 when journey ends
    try {
      await adminDb.collection('buses').doc(busId).set({
        currentPassengerCount: 0
      }, { merge: true });
    } catch (busError) {
      console.error('Error resetting bus passenger count:', busError);
    }

    // Use the new Supabase service to end journey
    const success = await supabaseService.endJourney(busId, driverUid);
    
    if (!success) {
      return NextResponse.json({ error: 'Failed to update Supabase journey data' }, { status: 500 });
    }

    // Optionally aggregate and store daily attendance summary
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Get attendance records for today for this bus
      const attendanceSnapshot = await adminDb
        .collection('attendance')
        .where('busId', '==', busId)
        .where('timestamp', '>=', today)
        .where('timestamp', '<', tomorrow)
        .get();
      
      const attendanceCount = attendanceSnapshot.docs.length;
      
      // Create or update daily attendance summary
      const summaryId = `${busId}_${today.toISOString().split('T')[0]}`;
      await adminDb.collection('daily_attendance_summary').doc(summaryId).set({
        busId,
        date: FieldValue.serverTimestamp(),
        attendanceCount,
        driverUid,
        lastUpdated: FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (summaryError) {
      console.error('Error creating attendance summary:', summaryError);
    }

    // Send FCM notification to all students assigned to this bus
    try {
      const studentsSnapshot = await adminDb
        .collection('students')
        .where('assignedBusId', '==', busId)
        .get();

      const studentTokens: string[] = [];

      for (const doc of studentsSnapshot.docs) {
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
        await auth.messaging().sendEach(
          studentTokens.map(token => ({
            token,
            notification: {
              title: 'Journey Ended',
              body: `Bus ${busId} has finished its journey`
            }
          }))
        );
      }
    } catch (fcmError: any) {
      console.error('Error sending FCM notifications:', fcmError);
    }

    return NextResponse.json({ 
      success: true,
      message: 'Journey ended successfully',
      payload: {
        driverUid,
        busId,
        ts: timestamp
      }
    });
  } catch (error: any) {
    console.error('Error ending journey:', error);
    return NextResponse.json({ error: error.message || 'Failed to end journey' }, { status: 500 });
  }
}