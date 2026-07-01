/**
 * ADTU Bus Services Payment Service
 * 
 * Unified payment service for SUPABASE-based payment management.
 * 
 * ⚠️ CRITICAL ARCHITECTURE RULES:
 * 1. All payments are stored in Supabase ONLY (not Firestore).
 * 2. Payments are IMMUTABLE - once created, they CANNOT be deleted.
 * 3. Supabase `payments` table is the SINGLE SOURCE OF TRUTH.
 * 4. Payments are permanent financial records (5-10+ years).
 * 
 * Key Features:
 * - Fraud prevention through identity-based accountability
 * - Immutability after creation (append-only ledger)
 * - Status transitions: Pending → Completed (no deletions)
 */

import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { paymentsSupabaseService, type PaymentRecord } from '@/lib/services/payments-supabase';
import { ensureReceiptSignature } from '@/lib/services/receipt.service';
import { recordOperationalEvent } from '@/lib/audit/audit-service';
import {
    PaymentDocument,
    OnlinePaymentDocument,
    OfflinePaymentDocument,
    CreateOnlinePaymentRequest,
    ApprovePaymentRequest,
    RejectPaymentRequest,
    PaymentQueryFilters,
    PaginatedPaymentResponse,
    PaymentDisplayData,
    PaymentDetailModalData,
    generateOfflinePaymentId,
    generateOnlinePaymentId,
    isOnlinePayment,
    isOfflinePayment,
} from '@/lib/types/payment';

// ============================================================================
// CONSTANTS
// ============================================================================

const STUDENTS_COLLECTION = 'students';

// ============================================================================
// PAYMENT CREATION - NOW WRITES TO SUPABASE
// ============================================================================

/**
 * Create an online payment record (auto-approved via Razorpay)
 * Called after Razorpay webhook verification
 * 
 * ✅ WRITES TO SUPABASE (not Firestore)
 */
export async function createOnlinePayment(
    request: CreateOnlinePaymentRequest
): Promise<OnlinePaymentDocument> {
    const now = new Date();
    const paymentId = request.razorpayPaymentId || generateOnlinePaymentId(request.purpose);

    // Build the payment document for return
    const paymentDoc: OnlinePaymentDocument = {
        paymentId,
        studentId: request.studentId,
        studentUid: request.studentUid,
        studentName: request.studentName || 'Student', // Fallback for missing name
        amount: request.amount,
        durationYears: request.durationYears,
        method: 'Online',
        status: 'Completed',
        sessionStartYear: request.sessionStartYear,
        sessionEndYear: request.sessionEndYear,
        validUntil: request.validUntil,
        createdAt: now,
        updatedAt: now,
        razorpayPaymentId: request.razorpayPaymentId,
        razorpayOrderId: request.razorpayOrderId,
        razorpaySignature: request.razorpaySignature,
        approvedBy: { type: 'SYSTEM' },
        approvedAt: now,
    };

    // ✅ Write to SUPABASE (IMMUTABLE - cannot be deleted later)
    const result = await paymentsSupabaseService.createPayment({
        paymentId,
        studentId: request.studentId,
        studentUid: request.studentUid,
        studentName: request.studentName || 'Unknown', // Fallback for missing name
        amount: request.amount,
        method: 'Online',
        status: 'Completed',
        sessionStartYear: request.sessionStartYear,
        sessionEndYear: request.sessionEndYear,
        durationYears: request.durationYears,
        validUntil: typeof request.validUntil === 'string' ? new Date(request.validUntil) : undefined,
        transactionDate: now,
        razorpayPaymentId: request.razorpayPaymentId,
        razorpayOrderId: request.razorpayOrderId,
        approvedBy: { type: 'SYSTEM' },
        approvedAt: now,
    });

    if (!result) {
        console.error(`❌ Failed to create payment in Supabase: ${request.razorpayPaymentId}`);
    }

    if (!result) {
        throw new Error(`Failed to create secured online payment ledger record: ${request.razorpayPaymentId}`);
    }

    const storedPayment = await paymentsSupabaseService.getPaymentById(result);
    if (storedPayment) {
        await requireSecuredReceiptSignature(storedPayment);
    }

    return paymentDoc;
}

