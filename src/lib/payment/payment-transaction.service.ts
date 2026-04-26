import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { paymentsSupabaseService } from '@/lib/services/payments-supabase';

export interface PaymentTransaction {
  // Core Fields (Required)
  studentId: string; // Enrollment ID
  studentName: string;
  amount: number;
  paymentMethod: 'online' | 'offline' | 'manual';
  paymentId: string;
  timestamp: string; // ISO string
  durationYears: number;
  validUntil: string; // ISO string - for compatibility
  status?: 'completed' | 'pending' | 'failed';
  offlineTransactionId?: string; // UPI ID or Reference ID
  sessionStartYear?: number;
  sessionEndYear?: number;

  // Extended Audit Fields (Optional - for offline/manual renewals)
  studentEmail?: string;
  studentPhone?: string;

  // Detailed Validity Tracking
  previousValidUntil?: string | null;
  newValidUntil?: string;
  previousSessionEndYear?: number;
  newSessionEndYear?: number;
  previousDurationYears?: number;
  newDurationYears?: number;

  // Detailed Approver Information (for fraud prevention)
  approvedBy?: string | {
    name: string;
    empId: string;
    userId: string;
    email: string;
    role: 'admin' | 'moderator';
  };
  approvedByDisplay?: string; // "Name (EmpId)" format

  // Request Tracking
  renewalRequestId?: string;
  requestSubmittedAt?: string | null;

  // Multiple Timestamps for Verification
  timestampMs?: number;
  approvedAtISO?: string;



  // Allow additional fields for future extensions
  [key: string]: any;
}

export class PaymentTransactionService {
  /**
   * Save a transaction record - NOW WRITES TO SUPABASE (Firestore is blocked)
   * Prevents duplicates by checking for existing records first.
   */
  static async saveTransaction(transaction: PaymentTransaction): Promise<void> {
    try {
      // 1. Check if record already exists to avoid redundant creation
      const existing = await paymentsSupabaseService.getPaymentById(transaction.paymentId);
      
      // Map legacy status/method to Supabase format
      let status: 'Pending' | 'Completed' = 'Completed';
      if (transaction.status === 'pending') status = 'Pending';
      if (transaction.status === 'failed') status = 'Pending';
      
      const method: 'Online' | 'Offline' = (transaction.paymentMethod === 'online') ? 'Online' : 'Offline';

      if (existing) {
        // If it exists and is already completed, don't re-save unless it's a forced update
        if (existing.status === 'Completed' && status === 'Completed') {
          console.log(`[PaymentTransaction] Record ${transaction.paymentId} already completed, skipping.`);
          return;
        }

        // It exists but needs status/validity update (e.g. Pending -> Completed)
        console.log(`[PaymentTransaction] Updating existing record: ${transaction.paymentId}`);
        await paymentsSupabaseService.updatePaymentStatus(
          transaction.paymentId,
          status as any,
          typeof transaction.approvedBy === 'object' ? (transaction.approvedBy as any) : undefined
        );
        
        // Return as the status update is usually the main goal of re-saving during approval
        return;
      }

      // 2. Create new payment in Supabase (Uses upsert internally for safety)
      const paymentId = await paymentsSupabaseService.createPayment({
        paymentId: transaction.paymentId,
        studentId: transaction.studentId,
        studentUid: transaction.userId || transaction.studentUid,
        studentName: transaction.studentName,
        amount: transaction.amount,
        method,
        status,
        sessionStartYear: transaction.sessionStartYear,
        sessionEndYear: transaction.sessionEndYear,
        durationYears: transaction.durationYears,
        validUntil: transaction.validUntil ? new Date(transaction.validUntil) : undefined,
        transactionDate: transaction.timestamp ? new Date(transaction.timestamp) : new Date(),
        offlineTransactionId: transaction.offlineTransactionId,
        approvedBy: typeof transaction.approvedBy === 'object' ? (transaction.approvedBy as any) : undefined,
        approvedAt: transaction.approvedAtISO ? new Date(transaction.approvedAtISO) : undefined,
      });

      if (!paymentId) {
        throw new Error('Failed to save transaction to Supabase');
      }
    } catch (error) {
      console.error('[PaymentTransaction] Save error:', (error as any)?.message);
      throw error;
    }
  }

