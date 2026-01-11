
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

        const stats = await paymentsSupabaseService.getPaymentStats();
        const trend = await paymentsSupabaseService.getPaymentTrend();

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
