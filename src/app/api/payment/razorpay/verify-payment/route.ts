import { NextResponse } from 'next/server';
import {
    verifyRazorpaySignature,
    fetchPaymentDetails,
    fetchOrderDetails,
} from '@/lib/payment/razorpay.service';
import { adminDb, FieldValue } from '@/lib/firebase-admin';
import { PaymentTransactionService } from '@/lib/payment/payment-transaction.service';
import { calculateValidUntilDate, parseFirestoreDate } from '@/lib/utils/date-utils';
import { createOnlinePayment } from '@/lib/payment/payment.service';
import { paymentsSupabaseService } from '@/lib/services/payments-supabase';
import { getDeadlineConfig } from '@/lib/deadline-config-service';
import { withSecurity } from '@/lib/security/api-security';
import { VerifyPaymentSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';
import { z } from 'zod';

type VerifyPaymentBody = z.infer<typeof VerifyPaymentSchema>;

type RazorpayNotes = Record<string, string | number | boolean | null | undefined>;

type RazorpayOrderDetails = {
    id?: string;
    amount: number;
    notes?: RazorpayNotes;
};

type RazorpayPaymentDetails = {
    id?: string;
    order_id?: string;
    amount?: number;
    status?: string;
    method?: string;
};

type OnlineTransactionRecord = {
    studentId: string;
    studentName: string;
    amount: number;
    paymentMethod: 'online';
    paymentId: string;
    timestamp: string;
    durationYears: number;
    validUntil: string;
    status: 'completed';
    purpose: 'new_registration' | 'renewal';
};

function noteString(notes: RazorpayNotes, key: string): string {
    const value = notes[key];
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function parseDuration(value: string): number {
    const parsed = Number.parseInt(value || '1', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function normalizePurpose(value: string): 'new_registration' | 'renewal' {
    const normalized = value.toLowerCase();
    return normalized.includes('registration') || normalized === 'new_registration'
        ? 'new_registration'
        : 'renewal';
}

export const POST = withSecurity<VerifyPaymentBody>(
    async (_request, { auth, body }) => {
        const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = body;

        const verification = verifyRazorpaySignature({
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
        });

        if (!verification.isValid) {
            return NextResponse.json(
                { success: false, error: verification.error || 'Payment verification failed' },
                { status: 400 }
            );
        }

        let orderDetails: RazorpayOrderDetails;
        try {
            orderDetails = await fetchOrderDetails(razorpay_order_id) as RazorpayOrderDetails;
        } catch {
            return NextResponse.json(
                { success: false, error: 'Failed to verify order details with Razorpay' },
                { status: 502 }
            );
        }

        const trustedNotes = orderDetails.notes || {};
        const trustedUserId = noteString(trustedNotes, 'userId');
        const trustedEnrollmentId = noteString(trustedNotes, 'enrollmentId') || noteString(trustedNotes, 'studentId');
        const trustedStudentName = noteString(trustedNotes, 'studentName') || noteString(trustedNotes, 'userName') || 'Unknown';
        const trustedDurationYears = parseDuration(noteString(trustedNotes, 'durationYears'));
        const trustedPurpose = normalizePurpose(noteString(trustedNotes, 'purpose') || noteString(trustedNotes, 'type'));
        const trustedAmount = Number(orderDetails.amount || 0) / 100;

        if (!trustedUserId || trustedUserId !== auth.uid) {
            return NextResponse.json(
                { success: false, error: 'Payment order does not belong to the authenticated user' },
                { status: 403 }
            );
        }

        let paymentDetails: RazorpayPaymentDetails;
        try {
            paymentDetails = await fetchPaymentDetails(razorpay_payment_id) as RazorpayPaymentDetails;
        } catch {
            return NextResponse.json(
                { success: false, error: 'Failed to verify payment capture with Razorpay' },
                { status: 502 }
            );
        }

        if (
            paymentDetails.id !== razorpay_payment_id ||
            paymentDetails.order_id !== razorpay_order_id ||
            Number(paymentDetails.amount || 0) !== Number(orderDetails.amount || 0)
        ) {
            return NextResponse.json(
                { success: false, error: 'Razorpay payment details do not match the order' },
                { status: 400 }
            );
        }

        if (paymentDetails.status !== 'captured') {
            return NextResponse.json(
                { success: false, error: 'Payment is not captured yet. Please retry shortly.' },
                { status: 409 }
            );
        }

        const paymentRecord = {
            paymentId: razorpay_payment_id,
            orderId: razorpay_order_id,
            userId: trustedUserId,
            userName: trustedStudentName,
            purpose: trustedPurpose,
            amount: trustedAmount,
            status: paymentDetails.status,
            method: paymentDetails.method || 'unknown',
            capturedAt: new Date().toISOString(),
        };

        const isProcessed = await PaymentTransactionService.isPaymentProcessed(razorpay_payment_id);
        let transactionRecord: OnlineTransactionRecord | null = null;
        const deadlineConfig = await getDeadlineConfig();

        if (trustedPurpose === 'new_registration') {
            if (isProcessed) {
                return NextResponse.json({
                    success: true,
                    message: 'Payment already processed',
                    payment: paymentRecord,
                });
            }

            const targetValidUntil = calculateValidUntilDate(
                new Date().getFullYear(),
                trustedDurationYears,
                deadlineConfig
            );

            transactionRecord = {
                studentId: trustedEnrollmentId,
                studentName: trustedStudentName,
                amount: trustedAmount,
                paymentMethod: 'online',
                paymentId: razorpay_payment_id,
                timestamp: new Date().toISOString(),
                durationYears: trustedDurationYears,
                validUntil: targetValidUntil.toISOString(),
                status: 'completed',
                purpose: 'new_registration',
            };
        } else {
            const studentRef = adminDb.collection('students').doc(trustedUserId) as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
            const existingPayment = isProcessed
                ? await paymentsSupabaseService.getPaymentById(razorpay_payment_id)
                : null;
            const studentDoc = await studentRef.get();
            if (!studentDoc.exists) throw new Error('Student document not found');

            const studentData = studentDoc.data();
            const actualStudentName = studentData?.fullName || trustedStudentName;
            const actualEnrollmentId = studentData?.enrollmentId || trustedEnrollmentId;
            const existingValidUntil = parseFirestoreDate(studentData?.validUntil);

            let baseYear = new Date().getUTCFullYear();
            const now = new Date();
            if (existingValidUntil && existingValidUntil > now) {
                baseYear = existingValidUntil.getUTCFullYear();
            }

            const targetValidUntil = existingPayment?.valid_until
                ? new Date(existingPayment.valid_until)
                : calculateValidUntilDate(baseYear, trustedDurationYears, deadlineConfig);

            transactionRecord = {
                studentId: existingPayment?.student_id || actualEnrollmentId,
                studentName: existingPayment?.student_name || actualStudentName,
                amount: existingPayment?.amount || trustedAmount,
                paymentMethod: 'online',
                paymentId: razorpay_payment_id,
                timestamp: existingPayment?.transaction_date || new Date().toISOString(),
                durationYears: existingPayment?.duration_years || trustedDurationYears,
                validUntil: targetValidUntil.toISOString(),
                status: 'completed',
                purpose: 'renewal',
            };

            if (!isProcessed) {
                await createOnlinePayment({
                    studentUid: trustedUserId,
                    studentId: transactionRecord.studentId,
                    studentName: transactionRecord.studentName,
                    amount: transactionRecord.amount,
                    durationYears: transactionRecord.durationYears,
                    sessionStartYear: baseYear,
                    sessionEndYear: targetValidUntil.getFullYear(),
                    validUntil: transactionRecord.validUntil,
                    razorpayPaymentId: razorpay_payment_id,
                    razorpayOrderId: razorpay_order_id,
                    razorpaySignature: razorpay_signature,
                    purpose: transactionRecord.purpose,
                });
            }

            // ─────────────────────────────────────────────────────────────────────
            // Phase 3 — Online renewal CONVERGES into the unified approval flow.
            //
            // The captured payment is recorded above (immutable financial ledger),
            // but transport entitlement is NOT restored here. We create a PENDING
            // `renewal_requests` document so the moderator/admin approval architecture
            // (`/api/renewal-requests/approve-v2`) remains the SINGLE event that
            // revalidates capacity, runs reassignment, reclaims the released seat, and
            // flips the student to 'active'. There is no instant reactivation path:
            // online and offline renewals now share one lifecycle. The student doc is
            // intentionally left untouched (status, validUntil, seat all unchanged).
            //
            // Idempotent by construction: the request doc id is derived from the
            // Razorpay payment id, so retries/webhook races never duplicate it.
            // ─────────────────────────────────────────────────────────────────────
            const renewalRequestRef = adminDb.collection('renewal_requests').doc(`online_${razorpay_payment_id}`);
            const existingRequest = await renewalRequestRef.get();
            if (!existingRequest.exists) {
                await renewalRequestRef.set({
                    studentId: trustedUserId,
                    enrollmentId: actualEnrollmentId,
                    studentName: actualStudentName,
                    studentEmail: studentData?.email || '',
                    studentPhone: studentData?.phone || studentData?.phoneNumber || '',
                    durationYears: transactionRecord.durationYears,
                    totalFee: trustedAmount,
                    paymentMode: 'online',
                    paymentId: razorpay_payment_id,
                    razorpayOrderId: razorpay_order_id,
                    razorpaySignature: razorpay_signature,
                    paymentStatus: 'paid',
                    requestedValidUntil: targetValidUntil.toISOString(),
                    status: 'pending',
                    createdAt: FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp(),
                });

                // Notify staff that a PAID online renewal is awaiting approval.
                try {
                    const [adminsSnapshot, moderatorsSnapshot] = await Promise.all([
                        adminDb.collection('admins').get(),
                        adminDb.collection('moderators').get(),
                    ]);
                    const allStaffIds = [
                        ...adminsSnapshot.docs.map((d) => d.id),
                        ...moderatorsSnapshot.docs.map((d) => d.id),
                    ];
                    if (allStaffIds.length > 0) {
                        // Dedup: skip if a notification for this student's renewal already exists
                        const existingNotif = await adminDb.collection('notifications')
                            .where('sender.userId', '==', trustedUserId)
                            .where('title', '==', 'Online Renewal Awaiting Approval')
                            .limit(1)
                            .get();
                        if (existingNotif.empty) {
                            const expiryDate = new Date();
                            expiryDate.setHours(23, 59, 59, 999);
                            await adminDb.collection('notifications').add({
                                title: 'Online Renewal Awaiting Approval',
                                content: `${actualStudentName} (${actualEnrollmentId}) paid online for a ${transactionRecord.durationYears} year(s) renewal and is awaiting approval.`,
                                sender: { userId: trustedUserId, userName: actualStudentName, userRole: 'student', enrollmentId: actualEnrollmentId },
                                target: { type: 'specific_users', specificUserIds: allStaffIds },
                                recipientIds: allStaffIds,
                                autoInjectedRecipientIds: [],
                                readByUserIds: [],
                                isEdited: false,
                                isDeletedGlobally: false,
                                createdAt: FieldValue.serverTimestamp(),
                                expiresAt: expiryDate.toISOString(),
                                metadata: { paymentId: razorpay_payment_id },
                            });
                        }
                    }
                } catch (notifyErr) {
                    console.error('Failed to notify staff of online renewal request:', notifyErr);
                }
            }
        }

        if (!transactionRecord) {
            return NextResponse.json(
                { success: false, error: 'Payment could not be mapped to a bus service transaction' },
                { status: 500 }
            );
        }

        if (trustedPurpose === 'new_registration') {
            // Atomic single-winner guard (parity with the Razorpay webhook). The
            // Supabase isPaymentProcessed() fast-path above is read-then-write and
            // races under concurrent double-submit; the processed_payments marker is
            // set INSIDE a transaction so exactly one request records the ledger entry.
            let alreadyMarked = false;
            await adminDb.runTransaction(async (transaction) => {
                const markerRef = adminDb.collection('processed_payments').doc(razorpay_payment_id);
                const markerSnap = await transaction.get(markerRef);
                if (markerSnap.exists) {
                    alreadyMarked = true;
                    return;
                }
                transaction.set(markerRef, {
                    paymentId: razorpay_payment_id,
                    orderId: razorpay_order_id,
                    processedAt: FieldValue.serverTimestamp(),
                    amount: trustedAmount,
                    enrollmentId: trustedEnrollmentId,
                    userId: trustedUserId,
                    source: 'verify-payment',
                });
            });

            if (!alreadyMarked) {
                try {
                    await createOnlinePayment({
                        studentUid: trustedUserId,
                        studentId: transactionRecord.studentId,
                        studentName: transactionRecord.studentName,
                        amount: transactionRecord.amount,
                        durationYears: transactionRecord.durationYears,
                        sessionStartYear: new Date().getFullYear(),
                        sessionEndYear: Number.parseInt(
                            transactionRecord.validUntil?.substring(0, 4) ||
                            String(new Date().getFullYear() + transactionRecord.durationYears),
                            10
                        ),
                        validUntil: transactionRecord.validUntil || new Date().toISOString(),
                        razorpayPaymentId: razorpay_payment_id,
                        razorpayOrderId: razorpay_order_id,
                        razorpaySignature: razorpay_signature,
                        purpose: transactionRecord.purpose,
                    });
                } catch (createErr) {
                    // Roll back the marker so the payment can be re-recorded on retry —
                    // a missing ledger entry is far worse than a duplicate webhook hit.
                    await adminDb.collection('processed_payments').doc(razorpay_payment_id).delete().catch(() => {});
                    throw createErr;
                }
            }
        }

        const pendingApproval = trustedPurpose === 'renewal';
        return NextResponse.json({
            success: true,
            pendingApproval,
            message: pendingApproval
                ? 'Payment received. Your renewal is now awaiting approval — transport access will be restored once an administrator approves it.'
                : 'Payment verified successfully',
            payment: paymentRecord,
            verification: {
                isValid: true,
                orderId: verification.orderId,
                paymentId: verification.paymentId,
            },
        });
    },
    {
        requiredRoles: [],
        schema: VerifyPaymentSchema,
        rateLimit: RateLimits.PAYMENT_VERIFY,
        allowBodyToken: true,
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
