import { NextResponse } from 'next/server';
import { DriverSwapService } from '@/lib/driver-swap-service';
import { db as adminDb } from '@/lib/firebase-admin';

/**
 * Scheduled Cron Job: Cleanup old swap requests
 * 
 * This endpoint should be called by a cron service (e.g., Vercel Cron, GitHub Actions, external cron job)
 * Schedule: Every 15 minutes (recommended) or every hour (minimum)
 * 
 * Actions:
 * 1. Expire pending requests that have passed their acceptance window or time period
 * 2. Check and expire accepted swaps that have passed their end time
 * 3. Delete swap request documents older than 7 days
 */
export async function GET(request: Request) {
  try {
    console.log('🕐 [CRON] Starting scheduled swap cleanup...');
    const startTime = Date.now();

    // Quick check: Are there any pending or accepted swaps to process?
    const [pendingCount, acceptedCount] = await Promise.all([
      adminDb.collection('driver_swap_requests').where('status', '==', 'pending').count().get(),
      adminDb.collection('driver_swap_requests').where('status', '==', 'accepted').count().get()
    ]);

    const pendingNum = pendingCount.data().count;
    const acceptedNum = acceptedCount.data().count;

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
          pending_cancelled: 0,
          accepted_expired: 0,
          skipped: 0,
          deleted: 0,
          errors: []
        },
        message: 'No active swap requests to process'
      });
    }

    // 1. Expire old pending requests (acceptance window + time period check)
    console.log('📅 Step 1: Checking for expired pending requests...');
    const pendingResult = await DriverSwapService.expirePendingRequests();
    console.log(`✅ Expired ${pendingResult.expired} (window), cancelled ${pendingResult.cancelled} (time period)`);

    // 2. Check and expire accepted swaps (skips swaps with active trips)
    console.log('📅 Step 2: Checking for expired accepted swaps...');
    const expireResult = await DriverSwapService.checkAndExpireSwaps();
    console.log(`✅ Expired ${expireResult.expired} swap(s), skipped ${expireResult.skipped} (trips in progress)`);

    // 3. Clean up old swap documents (older than 7 days) - only run if we had activity
    let cleanupResult = { deleted: 0, errors: [] as string[] };
    if (pendingResult.expired > 0 || pendingResult.cancelled > 0 || expireResult.expired > 0) {
      console.log('🧹 Step 3: Cleaning up old swap documents...');
      cleanupResult = await DriverSwapService.cleanupOldSwapRequests();
      console.log(`✅ Deleted ${cleanupResult.deleted} old document(s)`);
    } else {
      console.log('⏭️ Step 3: Skipping cleanup (no recent activity)');
    }

    const duration = Date.now() - startTime;
    const allErrors = [...pendingResult.errors, ...expireResult.errors, ...cleanupResult.errors];

    console.log(`🎉 [CRON] Cleanup completed in ${duration}ms`);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
      results: {
        pending_expired: pendingResult.expired,
        pending_cancelled: pendingResult.cancelled,
        accepted_expired: expireResult.expired,
        skipped: expireResult.skipped,
        deleted: cleanupResult.deleted,
        errors: allErrors
      },
      message: `Pending: ${pendingResult.expired} expired, ${pendingResult.cancelled} cancelled | Accepted: ${expireResult.expired} expired, ${expireResult.skipped} skipped | Deleted: ${cleanupResult.deleted} old docs`
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

