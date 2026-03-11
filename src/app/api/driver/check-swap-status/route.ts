import { NextResponse } from 'next/server';
import { CleanupService } from '@/lib/cleanup-service';
import { db as adminDb } from '@/lib/firebase-admin';
import { withSecurity } from '@/lib/security/api-security';
import { EmptySchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

/**
 * Check driver's swap status and trigger cleanup
 * Called when driver logs in or accesses dashboard
 */
const checkSwapStatusHandler = async (request: Request, { auth }: { auth: any }) => {
  const driverUid = auth.uid;

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
};

const secureHandler = withSecurity(
  checkSwapStatusHandler,
  {
    requiredRoles: ['driver'],
    schema: EmptySchema,
    rateLimit: RateLimits.DEFAULT
  }
);

export const POST = secureHandler;
export const GET = secureHandler;
