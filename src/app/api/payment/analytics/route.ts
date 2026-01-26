
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/firebase-admin';
import { paymentsSupabaseService } from '@/lib/services/payments-supabase';

export async function GET(request: NextRequest) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const decodedToken = await verifyToken(token);
        // basic role check could be added here if needed, but verifyToken ensures validity

        // Get mode from query parameter: 'days' (default) or 'months'
        const { searchParams } = new URL(request.url);
        const mode = searchParams.get('mode') || 'days';

        const stats = await paymentsSupabaseService.getPaymentStats();

        let trend;
        if (mode === 'months') {
            trend = await paymentsSupabaseService.getPaymentTrendMonthly();
        } else {
            trend = await paymentsSupabaseService.getPaymentTrend();
        }

        return NextResponse.json({
            success: true,
            data: {
                ...stats,
                trend
            }
        });

    } catch (error) {
        console.error('Error fetching payment analytics:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
