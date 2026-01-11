import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken, busId, studentName, message } = body;

    let token = idToken;
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token || !busId || !studentName) {
      return NextResponse.json(
        { error: 'Missing required fields: idToken, busId, studentName' },
        { status: 400 }
      );
    }

    if (!auth) {
      return NextResponse.json(
        { error: 'Firebase Admin not initialized' },
        { status: 500 }
      );
    }

    // Verify token
    const decodedToken = await auth.verifyIdToken(token);
    const studentUid = decodedToken.uid;

    console.log('🔔 Student notifying driver:', { studentUid, busId, studentName });

    // Find the driver assigned to this bus
    const driversSnapshot = await adminDb
      .collection('drivers')
      .where('assignedBusId', '==', busId)
      .limit(1)
      .get();

    if (driversSnapshot.empty) {
      // Try alternative field name
      const driversSnapshot2 = await adminDb
        .collection('drivers')
        .where('busId', '==', busId)
        .limit(1)
        .get();

      if (driversSnapshot2.empty) {
        console.warn('⚠️ No driver found for bus:', busId);
        return NextResponse.json({
          success: false,
          message: 'No driver found for this bus'
        });
      }
    }

    const drivers = driversSnapshot.empty ? [] : driversSnapshot.docs;
    console.log(`📱 Found ${drivers.length} driver(s) for bus ${busId}`);

    // Note: FCM notification to driver would go here
    // For now, we're using Supabase broadcast which is already handled client-side

    return NextResponse.json({
      success: true,
      message: 'Driver notification queued',
      driversNotified: drivers.length
    });

  } catch (error: any) {
    console.error('Error notifying driver:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to notify driver' },
      { status: 500 }
    );
  }
}







