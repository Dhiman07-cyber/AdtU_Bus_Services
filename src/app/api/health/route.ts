import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';

/**
 * Health Check API Endpoint
 * Used by deployment scripts and monitoring systems
 * 
 * GET /api/health
 * Returns: { status, version, timestamp, checks }
 */
export async function GET() {
    const startTime = Date.now();

    const checks: Record<string, { status: 'ok' | 'degraded' | 'error'; latency_ms?: number; message?: string }> = {};

    // Check 1: Basic application health
    checks['app'] = { status: 'ok' };

    // Check 2: Supabase connectivity
    try {
        const supabaseStart = Date.now();
        const { error } = await supabase.from('realtime_driver_locations').select('id').limit(1);
        const supabaseLatency = Date.now() - supabaseStart;

        if (error && !error.message.includes('Results contain 0 rows')) {
            checks['supabase'] = {
                status: 'error',
                latency_ms: supabaseLatency,
                message: error.message
            };
        } else {
            checks['supabase'] = {
                status: 'ok',
                latency_ms: supabaseLatency
            };
        }
    } catch (e) {
        checks['supabase'] = {
            status: 'error',
            message: e instanceof Error ? e.message : 'Unknown error'
        };
    }

    // Check 3: Environment configuration
    const requiredEnvVars = [
        'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
        'NEXT_PUBLIC_SUPABASE_URL',
    ];

    const missingEnvVars = requiredEnvVars.filter(v => !process.env[v]);

    if (missingEnvVars.length > 0) {
        checks['environment'] = {
            status: 'degraded',
            message: `Missing: ${missingEnvVars.join(', ')}`
        };
    } else {
        checks['environment'] = { status: 'ok' };
    }

    // Determine overall status
    const hasError = Object.values(checks).some(c => c.status === 'error');
    const hasDegraded = Object.values(checks).some(c => c.status === 'degraded');

    const overallStatus = hasError ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';
    const totalLatency = Date.now() - startTime;

    const response = {
        status: overallStatus,
        version: process.env.npm_package_version || '1.0.0',
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'unknown',
        timestamp: new Date().toISOString(),
        latency_ms: totalLatency,
        checks,
    };

    // Return appropriate HTTP status
    const httpStatus = hasError ? 503 : 200;

    return NextResponse.json(response, { status: httpStatus });
}
