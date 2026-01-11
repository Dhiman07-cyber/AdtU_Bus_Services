import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken, cleanupType, daysOld } = body;

    // Get token from either body or Authorization header
    let token = idToken;
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      return NextResponse.json(
        { error: 'Missing idToken' },
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
    const decodedToken = await auth.verifyIdToken(token);
    const userUid = decodedToken.uid;

    // Check if user is admin (you can adjust this logic)
    const userDoc = await adminDb.collection('users').doc(userUid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    if (userData?.role !== 'admin' && userData?.role !== 'moderator') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const cleanupDays = daysOld || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - cleanupDays);

    console.log(`🧹 Starting Firestore cleanup: ${cleanupType}, older than ${cleanupDays} days`);

    let results: any = {};

    // Cleanup based on type
    switch (cleanupType) {
      case 'trip_sessions':
        // Cleanup old trip sessions
        const oldTripsSnapshot = await adminDb
          .collection('trip_sessions')
          .where('endedAt', '<', cutoffDate)
          .get();

        console.log(`📊 Found ${oldTripsSnapshot.size} old trip sessions to delete`);

        if (oldTripsSnapshot.size > 0) {
          const batch = adminDb.batch();
          oldTripsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
          });
          await batch.commit();
        }

        results.tripSessionsDeleted = oldTripsSnapshot.size;
        break;

      case 'audit_logs':
        // Cleanup old audit logs
        const oldAuditSnapshot = await adminDb
          .collection('audit_logs')
          .where('timestamp', '<', cutoffDate)
          .get();

        console.log(`📊 Found ${oldAuditSnapshot.size} old audit logs to delete`);

        if (oldAuditSnapshot.size > 0) {
          const batch = adminDb.batch();
          oldAuditSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
          });
          await batch.commit();
        }

        results.auditLogsDeleted = oldAuditSnapshot.size;
        break;

      case 'driver_location_updates':
        // Cleanup old location updates (keep only recent ones)
        const oldLocationSnapshot = await adminDb
          .collection('driver_location_updates')
          .where('timestamp', '<', cutoffDate.getTime())
          .get();

        console.log(`📊 Found ${oldLocationSnapshot.size} old location updates to delete`);

        if (oldLocationSnapshot.size > 0) {
          const batch = adminDb.batch();
          oldLocationSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
          });
          await batch.commit();
        }

        results.locationUpdatesDeleted = oldLocationSnapshot.size;
        break;

      case 'all':
        // Cleanup all old data
        const [allOldTrips, allOldAudit, allOldLocations] = await Promise.all([
          adminDb.collection('trip_sessions').where('endedAt', '<', cutoffDate).get(),
          adminDb.collection('audit_logs').where('timestamp', '<', cutoffDate).get(),
          adminDb.collection('driver_location_updates').where('timestamp', '<', cutoffDate.getTime()).get()
        ]);

        console.log(`📊 Found ${allOldTrips.size} trips, ${allOldAudit.size} audit logs, ${allOldLocations.size} location updates to delete`);

        // Delete in batches
        const allBatch = adminDb.batch();
        allOldTrips.docs.forEach(doc => allBatch.delete(doc.ref));
        allOldAudit.docs.forEach(doc => allBatch.delete(doc.ref));
        allOldLocations.docs.forEach(doc => allBatch.delete(doc.ref));
        await allBatch.commit();

        results.tripSessionsDeleted = allOldTrips.size;
        results.auditLogsDeleted = allOldAudit.size;
        results.locationUpdatesDeleted = allOldLocations.size;
        break;

      default:
        return NextResponse.json(
          { error: 'Invalid cleanup type. Use: trip_sessions, audit_logs, driver_location_updates, or all' },
          { status: 400 }
        );
    }

    console.log('✅ Firestore cleanup completed:', results);

    return NextResponse.json({
      success: true,
      message: `Firestore cleanup completed for ${cleanupType}`,
      results,
      cleanupDays,
      cutoffDate: cutoffDate.toISOString()
    });

  } catch (error: any) {
    console.error('❌ Firestore cleanup error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to cleanup Firestore data' },
      { status: 500 }
    );
  }
}

// GET endpoint to check data sizes
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const idToken = searchParams.get('idToken');

    if (!idToken) {
      return NextResponse.json(
        { error: 'Missing idToken' },
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
    const decodedToken = await auth.verifyIdToken(idToken);
    const userUid = decodedToken.uid;

    // Check if user is admin
    const userDoc = await adminDb.collection('users').doc(userUid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    if (userData?.role !== 'admin' && userData?.role !== 'moderator') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Get data sizes
    const [tripsSnapshot, auditSnapshot, locationSnapshot] = await Promise.all([
      adminDb.collection('trip_sessions').get(),
      adminDb.collection('audit_logs').get(),
      adminDb.collection('driver_location_updates').get()
    ]);

    const stats = {
      tripSessions: tripsSnapshot.size,
      auditLogs: auditSnapshot.size,
      locationUpdates: locationSnapshot.size,
      total: tripsSnapshot.size + auditSnapshot.size + locationSnapshot.size
    };

    return NextResponse.json({
      success: true,
      stats
    });

  } catch (error: any) {
    console.error('❌ Stats error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get stats' },
      { status: 500 }
    );
  }
}

