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
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { paymentsSupabaseService } from '@/lib/services/payments-supabase';
import {
    PaymentDocument,
    OnlinePaymentDocument,
    OfflinePaymentDocument,
    CreateOnlinePaymentRequest,
    CreateOfflinePaymentRequest,
    ApprovePaymentRequest,
    RejectPaymentRequest,
    PaymentQueryFilters,
    PaginatedPaymentResponse,
    PaymentDisplayData,
    PaymentDetailModalData,
    generateOfflinePaymentId,
    generateOnlinePaymentId,
    isPaymentImmutable,
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
    const paymentId = generateOnlinePaymentId(request.purpose);

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
        studentName: request.studentName || 'Null', // Fallback for missing name
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

    if (result) {
        console.log(`✅ Online payment created in SUPABASE: ${request.razorpayPaymentId}`);
    } else {
        console.error(`❌ Failed to create payment in Supabase: ${request.razorpayPaymentId}`);
    }

    return paymentDoc;
}

/**
 * Create an offline payment record (pending approval)
 * Called when student submits offline payment request
 * 
 * ✅ WRITES TO SUPABASE (not Firestore)
 */
export async function createOfflinePayment(
    request: CreateOfflinePaymentRequest
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
        status: 'Pending',
        sessionStartYear: request.sessionStartYear,
        sessionEndYear: request.sessionEndYear,
        validUntil: request.validUntil,
        createdAt: now,
        updatedAt: now,
        offlineTransactionId: request.offlineTransactionId,
    };

    // ✅ Write to SUPABASE (IMMUTABLE - cannot be deleted later)
    const result = await paymentsSupabaseService.createPayment({
        paymentId,
        studentId: request.studentId,
        studentUid: request.studentUid,
        amount: request.amount,
        method: 'Offline',
        status: 'Pending',
        sessionStartYear: request.sessionStartYear,
        sessionEndYear: request.sessionEndYear,
        durationYears: request.durationYears,
        validUntil: typeof request.validUntil === 'string' ? new Date(request.validUntil) : undefined,
        transactionDate: now,
        offlineTransactionId: request.offlineTransactionId,
    });

    if (result) {
        console.log(`📋 Offline payment created in SUPABASE (pending): ${paymentId}`);
    } else {
        console.error(`❌ Failed to create offline payment in Supabase: ${paymentId}`);
    }

    return paymentDoc;
}

// ============================================================================
// PAYMENT APPROVAL/REJECTION - NOW USES SUPABASE
// ============================================================================

/**
 * Approve an offline payment
 * Updates payment status in Supabase and student validity in Firestore
 * 
 * ✅ PAYMENT STATUS IN SUPABASE, STUDENT UPDATE IN FIRESTORE
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

        if (payment.status === 'Completed') {
            throw new Error('Payment already completed');
        }

        if (payment.method !== 'Offline') {
            throw new Error('Cannot manually approve online payments');
        }

        // Update payment status in Supabase
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
            throw new Error('Failed to update payment status in Supabase');
        }

        // Update student document validity in Firestore
        if (payment.student_uid) {
            const studentRef = adminDb.collection(STUDENTS_COLLECTION).doc(payment.student_uid);
            await studentRef.update({
                validUntil: payment.valid_until ? new Date(payment.valid_until) : null,
                sessionStartYear: payment.session_start_year,
                sessionEndYear: payment.session_end_year,
                status: 'active',
                updatedAt: FieldValue.serverTimestamp(),
            });
        }

        console.log(`✅ Offline payment approved in SUPABASE: ${request.paymentId} by ${request.approverName}`);

        // Return compatible format
        return {
            success: true,
            payment: {
                paymentId: payment.payment_id,
                studentId: payment.student_id || '',
                studentUid: payment.student_uid || '',
                studentName: '', // Student name fetched from Firestore
                amount: payment.amount || 0,
                durationYears: payment.duration_years || 1,
                method: payment.method as 'Online' | 'Offline',
                status: 'Completed',
                sessionStartYear: payment.session_start_year || new Date().getFullYear(),
                sessionEndYear: payment.session_end_year || new Date().getFullYear() + 1,
                validUntil: payment.valid_until || '',
                createdAt: new Date(payment.transaction_date || Date.now()),
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
 * Reject an offline payment
 * 
 * ⚠️ IMPORTANT: Payments are IMMUTABLE and cannot be deleted.
 * Rejecting a payment leaves it in 'Pending' status with a log entry.
 * The payment record remains in the database as an audit trail.
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

        if (payment.method !== 'Offline') {
            throw new Error('Cannot reject online payments');
        }

        // ⚠️ PAYMENTS ARE IMMUTABLE - Cannot delete
        // Log the rejection but leave the payment record intact
        console.warn(`⚠️ Payment rejection requested for: ${request.paymentId}`);
        console.warn(`   Rejector: ${request.rejectorName} (${request.rejectorRole})`);
        console.warn(`   ℹ️ Payment record preserved (immutable ledger).`);
        console.warn(`   ℹ️ Payment remains in 'Pending' status and will not be approved.`);

        // Note: In a production system, you might want to add a 'rejected' status
        // or store rejection info in a separate audit table.
        // For now, the payment stays as 'Pending' and is effectively ignored.

        return {
            success: true,
            // Inform caller that deletion was not performed
        };
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
    let allPayments: PaymentDocument[] = [];
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

    // 2. Fetch by Enrollment ID if available
    if (studentId) {
        const paymentsById = await paymentsSupabaseService.getPaymentsByStudentId(studentId);
        const mappedById = paymentsById.map(mapSupabaseToFirestoreFormat);

        for (const p of mappedById) {
            if (!fetchedPaymentIds.has(p.paymentId)) {
                fetchedPaymentIds.add(p.paymentId);
                allPayments.push(p);
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
        let allPayments: PaymentDocument[] = [];
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

        // 2. Fetch by Enrollment ID if available
        if (filters.studentId) {
            const paymentsById = await paymentsSupabaseService.getPaymentsByStudentId(filters.studentId);
            const mappedById = paymentsById.map(mapSupabaseToFirestoreFormat);

            for (const p of mappedById) {
                if (!fetchedPaymentIds.has(p.paymentId)) {
                    fetchedPaymentIds.add(p.paymentId);
                    allPayments.push(p);
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

    // Otherwise, use recent transactions (ad-hoc filtering for now)
    const payments = await paymentsSupabaseService.getRecentTransactions(200);

    // Apply filters manually
    let filtered = payments.map(mapSupabaseToFirestoreFormat);

    if (filters?.method) {
        filtered = filtered.filter(p => p.method === filters.method);
    }
    if (filters?.status) {
        filtered = filtered.filter(p => p.status === filters.status);
    }
    if (filters?.year) {
        filtered = filtered.filter(p => p.sessionStartYear === filters.year);
    }

    // Apply pagination
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
// DEPRECATED OPERATIONS (Payments are immutable)
// ============================================================================

/**
 * @deprecated Payments are immutable financial records and cannot be deleted.
 * This function is kept for backward compatibility but does nothing.
 */
