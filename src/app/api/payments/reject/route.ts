/**
 * Payment Rejection API Route
 * 
 * POST /api/payments/reject
 * Rejects an offline pending payment and deletes the document.
 * Per specification: Rejection should not store any data.
 * 
 * Authentication: Required (Admin or Moderator only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, adminDb } from '@/lib/firebase-admin';
import { rejectOfflinePayment } from '@/lib/payment/payment.service';

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

        // Get user data to verify role
        const userDoc = await adminDb.collection('users').doc(userId).get();
        const userData = userDoc.data();

        if (!userData) {
            return NextResponse.json(
                { success: false, error: 'User not found' },
                { status: 404 }
            );
        }

        // Only admins and moderators can reject payments
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

        // Get rejector details for logging (not stored in DB per spec)
        let rejectorName = userData.name || '';
        let rejectorEmpId = userData.empId || '';

        if (userData.role === 'moderator') {
            const modDoc = await adminDb.collection('moderators').doc(userId).get();
            if (modDoc.exists) {
                const modData = modDoc.data();
                rejectorEmpId = modData?.empId || rejectorEmpId;
                rejectorName = modData?.name || modData?.fullName || rejectorName;
            }
        } else if (userData.role === 'admin') {
            const adminDoc = await adminDb.collection('admins').doc(userId).get();
            if (adminDoc.exists) {
                const adminData = adminDoc.data();
                rejectorEmpId = adminData?.empId || rejectorEmpId;
                rejectorName = adminData?.name || adminData?.fullName || rejectorName;
            }
        }

        // Reject the payment (document will be deleted)
        const result = await rejectOfflinePayment({
            paymentId,
            rejectorUserId: userId,
            rejectorEmpId,
            rejectorName,
            rejectorRole: userData.role as 'Admin' | 'Moderator'
        });

        if (!result.success) {
            return NextResponse.json(
                { success: false, error: result.error },
                { status: 400 }
            );
        }

        console.log(`🗑️ Payment ${paymentId} rejected by ${rejectorName} (${rejectorEmpId})`);

        return NextResponse.json({
            success: true,
            message: 'Payment rejected and removed'
        });

    } catch (error) {
        console.error('Error rejecting payment:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to reject payment'
            },
            { status: 500 }
        );
    }
}
