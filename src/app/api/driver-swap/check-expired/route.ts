import { NextResponse } from 'next/server';
import { DriverSwapService } from '@/lib/driver-swap-service';

/**
 * POST /api/driver-swap/check-expired
 * 
 * Check for expired swap requests and end them automatically
 * This can be called from the client or via cron
 * 
 * Actions:
 * 1. Expire pending requests (acceptance window + time period)
 * 2. Expire accepted swaps whose time period has ended
 * 3. Cleanup old documents (7+ days old)
 */
export async function POST(request: Request) {
  try {
    console.log('🔄 Running swap expiry check and cleanup...');
    const startTime = Date.now();

    // 1. Expire pending requests (acceptance window + time period check)
    const pendingResult = await DriverSwapService.expirePendingRequests();

    // 2. Check and expire accepted swaps (skips swaps with active trips)
    const expireResult = await DriverSwapService.checkAndExpireSwaps();

    // 3. Clean up old swap documents (older than 7 days)
    const cleanupResult = await DriverSwapService.cleanupOldSwapRequests();

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      pending: {
        expired: pendingResult.expired,
        cancelled: pendingResult.cancelled
      },
      accepted: {
        expired: expireResult.expired,
        skipped: expireResult.skipped
      },
      deleted: cleanupResult.deleted,
      errors: [...pendingResult.errors, ...expireResult.errors, ...cleanupResult.errors],
      message: `Pending: ${pendingResult.expired} expired, ${pendingResult.cancelled} cancelled | Accepted: ${expireResult.expired} expired, ${expireResult.skipped} skipped | Deleted: ${cleanupResult.deleted}`
    });

  } catch (error: any) {
    console.error('❌ Error in check-expired endpoint:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/driver-swap/check-expired
 * 
 * Same as POST but for easy testing
 */
export async function GET(request: Request) {
  return POST(request);
}
