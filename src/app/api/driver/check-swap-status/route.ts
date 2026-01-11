import { NextResponse } from 'next/server';
import { auth } from '@/lib/firebase-admin';
import { CleanupService } from '@/lib/cleanup-service';
import { db as adminDb } from '@/lib/firebase-admin';

/**
 * Check driver's swap status and trigger cleanup
 * Called when driver logs in or accesses dashboard
 */
export async function POST(request: Request) {
  try {
    // Get authentication token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const decodedToken = await auth.verifyIdToken(token);
    const driverUid = decodedToken.uid;

    // Find driver's assigned bus(es)
    const busesSnapshot = await adminDb
      .collection('buses')
      .where('assignedDriverId', '==', driverUid)
      .get();

    let swapsChecked = 0;
    let swapsReverted = 0;

    // Check each bus for expired swaps
    for (const busDoc of busesSnapshot.docs) {
      const reverted = await CleanupService.checkAndRevertExpiredSwap(busDoc.id);
      swapsChecked++;
      if (reverted) swapsReverted++;
    }

    // Also check if driver is activeDriverId (temporary swap)
    const activeBusesSnapshot = await adminDb
      .collection('buses')
      .where('activeDriverId', '==', driverUid)
      .get();

    for (const busDoc of activeBusesSnapshot.docs) {
      const reverted = await CleanupService.checkAndRevertExpiredSwap(busDoc.id);
      swapsChecked++;
      if (reverted) swapsReverted++;
    }

    // Run general cleanup in background
    CleanupService.runOpportunisticCleanup().catch(err => {
      console.error('Background cleanup error:', err);
    });

    return NextResponse.json({
      success: true,
      swapsChecked,
      swapsReverted,
      message: swapsReverted > 0 ? 'Expired swaps reverted' : 'All swaps current'
    });

  } catch (error: any) {
    console.error('Error checking swap status:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
