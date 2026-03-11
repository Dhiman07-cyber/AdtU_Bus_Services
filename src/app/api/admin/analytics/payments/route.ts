import { NextResponse } from 'next/server';
import { withSecurity } from '@/lib/security/api-security';
import { EmptySchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';
import { paymentsSupabaseService } from '@/lib/services/payments-supabase';

export const GET = withSecurity(
    async () => {
        // Fetch Payment Stats from Supabase
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
    },
    {
        requiredRoles: ['admin'],
        schema: EmptySchema,
        rateLimit: RateLimits.READ
    }
);
