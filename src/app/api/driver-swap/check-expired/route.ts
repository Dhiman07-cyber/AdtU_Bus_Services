import { NextResponse } from 'next/server';
import { DriverSwapSupabaseService } from '@/lib/driver-swap-supabase';

/**
 * POST /api/driver-swap/check-expired
 * 
 * Check for expired swap requests and end them automatically
 * This can be called from the client or via cron
 * 
 * Actions:
 * 1. Expire pending requests (acceptance window passed)
 * 2. End accepted swaps that have passed their end time (skips if trip ongoing)
 */
export async function POST(request: Request) {
  try {
    console.log('🔄 Running swap expiry check (Supabase)...');
    const startTime = Date.now();

    // Step 1: Expire pending requests
    const pendingResult = await DriverSwapSupabaseService.expirePendingRequests();

    // Step 2: End accepted swaps that have passed their end time
    const acceptedResult = await DriverSwapSupabaseService.checkAndExpireAcceptedSwaps();

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      pending_expired: pendingResult.expired,
      accepted_expired: acceptedResult.expired,
      pending_reverted: acceptedResult.pendingReverted,
      skipped: acceptedResult.skipped,
      message: `Pending: ${pendingResult.expired} expired | Accepted: ${acceptedResult.expired} ended, ${acceptedResult.pendingReverted} pending reverted, ${acceptedResult.skipped} skipped`
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
