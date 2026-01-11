import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

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
   */
  static async saveTransaction(transaction: PaymentTransaction): Promise<void> {
    console.log('💾 Saving transaction to Supabase:', transaction.paymentId);

    try {
      // Import the Supabase payments service
      const { paymentsSupabaseService } = await import('@/lib/services/payments-supabase');

      // Map legacy status to unified status
      let status: 'Pending' | 'Completed' = 'Completed';
      if (transaction.status === 'pending') status = 'Pending';
      if (transaction.status === 'failed') status = 'Pending'; // Map failed to Pending as Rejected is not supported for now

      // Map legacy method to unified method
      const method: 'Online' | 'Offline' = (transaction.paymentMethod === 'online') ? 'Online' : 'Offline';

      // Create payment in Supabase
      const paymentId = await paymentsSupabaseService.createPayment({
        paymentId: transaction.paymentId,
        studentId: transaction.studentId,
        studentUid: transaction.userId || transaction.studentUid,
        studentName: transaction.studentName,
        amount: transaction.amount,
        method,
        status,
        durationYears: transaction.durationYears,
        validUntil: transaction.validUntil ? new Date(transaction.validUntil) : undefined,
        transactionDate: transaction.timestamp ? new Date(transaction.timestamp) : new Date(),
        offlineTransactionId: transaction.offlineTransactionId,
        approvedBy: typeof transaction.approvedBy === 'object' ? transaction.approvedBy : undefined,
        approvedAt: transaction.approvedAtISO ? new Date(transaction.approvedAtISO) : undefined,
      });


      if (!paymentId) {
        throw new Error('Failed to save transaction to Supabase');
      }

      console.log('✅ Transaction saved to Supabase successfully:', paymentId);
    } catch (error) {
      console.error('❌ Error saving transaction to Supabase:', error);
      throw error;
    }
  }

  /**
   * Check if a payment has already been processed
   * Checks Supabase first, then Firestore for legacy data
   */
  static async isPaymentProcessed(paymentId: string): Promise<boolean> {
    try {
      // Check Supabase first (primary)
      const { paymentsSupabaseService } = await import('@/lib/services/payments-supabase');
      const supabasePayment = await paymentsSupabaseService.getPaymentById(paymentId);

      if (supabasePayment) {
        return supabasePayment.status === 'Completed';
      }

      // Fall back to Firestore for legacy data
      const doc = await adminDb.collection('payments').doc(paymentId).get();
      if (!doc.exists) return false;
      const data = doc.data();
      return data?.status === 'Completed' || data?.status === 'completed';
    } catch (error) {
      console.error('Error checking payment processed status:', error);
      return false;
    }
  }

  /**
   * Get all transactions for a specific student from Supabase
   */
  static async getStudentTransactions(studentId: string): Promise<PaymentTransaction[]> {
    try {
      const { paymentsSupabaseService } = await import('@/lib/services/payments-supabase');
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
    } catch (error) {
      console.error('Error reading student transactions:', error);
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
      const { paymentsSupabaseService } = await import('@/lib/services/payments-supabase');
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
    } catch (error) {
      console.error('Error reading all transactions:', error);
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
      const { paymentsSupabaseService } = await import('@/lib/services/payments-supabase');
      await paymentsSupabaseService.updatePaymentStatus(paymentId, 'Completed');
    } catch (error) {
      console.error('Error marking transaction pending:', error);
    }
  }
}
