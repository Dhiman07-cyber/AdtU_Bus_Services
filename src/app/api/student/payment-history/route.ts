/**
 * Student Payment History API (SUPABASE ONLY)
 * 
 * ⚠️ ARCHITECTURE CHANGE:
 * Payment history is now fetched DIRECTLY from Supabase.
 * Firestore is NOT used for payment data.
 * 
 * This is the correct implementation per the immutable payment architecture:
 * - Supabase `payments` table is the SINGLE SOURCE OF TRUTH
 * - No data is copied to or read from Firestore for payments
 * - Supports pagination for long-term historical queries
 * 
 * 🔒 SECURITY:
 * - Uses paymentsSupabaseService which handles decryption of sensitive fields
 * - Encrypted fields: student_name, offline_transaction_id
 * - Decryption happens transparently before returning to client
 * 
 * GET /api/student/payment-history?uid=xxx&limit=50&offset=0
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { paymentsSupabaseService, PaymentRecord } from '@/lib/services/payments-supabase';

export async function GET(request: NextRequest) {
    try {
        // 1. Verify authentication
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);

        // 2. Get parameters
        const { searchParams } = new URL(request.url);
        let studentUid = searchParams.get('uid');
        const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100); // Max 100
        const offset = parseInt(searchParams.get('offset') || '0');

        // 3. Check if user is admin/moderator requesting another student's history
        if (studentUid && studentUid !== decodedToken.uid) {
            // Verify requester is admin or moderator
            const adminDoc = await adminDb.collection('admins').doc(decodedToken.uid).get();
            const modDoc = await adminDb.collection('moderators').doc(decodedToken.uid).get();

            if (!adminDoc.exists && !modDoc.exists) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        } else {
            studentUid = decodedToken.uid;
        }

        // 4. Fetch payment history using paymentsSupabaseService
        // ✅ This properly decrypts sensitive fields (student_name, offline_transaction_id)
        const payments = await paymentsSupabaseService.getPaymentsByStudentUid(
            studentUid!,
            { limit, offset }
        );

        // 5. Transform payments for response (already decrypted by paymentsSupabaseService)
        const paymentHistory = payments.map((p: PaymentRecord) => ({
            paymentId: p.payment_id,
            amount: p.amount || 0,
            currency: p.currency || 'INR',
            method: p.method,
            status: p.status,
            sessionStartYear: p.session_start_year,
            sessionEndYear: p.session_end_year,
            durationYears: p.duration_years,
            validUntil: p.valid_until,
            transactionDate: p.transaction_date,
            razorpayPaymentId: p.razorpay_payment_id,
            razorpayOrderId: p.razorpay_order_id,
            // ✅ Decrypted by paymentsSupabaseService.decryptRecord()
            offlineTransactionId: p.offline_transaction_id,
            approvedBy: p.approved_by,
            approvedAt: p.approved_at,
            createdAt: p.created_at,
        }));

        // 6. Calculate total count for pagination
        // Note: This is approximate since we don't have direct count support
        const totalCount = paymentHistory.length === limit ? limit + offset + 1 : paymentHistory.length + offset;

        // 7. Calculate current validity from most recent completed payment
        let currentValidity: string | null = null;
        const completedPayments = payments.filter((p: PaymentRecord) => p.status === 'Completed');
        if (completedPayments.length > 0) {
            // Sort by transaction_date descending and get the latest
            const sorted = [...completedPayments].sort((a: PaymentRecord, b: PaymentRecord) =>
                new Date(b.transaction_date || 0).getTime() - new Date(a.transaction_date || 0).getTime()
            );
            currentValidity = sorted[0].valid_until || null;
        }

        // 8. Get student basic info from Firestore (only for display, not payment data)
        let studentName = 'Unknown';
        let studentId = null;
        try {
            const studentDoc = await adminDb.collection('students').doc(studentUid!).get();
            if (studentDoc.exists) {
                const studentData = studentDoc.data();
                studentName = studentData?.name || studentData?.fullName || 'Unknown';
                studentId = studentData?.enrollmentId || studentData?.id || null;
            }
        } catch (err) {
            console.warn('Could not fetch student info:', err);
        }

        // 9. Return response with pagination info
        return NextResponse.json({
            success: true,
            studentUid,
            studentName,
            studentId,
            paymentHistory,
            pagination: {
                total: totalCount,
                limit,
                offset,
                hasMore: paymentHistory.length === limit,
            },
            currentValidity,
            source: 'supabase', // Indicates data comes from Supabase (single source of truth)
        });

    } catch (error: any) {
        console.error('Error fetching payment history:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch payment history' },
            { status: 500 }
        );
    }
}