  /**
   * Check if a payment has already been processed
   * Checks Supabase first, then Firestore for legacy data
   */
  static async isPaymentProcessed(paymentId: string): Promise<boolean> {
    try {
      // Check Supabase (primary source of truth)
      const supabasePayment = await paymentsSupabaseService.getPaymentById(paymentId);

      if (supabasePayment) {
        return supabasePayment.status === 'Completed';
      }

      // Fall back to Firestore for legacy data
      const doc = await adminDb.collection('payments').doc(paymentId).get();
      if (!doc.exists) return false;
      const data = doc.data();
      return data?.status === 'Completed' || data?.status === 'completed';
    } catch {
      return false;
    }
  }

  /**
   * Get all transactions for a specific student from Supabase
   */
  static async getStudentTransactions(studentId: string): Promise<PaymentTransaction[]> {
    try {
      const payments = await paymentsSupabaseService.getPaymentsByStudentUid(studentId);

      return payments.map(p => ({
        studentId: p.student_id || '',
        studentName: p.student_name || '',
        amount: p.amount || 0,
        paymentMethod: (p.method?.toLowerCase() === 'online' ? 'online' : 'offline') as 'online' | 'offline' | 'manual',
        paymentId: p.payment_id,
        timestamp: p.transaction_date || new Date().toISOString(),
        durationYears: p.duration_years || 1,
        validUntil: p.valid_until || '',
        status: (p.status?.toLowerCase() === 'completed' ? 'completed' : p.status?.toLowerCase() === 'pending' ? 'pending' : 'failed') as 'completed' | 'pending' | 'failed',
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get all transactions (for admin/moderator view) from Supabase
   */
  static async getAllTransactions(
    year?: number,
    month?: number,
    studentId?: string
  ): Promise<PaymentTransaction[]> {
    try {
      const payments = await paymentsSupabaseService.getRecentTransactions(1000);

      let transactions = payments.map(p => ({
        studentId: p.student_id || '',
        studentName: p.student_name || '',
        amount: p.amount || 0,
        paymentMethod: (p.method?.toLowerCase() === 'online' ? 'online' : 'offline') as 'online' | 'offline' | 'manual',
        paymentId: p.payment_id,
        timestamp: p.transaction_date || new Date().toISOString(),
        durationYears: p.duration_years || 1,
        validUntil: p.valid_until || '',
        status: (p.status?.toLowerCase() === 'completed' ? 'completed' : p.status?.toLowerCase() === 'pending' ? 'pending' : 'failed') as 'completed' | 'pending' | 'failed',
      }));

      // Filter by studentId if provided
      if (studentId) {
        transactions = transactions.filter(t => t.studentId === studentId);
      }

      // In-memory filtering for year/month if provided
      if (year) {
        transactions = transactions.filter(t => new Date(t.timestamp).getFullYear() === year);
      }
      if (month) {
        transactions = transactions.filter(t => new Date(t.timestamp).getMonth() + 1 === month);
      }

      return transactions;
    } catch {
      return [];
    }
  }

  /**
   * Get paginated transactions for admin view
   */
  static async getPaginatedTransactions(
    page: number = 1,
    limit: number = 50,
    filters?: {
      year?: number;
      month?: number;
      studentId?: string;
      paymentMethod?: 'online' | 'offline' | 'manual';
    }
  ): Promise<{
    transactions: PaymentTransaction[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const allTransactions = await this.getAllTransactions(
      filters?.year,
      filters?.month,
      filters?.studentId
    );

    // Apply additional filters
    let filtered = allTransactions;
    if (filters?.paymentMethod) {
      filtered = filtered.filter(t => t.paymentMethod === filters.paymentMethod);
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    return {
      transactions: filtered.slice(startIndex, endIndex),
      total,
      page,
      totalPages
    };
  }

  /**
   * Mark a transaction as pending (in Supabase)
   */
  static async markTransactionPending(paymentId: string): Promise<void> {
    try {
      await paymentsSupabaseService.updatePaymentStatus(paymentId, 'Completed');
    } catch {
      // Non-critical: best-effort status update
    }
  }
}
