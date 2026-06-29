/**
 * Payment Rejection API Route
 * 
 * POST /api/payments/reject
 * Rejects an offline pending payment.
 * 
 * SECURITY:
 * - withSecurity wrapper: auth, RBAC, rate limiting, CSRF, Zod validation
 * - ATOMIC: Supabase WHERE status='Pending' prevents double-rejection
 * - IMMUTABLE: Payment record preserved with 'Rejected' status (no deletions)
 * - IDEMPOTENT: Already-rejected payments return success
 */

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { rejectOfflinePayment } from '@/lib/payment/payment.service';
import { withSecurity } from '@/lib/security/api-security';
import { RejectPaymentSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';
import { requireModeratorPermission } from '@/lib/security/moderator-permissions';

export const POST = withSecurity(
    async (request, { auth, body, requestId }) => {
        const { paymentId } = body as { paymentId: string };
        const userId = auth.uid;

        const permissionDenied = await requireModeratorPermission(
            auth,
            'payments',
            'canRejectOfflinePayment',
            requestId
        );
        if (permissionDenied) return permissionDenied;

        // Get rejector details from role-specific collection
        let rejectorEmpId = '';
        let rejectorName = auth.name || '';

        if (auth.role === 'moderator') {
            const modDoc = await adminDb.collection('moderators').doc(userId).get();
            if (modDoc.exists) {
                const modData = modDoc.data();
                rejectorEmpId = modData?.empId || '';
                rejectorName = modData?.name || modData?.fullName || rejectorName;
            }
        } else if (auth.role === 'admin') {
            const adminDoc = await adminDb.collection('admins').doc(userId).get();
            if (adminDoc.exists) {
                const adminData = adminDoc.data();
                rejectorEmpId = adminData?.empId || '';
                rejectorName = adminData?.name || adminData?.fullName || rejectorName;
            }
        }

        // Reject the payment (ATOMIC + IDEMPOTENT)
        const result = await rejectOfflinePayment({
            paymentId,
            rejectorUserId: userId,
            rejectorEmpId,
            rejectorName,
            rejectorRole: auth.role === 'admin' ? 'Admin' : 'Moderator',
        });

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error, requestId },
                { status: 400 }
            );
        }

        console.log(`🗑️ [${requestId}] Payment ${paymentId?.substring(0,8)}... rejected by ${rejectorName?.substring(0,8) || 'admin'}... (${rejectorEmpId?.substring(0,8) || 'N/A'}...)`);

        return NextResponse.json({
            success: true,
            message: 'Payment rejected successfully',
            requestId,
        });
    },
    {
        requiredRoles: ['admin', 'moderator'],
        schema: RejectPaymentSchema,
        rateLimit: RateLimits.PAYMENT_CREATE,
    }
);