/**
 * Create a completed offline payment record AT APPROVAL TIME.
 * 
 * ⚠️ CRITICAL: This is the ONLY way offline payments enter the financial ledger.
 * 
 * Offline workflow:
 *   Student submits application → NO payment row
 *   Admin verifies & approves → THIS function creates payment row (status=completed)
 * 
 * The financial ledger contains ONLY verified financial events, not user claims.
 * 
 * @param request - Verified payment details from admin/moderator review
 * @returns The created payment document
 */
export async function createOfflinePaymentAtApproval(
    request: {
        studentId: string;
        studentUid: string;
        studentName: string;
        amount: number;
        durationYears: number;
        sessionStartYear: number;
        sessionEndYear: number;
        validUntil: string;
        /** Student's submitted transaction reference (verified by admin) */
        transactionId: string;
        /** Student's submitted payment date/time (verified by admin) */
        paidAt: Date;
        /** Receipt URL (verified by admin) */
        receipt?: string;
        /** Approver details */
        approverUserId: string;
        approverName: string;
        approverEmpId: string;
        approverRole: string;
        /** Purpose: new_registration or renewal */
        purpose: 'new_registration' | 'renewal';
    }
): Promise<OfflinePaymentDocument> {
    const paymentId = generateOfflinePaymentId(request.purpose);
    const now = new Date();

    // Build the payment document for return
    const paymentDoc: OfflinePaymentDocument = {
        paymentId,
        studentId: request.studentId,
        studentUid: request.studentUid,
        studentName: request.studentName,
        amount: request.amount,
        durationYears: request.durationYears,
        method: 'Offline',
        status: 'Completed',
        sessionStartYear: request.sessionStartYear,
        sessionEndYear: request.sessionEndYear,
        validUntil: request.validUntil,
        createdAt: now,
        updatedAt: now,
        offlineTransactionId: request.transactionId,
        approvedBy: {
            type: 'Manual',
            userId: request.approverUserId,
            name: request.approverName,
            empId: request.approverEmpId,
            role: request.approverRole as 'Admin' | 'Moderator',
        },
        approvedAt: now,
    };

    // Write COMPLETED payment to Supabase (immutable financial record)
    const result = await paymentsSupabaseService.createPayment({
        paymentId,
        studentId: request.studentId,
        studentUid: request.studentUid,
        studentName: request.studentName,
        amount: request.amount,
        method: 'Offline',
        status: 'Completed',
        sessionStartYear: request.sessionStartYear,
        sessionEndYear: request.sessionEndYear,
        durationYears: request.durationYears,
        validUntil: new Date(request.validUntil),
        transactionDate: request.paidAt,
        offlineTransactionId: request.transactionId,
        approvedBy: {
            type: 'Manual',
            userId: request.approverUserId,
            name: request.approverName,
            empId: request.approverEmpId,
            role: request.approverRole,
        },
        approvedAt: now,
    });

    if (!result) {
        throw new Error(`Failed to create offline payment ledger record at approval: ${paymentId}`);
    }

    return paymentDoc;
}

