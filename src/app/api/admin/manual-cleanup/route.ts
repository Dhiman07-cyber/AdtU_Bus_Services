/**
 * API Route: Manual Firestore Cleanup (Admin Only)
 * POST /api/admin/manual-cleanup
 * 
 * Simplified cleanup route - token/scan cleanup no longer needed
 * since the new QR system uses student UID directly (no temporary tokens)
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { CleanupService } from '@/lib/cleanup-service';

export async function POST(request: NextRequest) {
  try {
    // Verify admin authentication
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();

    if (!userDoc.exists || !['admin', 'moderator'].includes(userDoc.data()?.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    console.log('🧹 Manual cleanup initiated by admin:', decodedToken.uid);

    // Run opportunistic cleanup (swaps and audit logs only)
    await CleanupService.runOpportunisticCleanup();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      initiatedBy: decodedToken.uid,
      message: 'Manual cleanup completed. Note: The QR system now uses student UID directly - no token cleanup needed.'
    });
  } catch (error: any) {
    console.error('Manual cleanup error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();

    if (!userDoc.exists || !['admin', 'moderator'].includes(userDoc.data()?.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get collection counts for monitoring (remaining relevant collections)
    const [studentsSnapshot, driversSnapshot, busesSnapshot] = await Promise.all([
      adminDb.collection('students').get(),
      adminDb.collection('drivers').get(),
      adminDb.collection('buses').get()
    ]);

    // Get active students count
    const activeStudentsSnapshot = await adminDb.collection('students')
      .where('status', '==', 'active')
      .get();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      collectionStats: {
        students: {
          total: studentsSnapshot.size,
          active: activeStudentsSnapshot.size
        },
        drivers: {
          total: driversSnapshot.size
        },
        buses: {
          total: busesSnapshot.size
        }
      },
      message: 'Collection statistics retrieved. Note: busPassTokens and scans collections are no longer used.'
    });
  } catch (error: any) {
    console.error('Collection stats error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