export async function deletePaymentsForStudent(studentUid: string): Promise<number> {
    console.warn(`⚠️ [BLOCKED] deletePaymentsForStudent(${studentUid}) called`);
    console.warn(`   Payments are IMMUTABLE and cannot be deleted.`);
    console.warn(`   Payment records remain in Supabase permanently.`);
    return 0; // No payments deleted
}

/**
 * Check if a payment has already been processed (idempotency check)
 */
export async function isPaymentProcessed(paymentId: string): Promise<boolean> {
    // 1. Check by Primary ID (Supabase)
    const payment = await paymentsSupabaseService.getPaymentById(paymentId);
    if (payment?.status === 'Completed') return true;

    // 2. Check by Razorpay ID (Supabase) - In case paymentId passed is a Razorpay ID
    const paymentByRazorpay = await paymentsSupabaseService.getPaymentByRazorpayId(paymentId);
    if (paymentByRazorpay?.status === 'Completed') return true;

    // 3. Fallback to Firestore (Legacy)
    try {
        const doc = await adminDb.collection('payments').doc(paymentId).get();
        if (doc.exists) {
            const data = doc.data();
            if (data?.status === 'Completed' || data?.status === 'completed') return true;
        }
    } catch (e) {
        // Ignore firestore error
    }

    return false;
}

// ============================================================================
// STATISTICS & REPORTING
// ============================================================================

/**
 * Get payment statistics for a time period from Supabase
 */
export async function getPaymentStatistics(
    startDate?: Date,
    endDate?: Date
): Promise<{
    totalPayments: number;
    completedPayments: number;
    pendingPayments: number;
    totalAmount: number;
    onlinePayments: number;
    offlinePayments: number;
}> {
    // Use Supabase to get all payments (can be optimized with date filters)
    const payments = await paymentsSupabaseService.getRecentTransactions(1000);

    // Apply date filters if provided
    let filtered = payments;
    if (startDate) {
        filtered = filtered.filter(p => new Date(p.transaction_date || 0) >= startDate);
    }
    if (endDate) {
        filtered = filtered.filter(p => new Date(p.transaction_date || 0) <= endDate);
    }

    const stats = {
        totalPayments: filtered.length,
        completedPayments: filtered.filter(p => p.status === 'Completed').length,
        pendingPayments: filtered.filter(p => p.status === 'Pending').length,
        totalAmount: filtered
            .filter(p => p.status === 'Completed')
            .reduce((sum, p) => sum + (p.amount || 0), 0),
        onlinePayments: filtered.filter(p => p.method === 'Online').length,
        offlinePayments: filtered.filter(p => p.method === 'Offline').length,
    };

    return stats;
}

// ============================================================================
// HELPER: Map Supabase format to Firestore format for backwards compatibility
// ============================================================================

function mapSupabaseToFirestoreFormat(p: any): PaymentDocument {
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
        createdAt: p.transaction_date ? new Date(p.transaction_date) : new Date(),
        updatedAt: p.updated_at ? new Date(p.updated_at) : new Date(),
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
