/**
 * Missed Bus Requests Cleanup Worker
 * 
 * Cron job endpoint that expires stale missed-bus requests.
 * Should be called every 30 seconds via Vercel Cron or integrated
 * into the main cleanup worker.
 * 
 * Actions:
 * 1. Expire pending requests that have passed their TTL
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