async function applyPaymentValidityToStudent(payment: PaymentRecord): Promise<void> {
    if (!payment.student_uid) return;

    const studentRef = adminDb.collection(STUDENTS_COLLECTION).doc(payment.student_uid);
    const newValidUntil = payment.valid_until ? new Date(payment.valid_until) : null;

    // Atomic read-modify-write: the read + max-merge + update are inside a single
    // Firestore transaction. Without this, a concurrent renewal or payment approval
    // that writes validUntil between our read and our write would be silently lost
    // (lost update / write skew).
    await adminDb.runTransaction(async (transaction) => {
        const studentSnap = await transaction.get(studentRef);
        if (!studentSnap.exists) return;
        const studentData = studentSnap.data() || {};
        const existingValidUntil = studentData.validUntil
            ? (studentData.validUntil.toDate ? studentData.validUntil.toDate() : new Date(studentData.validUntil))
            : null;

        // Invariant 1: older payment cannot overwrite newer validity; no workflow shortens entitlement
        const finalValidUntil = (existingValidUntil && newValidUntil && existingValidUntil > newValidUntil)
            ? existingValidUntil
            : newValidUntil;
        const finalSessionEndYear = (studentData.sessionEndYear && payment.session_end_year && studentData.sessionEndYear > payment.session_end_year)
            ? studentData.sessionEndYear
            : payment.session_end_year;

        transaction.update(studentRef, {
            validUntil: finalValidUntil,
            sessionStartYear: payment.session_start_year || studentData.sessionStartYear,
            sessionEndYear: finalSessionEndYear,
            status: 'active',
            lastRenewalDate: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
    });
}

async function requireSecuredReceiptSignature(payment: PaymentRecord): Promise<void> {
    const signatureResult = await ensureReceiptSignature(payment);
    if (!signatureResult.ok) {
        throw new Error(`Payment receipt signature could not be secured (${signatureResult.status})`);
    }
}

// ============================================================================
// PAYMENT APPROVAL/REJECTION - NOW USES SUPABASE
// ============================================================================

/**
 * Approve an offline payment (IDEMPOTENT + ATOMIC)
 * Updates payment status in Supabase and student validity in Firestore
 * 
 * ✅ PAYMENT STATUS IN SUPABASE, STUDENT UPDATE IN FIRESTORE
 * ✅ IDEMPOTENT: If already Completed, returns success
 * ✅ ATOMIC: Supabase WHERE status='Pending' prevents race conditions
 */
export async function approveOfflinePayment(
    request: ApprovePaymentRequest
): Promise<{ success: boolean; payment?: PaymentDocument; error?: string }> {
    try {
        // Get payment from Supabase first
        const payment = await paymentsSupabaseService.getPaymentById(request.paymentId);

        if (!payment) {
            throw new Error('Payment not found in Supabase');
        }

        // IDEMPOTENT: If already completed, return success
        if (payment.status === 'Completed') {
            await applyPaymentValidityToStudent(payment);
            // Receipt signature is secondary — log failure but don't throw
            try {
                await requireSecuredReceiptSignature(payment);
            } catch (sigErr: any) {
                console.error(`⚠️ Receipt signature failed for already-completed payment ${request.paymentId}:`, sigErr.message);
            }
            return {
                success: true,
                payment: mapSupabaseToFirestoreFormat(payment),
            };
        }

        // Cannot approve rejected payments — must be re-submitted
        if (payment.status === 'Rejected') {
            throw new Error('Cannot approve a rejected payment. Student must re-submit.');
        }

        if (payment.method !== 'Offline') {
            throw new Error('Cannot manually approve online payments');
        }

        // ATOMIC: Update payment status in Supabase (WHERE status='Pending')
        const updateSuccess = await paymentsSupabaseService.updatePaymentStatus(
            request.paymentId,
            'Completed',
            {
                userId: request.approverUserId,
                name: request.approverName,
                empId: request.approverEmpId,
                role: request.approverRole,
            }
        );

        if (!updateSuccess) {
            // Another request likely approved/rejected it first (race condition handled)
            throw new Error('Payment was already processed by another approver');
        }

        const completedPayment = await paymentsSupabaseService.getPaymentById(request.paymentId);
        if (!completedPayment || completedPayment.status !== 'Completed') {
            throw new Error('Payment approval could not be confirmed');
        }

        // Update student document validity in Firestore safely via helper.
        // Retry up to 3 times — if this fails, the payment is Completed but the
        // student's validity was never extended. The admin must manually renew.
        if (completedPayment.student_uid) {
            let studentUpdated = false;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    await applyPaymentValidityToStudent(completedPayment);
                    studentUpdated = true;
                    console.log(`✅ Success: Student ${payment.student_uid.substring(0,8)}... validity updated securely (attempt ${attempt}).`);
                    break;
                } catch (studentErr: any) {
                    console.error(`❌ Attempt ${attempt}/3: Failed to update student ${completedPayment.student_uid.substring(0,8)}... validity:`, studentErr.message);
                    if (attempt < 3) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    }
                }
            }
            if (!studentUpdated) {
                console.error(`🔴 CRITICAL: Payment ${request.paymentId} is Completed but student ${completedPayment.student_uid.substring(0,8)}... validity was NOT updated after 3 attempts. Admin must manually renew.`);

                // Write a detectable outbox record so the next cron, admin scan, or
                // reconciliation pass can identify and repair this diverged state.
                try {
                    await adminDb.collection('audit_failures').add({
                        kind: 'payment_student_validity_sync',
                        paymentId: request.paymentId,
                        studentUid: completedPayment.student_uid,
                        paymentStatus: 'Completed',
                        studentValidityUpdated: false,
                        error: 'Student validity update failed after 3 retries',
                        recovered: false,
                        createdAtISO: new Date().toISOString(),
                    });
                } catch (outboxErr) {
                    console.error('CRITICAL: Could not write audit_failure outbox for payment', request.paymentId.substring(0,8)+'...', outboxErr);
                }
            }
        }

        // Receipt signature is secondary — log failure but don't throw
        try {
            await requireSecuredReceiptSignature(completedPayment);
        } catch (sigErr: any) {
            console.error(`⚠️ Receipt signature failed for payment ${request.paymentId}:`, sigErr.message);
        }

        await recordOperationalEvent({
            action: 'payment_approved',
            actor: {
                id: request.approverUserId,
                role: (request.approverRole?.toLowerCase() || 'admin') as any,
                name: request.approverName,
            },
            targetId: request.paymentId,
            targetType: 'payment',
            targetName: completedPayment.student_name || '',
            reason: 'manual_offline_approval',
            before: { status: 'Pending', amount: payment.amount },
            after: { status: 'Completed', amount: completedPayment.amount, validUntil: completedPayment.valid_until },
            details: { studentUid: completedPayment.student_uid, empId: request.approverEmpId },
        }).catch((e) => console.error('Payment approval audit write failed:', e));

        // Return compatible format
        return {
            success: true,
            payment: {
                paymentId: completedPayment.payment_id,
                studentId: completedPayment.student_id || '',
                studentUid: completedPayment.student_uid || '',
                studentName: completedPayment.student_name || '',
                amount: completedPayment.amount || 0,
                durationYears: completedPayment.duration_years || 1,
                method: completedPayment.method as 'Online' | 'Offline',
                status: 'Completed',
                sessionStartYear: completedPayment.session_start_year || new Date().getFullYear(),
                sessionEndYear: completedPayment.session_end_year || new Date().getFullYear() + 1,
                validUntil: completedPayment.valid_until || '',
                createdAt: new Date(completedPayment.transaction_date || Date.now()),
                updatedAt: new Date(),
            } as PaymentDocument
        };
    } catch (error) {
        console.error(`❌ Error approving payment ${request.paymentId}:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

/**
 * Reject an offline payment (ATOMIC)
 * 
 * ✅ IMMUTABLE: Payment record is preserved — status transitions to 'Rejected'
 * ✅ ATOMIC: Supabase WHERE status='Pending' prevents race conditions
 * ✅ AUDIT: Rejector info stored on the record
 */
export async function rejectOfflinePayment(
    request: RejectPaymentRequest
): Promise<{ success: boolean; error?: string }> {
    try {
        // Get payment from Supabase first
        const payment = await paymentsSupabaseService.getPaymentById(request.paymentId);

        if (!payment) {
            throw new Error('Payment not found');
        }

        if (payment.status === 'Completed') {
            throw new Error('Cannot reject completed payment');
        }

        // IDEMPOTENT: If already rejected, return success
        if (payment.status === 'Rejected') {
            console.log(`ℹ️ Payment ${request.paymentId} already rejected (idempotent success)`);
            return { success: true };
        }

        if (payment.method !== 'Offline') {
            throw new Error('Cannot reject online payments');
        }

        // ATOMIC: Update payment status to 'Rejected' (WHERE status='Pending')
        // Payment record is preserved — NO deletions (immutable ledger)
        const updateSuccess = await paymentsSupabaseService.updatePaymentStatus(
            request.paymentId,
            'Rejected',
            {
                userId: request.rejectorUserId,
                name: request.rejectorName,
                empId: request.rejectorEmpId,
                role: request.rejectorRole,
            }
        );

        if (!updateSuccess) {
            // Another request likely approved/rejected it first (race condition handled)
            throw new Error('Payment was already processed by another reviewer');
        }

        console.log(`🗑️ Payment ${request.paymentId.substring(0,8)}... rejected by ${request.rejectorName?.substring(0,8) || 'admin'}...`);

        await recordOperationalEvent({
            action: 'payment_rejected',
            actor: {
                id: request.rejectorUserId,
                role: (request.rejectorRole?.toLowerCase() || 'admin') as any,
                name: request.rejectorName,
            },
            targetId: request.paymentId,
            targetType: 'payment',
            targetName: payment.student_name || '',
            reason: 'manual_offline_rejection',
            before: { status: 'Pending', amount: payment.amount },
            after: { status: 'Rejected' },
            details: { studentUid: payment.student_uid, empId: request.rejectorEmpId },
        }).catch((e) => console.error('Payment rejection audit write failed:', e));

        return { success: true };
    } catch (error) {
        console.error(`❌ Error processing rejection for ${request.paymentId}:`, error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}

// ============================================================================
// PAYMENT QUERIES - NOW FROM SUPABASE
// ============================================================================

/**
 * Get payments for a specific student from Supabase
 * Merges results from UID and Enrollment ID lookups
 */
export async function getPaymentsByStudent(studentUid: string, studentId?: string): Promise<PaymentDocument[]> {
    const allPayments: PaymentDocument[] = [];
    const fetchedPaymentIds = new Set<string>();

    // 1. Fetch by UID
    const paymentsByUid = await paymentsSupabaseService.getPaymentsByStudentUid(studentUid);
    const mappedByUid = paymentsByUid.map(mapSupabaseToFirestoreFormat);

    for (const p of mappedByUid) {
        if (!fetchedPaymentIds.has(p.paymentId)) {
            fetchedPaymentIds.add(p.paymentId);
            allPayments.push(p);
        }
    }

    // 2. Fetch by Enrollment ID if available (resolved via Firestore UID)
    if (studentId) {
        let resolvedUid: string | null = null;
        try {
            const studentQuery = await adminDb.collection('students')
                .where('enrollmentId', '==', studentId)
                .limit(1)
                .get();
            if (!studentQuery.empty) {
                resolvedUid = studentQuery.docs[0].id;
            }
        } catch (e) {
            console.error('Error resolving studentId in getPaymentsByStudent:', e);
        }

        if (resolvedUid && resolvedUid !== studentUid) {
            const paymentsById = await paymentsSupabaseService.getPaymentsByStudentUid(resolvedUid);
            const mappedById = paymentsById.map(mapSupabaseToFirestoreFormat);

            for (const p of mappedById) {
                if (!fetchedPaymentIds.has(p.paymentId)) {
                    fetchedPaymentIds.add(p.paymentId);
                    allPayments.push(p);
                }
            }
        }
    }

    // Sort by date (newest first)
    allPayments.sort((a, b) => {
        const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
        const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
        return timeB - timeA;
    });

    return allPayments;
}

/**
 * Get all payments with filters (for admin/moderator) from Supabase
 */
export async function getAllPayments(
    filters?: PaymentQueryFilters,
    page: number = 1,
    pageSize: number = 20
): Promise<PaginatedPaymentResponse> {
    // Strategy: Result merging
    // If we have studentUid OR studentId filters, we want to fetch from specific indices
    // and merge the results to ensure we catch all payments (created with either ID)
    if (filters?.studentUid || filters?.studentId) {
        const allPayments: PaymentDocument[] = [];
        const fetchedPaymentIds = new Set<string>();

        // 1. Fetch by UID if available
        if (filters.studentUid) {
            const paymentsByUid = await paymentsSupabaseService.getPaymentsByStudentUid(filters.studentUid);
            const mappedByUid = paymentsByUid.map(mapSupabaseToFirestoreFormat);

            for (const p of mappedByUid) {
                if (!fetchedPaymentIds.has(p.paymentId)) {
                    fetchedPaymentIds.add(p.paymentId);
                    allPayments.push(p);
                }
            }
        }

        // 2. Fetch by Enrollment ID if available (resolved via Firestore UID)
        if (filters.studentId) {
            let resolvedUid: string | null = null;
            try {
                const studentQuery = await adminDb.collection('students')
                    .where('enrollmentId', '==', filters.studentId)
                    .limit(1)
                    .get();
                if (!studentQuery.empty) {
                    resolvedUid = studentQuery.docs[0].id;
                }
            } catch (e) {
                console.error('Error resolving studentId in getAllPayments:', e);
            }

            if (resolvedUid && resolvedUid !== filters.studentUid) {
                const paymentsById = await paymentsSupabaseService.getPaymentsByStudentUid(resolvedUid);
                const mappedById = paymentsById.map(mapSupabaseToFirestoreFormat);

                for (const p of mappedById) {
                    if (!fetchedPaymentIds.has(p.paymentId)) {
                        fetchedPaymentIds.add(p.paymentId);
                        allPayments.push(p);
                    }
                }
            }
        }

        // 3. Apply memory-side filtering (year, method, status)
        let filtered = allPayments;

        if (filters.year) {
            filtered = filtered.filter(p => p.sessionStartYear === filters.year);
        }
        if (filters.method) {
            filtered = filtered.filter(p => p.method === filters.method);
        }
        if (filters.status) {
            filtered = filtered.filter(p => p.status === filters.status);
        }

        // 4. Sort by date (newest first)
        filtered.sort((a, b) => {
            const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
            const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
            return timeB - timeA;
        });

        // 5. Pagination
        const total = filtered.length;
        const totalPages = Math.ceil(total / pageSize);
        const offset = (page - 1) * pageSize;
        const paginatedPayments = filtered.slice(offset, offset + pageSize);

        return {
            payments: paginatedPayments,
            total,
            page,
            pageSize,
            totalPages,
        };
    }
    // Otherwise, use server-side paginated payments
    const result = await paymentsSupabaseService.getPaginatedPayments(filters || {}, page, pageSize);

    // Apply filters manually
    const mapped = result.payments.map(mapSupabaseToFirestoreFormat);

    return {
        payments: mapped,
        total: result.total,
        page,
        pageSize,
        totalPages: Math.ceil(result.total / pageSize),
    };
}

/**
 * Get pending offline payments (for approval queue) from Supabase
 */
export async function getPendingPayments(): Promise<OfflinePaymentDocument[]> {
    const payments = await paymentsSupabaseService.getPendingPayments();
    return payments.map(p => mapSupabaseToFirestoreFormat(p) as OfflinePaymentDocument);
}

/**
 * Get payment by ID from Supabase
 */
export async function getPaymentById(paymentId: string): Promise<PaymentDocument | null> {
    const payment = await paymentsSupabaseService.getPaymentById(paymentId);
    if (!payment) return null;
    return mapSupabaseToFirestoreFormat(payment);
}

/**
 * Get payment details for modal display
 */
export async function getPaymentDetails(paymentId: string): Promise<PaymentDetailModalData | null> {
    const payment = await getPaymentById(paymentId);

    if (!payment) {
        return null;
    }

    const createdAt = payment.createdAt instanceof Date
        ? payment.createdAt
        : new Date(payment.createdAt as string);

    const updatedAt = payment.updatedAt instanceof Date
        ? payment.updatedAt
        : new Date(payment.updatedAt as string);

    const validUntil = typeof payment.validUntil === 'string'
        ? new Date(payment.validUntil)
        : payment.validUntil instanceof Date
            ? payment.validUntil
            : new Date();

    const detailData: PaymentDetailModalData = {
        studentName: payment.studentName,
        studentId: payment.studentId,
        studentUid: payment.studentUid,
        paymentId: payment.paymentId,
        amount: payment.amount,
        durationYears: payment.durationYears,
        method: payment.method,
        status: payment.status,
        sessionStartYear: payment.sessionStartYear,
        sessionEndYear: payment.sessionEndYear,
        validUntil,
        createdAt,
        updatedAt,
    };

    if (isOfflinePayment(payment)) {
        detailData.offlineTransactionId = payment.offlineTransactionId;

        if (payment.approvedBy && payment.approvedBy.type === 'Manual') {
            const approvedAt = payment.approvedAt instanceof Date
                ? payment.approvedAt
                : new Date(payment.approvedAt as string);

            detailData.approver = {
                name: payment.approvedBy.name,
                empId: payment.approvedBy.empId,
                role: payment.approvedBy.role,
                approvedAt,
            };
        }
    } else if (isOnlinePayment(payment)) {
        detailData.razorpayPaymentId = payment.razorpayPaymentId;
    }

    return detailData;
}

// ============================================================================
// IDEMPOTENCY CHECK
// ============================================================================

/**
 * Check if a payment has already been processed (idempotency check).
 * Canonical implementation — used by webhook and verify-payment routes.
 */
export async function isPaymentProcessed(paymentId: string): Promise<boolean> {
    // 1. Check by Primary ID (Supabase)
    const payment = await paymentsSupabaseService.getPaymentById(paymentId);
    if (payment?.status === 'Completed') return true;

    // 2. Check by Razorpay ID (Supabase) - In case paymentId passed is a Razorpay ID
    const paymentByRazorpay = await paymentsSupabaseService.getPaymentByRazorpayId(paymentId);
    if (paymentByRazorpay?.status === 'Completed') return true;

    return false;
}

// ============================================================================
// HELPER: Map Supabase format to Firestore format for backwards compatibility
// ============================================================================

function mapSupabaseToFirestoreFormat(p: PaymentRecord): PaymentDocument {
    return {
        paymentId: p.payment_id,
        studentId: p.student_id || '',
        studentUid: p.student_uid || '',
        studentName: p.student_name || '',
        amount: p.amount || 0,
        durationYears: p.duration_years || 1,
        method: p.method || 'Offline',
        status: p.status || 'Pending',
        sessionStartYear: p.session_start_year || new Date().getFullYear(),
        sessionEndYear: p.session_end_year || new Date().getFullYear() + 1,
        validUntil: p.valid_until || '',
        createdAt: p.transaction_date ? new Date(p.transaction_date) : (p.created_at ? new Date(p.created_at) : new Date()),
        updatedAt: p.transaction_date ? new Date(p.transaction_date) : (p.created_at ? new Date(p.created_at) : new Date()),
        ...(p.method === 'Offline' && {
            offlineTransactionId: p.offline_transaction_id,
        }),
        ...(p.method === 'Online' && {
            razorpayPaymentId: p.razorpay_payment_id,
            razorpayOrderId: p.razorpay_order_id,
        }),
        ...(p.approved_by && {
            approvedBy: p.approved_by,
            approvedAt: p.approved_at ? new Date(p.approved_at) : undefined,
        }),
    } as PaymentDocument;
}

// ============================================================================
// CONVERSION HELPERS
// ============================================================================

/**
 * Convert PaymentDocument to PaymentDisplayData for UI
 */
export function toDisplayData(payment: PaymentDocument): PaymentDisplayData {
    const createdAt = payment.createdAt instanceof Date
        ? payment.createdAt
        : new Date(payment.createdAt as string);

    const validUntil = typeof payment.validUntil === 'string'
        ? new Date(payment.validUntil)
        : payment.validUntil instanceof Date
            ? payment.validUntil
            : new Date();

    const displayData: PaymentDisplayData = {
        paymentId: payment.paymentId,
        studentName: payment.studentName,
        studentId: payment.studentId,
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
        durationYears: payment.durationYears,
        validUntil,
        createdAt,
    };

    if (isOfflinePayment(payment) && payment.approvedBy?.type === 'Manual') {
        displayData.approverName = payment.approvedBy.name;
        displayData.approverEmpId = payment.approvedBy.empId;
        displayData.approverRole = payment.approvedBy.role;

        if (payment.approvedAt) {
            displayData.approvedAt = payment.approvedAt instanceof Date
                ? payment.approvedAt
                : new Date(payment.approvedAt as string);
        }

        displayData.offlineTransactionId = payment.offlineTransactionId;
    }

    if (isOnlinePayment(payment)) {
        displayData.razorpayPaymentId = payment.razorpayPaymentId;
    }

    return displayData;
}
