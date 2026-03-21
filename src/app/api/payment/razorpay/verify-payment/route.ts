import { NextResponse } from 'next/server';
import {
    verifyRazorpaySignature,
    fetchPaymentDetails,
    fetchOrderDetails,
    RazorpayPaymentResponse
} from '@/lib/payment/razorpay.service';
import { adminDb, FieldValue } from '@/lib/firebase-admin';
import { PaymentTransactionService } from '@/lib/payment/payment-transaction.service';
import { calculateValidUntilDate } from '@/lib/utils/date-utils';
import { createOnlinePayment } from '@/lib/payment/payment.service';
import { computeBlockDatesFromValidUntil } from '@/lib/utils/deadline-computation';
import { getDeadlineConfig } from '@/lib/deadline-config-service';
import { withSecurity } from '@/lib/security/api-security';
import { VerifyPaymentSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

export const POST = withSecurity(
    async (request, { body }) => {
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature, userId: clientUserId, purpose: clientPurpose } = body as any;

        // Verify payment signature
        const verification = verifyRazorpaySignature({ razorpay_payment_id, razorpay_order_id, razorpay_signature });
        if (!verification.isValid) {
            return NextResponse.json({ success: false, error: verification.error || 'Payment verification failed' }, { status: 400 });
        }

        // authoritative source - Razorpay order notes
        let orderDetails;
        try {
            orderDetails = await fetchOrderDetails(razorpay_order_id);
        } catch (error) {
            return NextResponse.json({ success: false, error: 'Failed to verify order details' }, { status: 500 });
        }

        const trustedNotes = orderDetails.notes || {};
        const trustedUserId = trustedNotes.userId;
        const trustedEnrollmentId = trustedNotes.enrollmentId || trustedNotes.studentId;
        const trustedStudentName = trustedNotes.studentName || trustedNotes.userName || 'Unknown';
        const trustedDurationYears = parseInt(trustedNotes.durationYears || '1');
        const trustedPurpose = trustedNotes.purpose || trustedNotes.type || 'renewal';
        const trustedAmount = orderDetails.amount / 100;

        if (clientUserId && clientUserId !== trustedUserId) {
            console.warn(`[SECURITY] Client userId mismatch with order userId`);
        }

        let paymentDetails = null;
        try {
            paymentDetails = await fetchPaymentDetails(razorpay_payment_id);
        } catch (error) { /* non-critical */ }

        const paymentRecord = {
            paymentId: razorpay_payment_id,
            orderId: razorpay_order_id,
            signature: razorpay_signature,
            userId: trustedUserId,
            userName: trustedStudentName,
            purpose: trustedPurpose,
            amount: trustedAmount,
            status: paymentDetails?.status || 'captured',
            method: paymentDetails?.method || 'unknown',
            capturedAt: new Date().toISOString(),
        };

        const isNewRegistration = trustedPurpose?.toLowerCase()?.includes('registration') || trustedPurpose === 'new_registration';
        const isRenewal = trustedPurpose?.toLowerCase()?.includes('renewal') || trustedPurpose === 'renewal';

        if (trustedUserId && (isRenewal || isNewRegistration)) {
            try {
                const isProcessed = await PaymentTransactionService.isPaymentProcessed(razorpay_payment_id);
                if (isProcessed) {
                    return NextResponse.json({ success: true, message: 'Payment already processed', payment: paymentRecord });
                }

                let transactionRecord: any = null;
                const deadlineConfig = await getDeadlineConfig();

                if (isNewRegistration) {
                    transactionRecord = {
                        studentId: trustedEnrollmentId,
                        studentName: trustedStudentName,
                        amount: trustedAmount,
                        paymentMethod: 'online',
                        paymentId: razorpay_payment_id,
                        timestamp: new Date().toISOString(),
                        durationYears: trustedDurationYears,
                        validUntil: '',
                        status: 'completed',
                        purpose: 'new_registration'
                    };
                } else {
                    const studentRef = adminDb.collection('students').doc(trustedUserId);
                    await adminDb.runTransaction(async (transaction: any) => {
                        const studentDoc = await transaction.get(studentRef);
                        if (!studentDoc.exists) throw new Error('Student document not found');

                        const studentData = studentDoc.data();
                        const actualStudentName = studentData?.fullName || trustedStudentName;
                        const actualEnrollmentId = studentData?.enrollmentId || trustedEnrollmentId;

                        const existingDurationYears = studentData?.durationYears || 0;
                        const existingValidUntil = studentData?.validUntil;

                        let baseYear = new Date().getFullYear();
                        if (existingValidUntil) {
                            const existingDate = existingValidUntil.toDate ? existingValidUntil.toDate() : new Date(existingValidUntil);
                            if (existingDate > new Date()) baseYear = existingDate.getFullYear();
                        }

                        const newValidUntil = calculateValidUntilDate(baseYear, trustedDurationYears, deadlineConfig);
                        const blockDates = computeBlockDatesFromValidUntil(newValidUntil, deadlineConfig);

                        transaction.update(studentRef, {
                            validUntil: newValidUntil,
                            status: 'active',
                            sessionEndYear: newValidUntil.getFullYear(),
                            paymentAmount: trustedAmount,
                            lastRenewalDate: FieldValue.serverTimestamp(),
                            durationYears: existingDurationYears + trustedDurationYears,
                            softBlock: blockDates.softBlock,
                            hardBlock: blockDates.hardBlock,
                            updatedAt: FieldValue.serverTimestamp()
                        });

                        transactionRecord = {
                            studentId: actualEnrollmentId,
                            studentName: actualStudentName,
                            amount: trustedAmount,
                            paymentMethod: 'online',
                            paymentId: razorpay_payment_id,
                            timestamp: new Date().toISOString(),
                            durationYears: trustedDurationYears,
                            validUntil: newValidUntil.toISOString(),
                            status: 'completed',
                            purpose: 'renewal'
                        };
                    });
                }

                if (transactionRecord) {
                    await createOnlinePayment({
                        studentUid: trustedUserId,
                        studentId: transactionRecord.studentId,
                        studentName: transactionRecord.studentName,
                        amount: transactionRecord.amount,
                        durationYears: transactionRecord.durationYears,
                        sessionStartYear: new Date().getFullYear(),
                        sessionEndYear: parseInt(transactionRecord.validUntil?.substring(0, 4) || String(new Date().getFullYear() + transactionRecord.durationYears)),
                        validUntil: transactionRecord.validUntil || new Date().toISOString(),
                        razorpayPaymentId: razorpay_payment_id,
                        razorpayOrderId: razorpay_order_id,
                        razorpaySignature: razorpay_signature,
                        purpose: transactionRecord.purpose
                    }).catch(() => { /* non-critical: payment record save */ });
                }
            } catch (error: any) {
                console.error('[verify-payment] Student update error:', error?.message);
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Payment verified successfully',
            payment: paymentRecord,
            verification: { isValid: true, orderId: verification.orderId, paymentId: verification.paymentId }
        });
    },
    {
        requiredRoles: [],
        schema: VerifyPaymentSchema,
        rateLimit: RateLimits.PAYMENT_VERIFY,
        allowBodyToken: true
    }
);

export async function OPTIONS(request: Request) {
    const origin = request.headers.get('origin') || '';
    const allowedOrigins = ['https://adtu-bus.vercel.app', 'https://adtu-bus-xq.vercel.app', process.env.NEXT_PUBLIC_APP_URL || ''].filter(Boolean);
    const isVercelPreview = /^https:\/\/.*\.vercel\.app$/.test(origin);
    const isLocalhost = process.env.NODE_ENV === 'development' && (origin === 'http://localhost:3000' || origin === 'http://127.0.0.1:3000');
    const isAllowed = allowedOrigins.includes(origin) || isVercelPreview || isLocalhost;

    return new NextResponse(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': isAllowed ? origin : (allowedOrigins[0] || ''),
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
        },
    });
}
