
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { paymentsSupabaseService } from '@/lib/services/payments-supabase';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        // 1. Verify Admin Authentication
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        let decodedToken;
        try {
            decodedToken = await adminAuth.verifyIdToken(token);
        } catch (e) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
        }

        // Check if user is admin in Firestore
        const adminDoc = await adminDb.collection('admins').doc(decodedToken.uid).get();
        if (!adminDoc.exists) {
            // Fallback: check users collection role
            const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
            const userData = userDoc.data();
            if (userData?.role !== 'admin') {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        // 2. Fetch Payment Stats from Supabase
        // Get general stats
        const stats = await paymentsSupabaseService.getPaymentStats();

        // Get monthly data for current year
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59);

        const yearPayments = await paymentsSupabaseService.getCompletedPaymentsForReporting(
            startOfYear,
            endOfYear
        );

        // Aggregate monthly data
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthlyData = months.map((m, i) => {
            const monthTotal = yearPayments.reduce((sum, p) => {
                const date = p.transaction_date ? new Date(p.transaction_date) :
                    (p.created_at ? new Date(p.created_at) : new Date());
                // Check if payment belongs to this month (local time approximation)
                return (date.getMonth() === i) ? sum + (p.amount || 0) : sum;
            }, 0);
            return { name: m, amount: monthTotal };
        });

        return NextResponse.json({
            success: true,
            stats: {
                totalRevenue: stats.totalRevenue,
                completedCount: stats.completedPayments,
                pendingCount: stats.pendingPayments,
                monthlyData: monthlyData
            }
        });

    } catch (error: any) {
        console.error('Error fetching payment analytics:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
