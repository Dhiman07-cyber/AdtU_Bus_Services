/**
 * Payment Approval API Route
 * 
 * POST /api/payments/approve
 * Approves an offline pending payment and updates student validity.
 * 
 * Authentication: Required (Admin or Moderator only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, adminDb } from '@/lib/firebase-admin';
import { approveOfflinePayment } from '@/lib/payment/payment.service';

export async function POST(request: NextRequest) {
    try {
        // Verify authentication
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const decodedToken = await verifyToken(token);
        const userId = decodedToken.uid;

        // Get user data to verify role and get approver info
        const userDoc = await adminDb.collection('users').doc(userId).get();
        const userData = userDoc.data();

        if (!userData) {
            return NextResponse.json(
                { success: false, error: 'User not found' },
                { status: 404 }
            );
        }

        // Only admins and moderators can approve payments
        if (!['admin', 'moderator'].includes(userData.role)) {
            return NextResponse.json(
                { success: false, error: 'Insufficient permissions' },
                { status: 403 }
            );
        }

        // Parse request body
        const body = await request.json();
        const { paymentId } = body;

        if (!paymentId) {
            return NextResponse.json(
                { success: false, error: 'Payment ID is required' },
                { status: 400 }
            );
        }

        // Get approver details - check moderators or admins collection
        let approverEmpId = userData.empId || '';
        let approverName = userData.name || '';

        if (userData.role === 'moderator') {
            const modDoc = await adminDb.collection('moderators').doc(userId).get();
            if (modDoc.exists) {
                const modData = modDoc.data();
                approverEmpId = modData?.empId || approverEmpId;
                approverName = modData?.name || modData?.fullName || approverName;
            }
        } else if (userData.role === 'admin') {
            const adminDoc = await adminDb.collection('admins').doc(userId).get();
            if (adminDoc.exists) {
                const adminData = adminDoc.data();
                approverEmpId = adminData?.empId || approverEmpId;
                approverName = adminData?.name || adminData?.fullName || approverName;
            }
        }

        // Approve the payment
        const result = await approveOfflinePayment({
            paymentId,
            approverUserId: userId,
            approverEmpId,
            approverName,
            approverRole: userData.role as 'Admin' | 'Moderator'
        });

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error },
                { status: 400 }
            );
        }

        console.log(`✅ Payment ${paymentId} approved by ${approverName} (${approverEmpId})`);

        return NextResponse.json({
            success: true,
            message: 'Payment approved successfully',
            payment: result.payment
        });

    } catch (error) {
        console.error('Error approving payment:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to approve payment'
            },
            { status: 500 }
        );
    }
}
