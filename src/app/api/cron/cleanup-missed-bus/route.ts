/**
 * Missed Bus Requests Cleanup Worker (Daily Fallback)
 * 
 * Cron job endpoint that expires stale missed-bus requests.
 * 
 * NOTE: Since Vercel Hobby plan only supports daily cron jobs,
 * primary cleanup now happens during API calls via eager cleanup:
 * - /api/missed-bus/raise - calls performEagerCleanup()
 * - /api/missed-bus/status - uses getStudentRequestStatus() which includes cleanup
 * - /api/missed-bus/driver-requests - uses getPendingRequestsForDriver() which includes cleanup
 * 
 * This daily cron job serves as a fallback to catch any requests that
 * slipped through the eager cleanup.
 * 
 * Actions:
 * 1. Expire pending requests that have passed their TTL (15 minutes)
 * 2. No admin intervention - fully automatic
 */

import { NextResponse } from 'next/server';
import { missedBusService, MESSAGES } from '@/lib/services/missed-bus-service';

// Verify cron secret to prevent unauthorized execution
function verifyCronAuth(request: Request): boolean {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // If no secret configured, allow in development
    if (!cronSecret && process.env.NODE_ENV !== 'production') {
        return true;
    }

    return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
    // Verify cron auth
    if (!verifyCronAuth(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startTime = Date.now();
    const stats = {
        expiredRequests: 0,
        errors: [] as string[]
    };

    try {
        console.log('🔄 Running missed-bus requests cleanup...');

        // Expire pending requests that exceeded TTL
        const expiredCount = await missedBusService.expirePendingRequests();
        stats.expiredRequests = expiredCount;

        if (expiredCount > 0) {
            console.log(`✅ Expired ${expiredCount} missed-bus requests`);
        }

        const elapsed = Date.now() - startTime;

        return NextResponse.json({
            success: true,
            stats,
            elapsedMs: elapsed,
            timestamp: new Date().toISOString()
        });

    } catch (error: any) {
        console.error('❌ Missed-bus cleanup worker error:', error);
        stats.errors.push(error.message);

        return NextResponse.json(
            {
                success: false,
                error: error.message || 'Cleanup failed',
                stats
            },
            { status: 500 }
        );
    }
}

// Also support POST for manual trigger
export async function POST(request: Request) {
    return GET(request);
}
