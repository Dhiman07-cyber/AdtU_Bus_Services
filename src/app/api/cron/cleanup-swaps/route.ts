import { NextResponse } from 'next/server';
import { DriverSwapSupabaseService } from '@/lib/driver-swap-supabase';
import { createClient } from '@supabase/supabase-js';

// Supabase client for quick counts
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Scheduled Cron Job: Cleanup old swap requests
 * 
 * This endpoint should be called by a cron service (e.g., Vercel Cron, GitHub Actions, external cron job)
 * Schedule: Every 15 minutes (recommended) or every hour (minimum)
 * 
 * Actions:
 * 1. Expire pending requests that have passed their acceptance window
 * 2. End accepted swaps that have passed their end time (but skips if trip is ongoing)
 */
export async function GET(request: Request) {
  try {
    console.log('🕐 [CRON] Starting scheduled swap cleanup (Supabase)...');
    const startTime = Date.now();

    // Quick check: Are there any pending or accepted swaps to process?
    const [pendingRes, acceptedRes] = await Promise.all([
      supabase.from('driver_swap_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('driver_swap_requests').select('id', { count: 'exact', head: true }).eq('status', 'accepted')
    ]);

    const pendingNum = pendingRes.count || 0;
    const acceptedNum = acceptedRes.count || 0;

    console.log(`📊 Quick check: ${pendingNum} pending, ${acceptedNum} accepted swaps`);

    // Early exit if nothing to process (saves resources)
    if (pendingNum === 0 && acceptedNum === 0) {
      console.log('✅ [CRON] No active swap requests to process. Exiting early.');
      return NextResponse.json({
        success: true,
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
        results: {
          pending_expired: 0,
          accepted_expired: 0,
          skipped: 0
        },
        message: 'No active swap requests to process'
      });
    }

    // Step 1: Expire old pending requests (acceptance window passed)
    console.log('📅 Step 1: Checking for expired pending requests...');
    const pendingResult = await DriverSwapSupabaseService.expirePendingRequests();
    console.log(`✅ Expired ${pendingResult.expired} pending request(s)`);

    // Step 2: End accepted swaps that have passed their end time
    // Also checks for pending_revert swaps and completes them if trips ended
    console.log('📅 Step 2: Checking for ended/pending_revert swaps...');
    const acceptedResult = await DriverSwapSupabaseService.checkAndExpireAcceptedSwaps();
    console.log(`✅ Ended ${acceptedResult.expired} accepted, ${acceptedResult.pendingReverted} pending_revert completed, ${acceptedResult.skipped} skipped`);

    const duration = Date.now() - startTime;

    console.log(`🎉 [CRON] Cleanup completed in ${duration}ms`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      results: {
        pending_expired: pendingResult.expired,
        accepted_expired: acceptedResult.expired,
        pending_reverted: acceptedResult.pendingReverted,
        skipped: acceptedResult.skipped
      },
      message: `Pending: ${pendingResult.expired} expired | Accepted: ${acceptedResult.expired} ended, ${acceptedResult.pendingReverted} pending reverted, ${acceptedResult.skipped} skipped`
    });

  } catch (error: any) {
    console.error('❌ [CRON] Error during scheduled cleanup:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggers
export async function POST(request: Request) {
  return GET(request);
}
