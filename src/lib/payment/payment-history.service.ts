/**
 * Payment History Service
 * Manages payment records in Firestore and Supabase
 */

import { adminDb } from '@/lib/firebase-admin';
import { getSupabaseServer } from '@/lib/supabase-server';
import { FieldValue } from 'firebase-admin/firestore';
import { paymentsSupabaseService } from '@/lib/services/payments-supabase';

// Payment record types
export interface PaymentRecord {
  id?: string;
  paymentId: string;
  orderId: string;
  userId: string;
  userName: string;
  userEmail?: string;
  userPhone?: string;
  enrollmentId?: string;
  amount: number;
  currency: string;
  status: 'pending' | 'success' | 'failed' | 'refunded';
  purpose: string;
  method?: string;
  signature?: string;
  notes?: Record<string, any>;
  errorMessage?: string;
  refundId?: string;
  refundAmount?: number;
  refundStatus?: string;
  refundedAt?: Date;
  createdAt: Date;
  updatedAt?: Date;
  capturedAt?: Date;
  paymentDetails?: any;
}

export interface PaymentSummary {
  totalPayments: number;
  successfulPayments: number;
  failedPayments: number;
  totalAmount: number;
  refundedAmount: number;
  pendingAmount: number;
  lastPaymentDate?: Date;
}

/**
 * Save payment record - NOW WRITES TO SUPABASE (Firestore is blocked)
 * @deprecated Use paymentsSupabaseService.createPayment instead
 */
export async function savePaymentToFirestore(payment: PaymentRecord): Promise<string> {
  try {
    // Create payment in Supabase
    const paymentId = await paymentsSupabaseService.createPayment({
      paymentId: payment.paymentId,
      studentUid: payment.userId,
      studentName: payment.userName,
      amount: payment.amount,
      method: payment.method === 'Online' || payment.method === 'Offline' ? payment.method : 'Online',
      status: payment.status === 'success' ? 'Completed' : payment.status === 'failed' ? 'Rejected' : 'Pending',
      transactionDate: payment.createdAt,
      razorpayPaymentId: payment.paymentId.startsWith('pay_') ? payment.paymentId : undefined,
      razorpayOrderId: payment.orderId,
      metadata: {
        purpose: payment.purpose,
        notes: payment.notes,
        userEmail: payment.userEmail,
        userPhone: payment.userPhone,
        enrollmentId: payment.enrollmentId,
        signature: payment.signature,
        legacyFields: true,
      },
    });

    if (!paymentId) {
      throw new Error('Failed to save payment to Supabase');
    }

    // Also update user's payment history in Firestore (this is still allowed)
    if (payment.userId) {
      try {
        await adminDb.collection('users').doc(payment.userId).update({
          lastPayment: {
            paymentId: payment.paymentId,
            amount: payment.amount,
            status: payment.status,
            date: FieldValue.serverTimestamp(),
          },
          'paymentStats.totalPayments': FieldValue.increment(1),
          'paymentStats.totalAmount': FieldValue.increment(payment.status === 'success' ? payment.amount : 0),
        });
      } catch (userUpdateErr) {
        console.warn('Failed to update user payment stats:', userUpdateErr);
      }
    }

    return paymentId;
  } catch (error) {
    throw error;
  }
}

/**
 * Save payment record to Supabase
 */
export async function savePaymentToSupabase(payment: PaymentRecord): Promise<string> {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from('payment_history')
      .insert({
        payment_id: payment.paymentId,
        order_id: payment.orderId,
        user_id: payment.userId,
        user_name: payment.userName,
        user_email: payment.userEmail,
        user_phone: payment.userPhone,
        enrollment_id: payment.enrollmentId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        purpose: payment.purpose,
        method: payment.method,
        signature: payment.signature,
        notes: payment.notes,
        error_message: payment.errorMessage,
        created_at: payment.createdAt,
        captured_at: payment.capturedAt,
      })
      .select('id')
      .single();

    if (error) throw error;

    return data.id;
  } catch (error) {
    throw error;
  }
}

/**
 * Update payment status
 */
export async function updatePaymentStatus(
  paymentId: string,
  status: PaymentRecord['status'],
  additionalData?: Partial<PaymentRecord>
): Promise<void> {
  try {
    // Update in Supabase (primary source of truth)
    let supabaseSuccess = false;
    try {
      const supabase = getSupabaseServer();
      await supabase
        .from('payment_history')
        .update({
          status,
          updated_at: new Date(),
        })
        .eq('payment_id', paymentId);
      supabaseSuccess = true;
    } catch (supabaseErr) {
      console.error('Supabase payment status update failed:', supabaseErr);
    }

    // Update in Firestore (secondary/cache)
    let firestoreSuccess = false;
    try {
      const paymentQuery = await adminDb
        .collection('payments')
        .where('paymentId', '==', paymentId)
        .limit(1)
        .get();

      if (!paymentQuery.empty) {
        const doc = paymentQuery.docs[0];
        await doc.ref.update({
          status,
          ...additionalData,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      firestoreSuccess = true;
    } catch (firestoreErr) {
      console.error('Firestore payment status update failed:', firestoreErr);
    }

    // Detect divergence: one succeeded, the other failed
    if (supabaseSuccess !== firestoreSuccess) {
      try {
        await adminDb.collection('audit_failures').add({
          kind: 'payment_status_dual_write_divergence',
          paymentId,
          newStatus: status,
          supabaseSuccess,
          firestoreSuccess,
          recovered: false,
          createdAtISO: new Date().toISOString(),
        });
      } catch (outboxErr) {
        console.error('CRITICAL: Could not record payment status divergence:', outboxErr);
      }
    }

    console.log('✅ Payment status updated:', paymentId?.substring(0,8)+'...', status);
  } catch (error) {
    console.error('❌ Error updating payment status:', error);
    throw error;
  }
}

/**
 * Get payment by payment ID
 */
export async function getPaymentByPaymentId(paymentId: string): Promise<PaymentRecord | null> {
  try {
    const paymentQuery = await adminDb
      .collection('payments')
      .where('paymentId', '==', paymentId)
      .limit(1)
      .get();

    if (paymentQuery.empty) {
      return null;
    }

    const doc = paymentQuery.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
    } as PaymentRecord;
  } catch (error) {
    console.error('❌ Error fetching payment:', error);
    return null;
  }
}

/**
 * Get user payment history
 */
export async function getUserPaymentHistory(
  userId: string,
  limit: number = 10
): Promise<PaymentRecord[]> {
  try {
    const paymentsQuery = await adminDb
      .collection('payments')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return paymentsQuery.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    } as PaymentRecord));
  } catch (error) {
    console.error('❌ Error fetching user payment history:', error);
    return [];
  }
}

/**
 * Get payment summary for a user
 */
export async function getUserPaymentSummary(userId: string): Promise<PaymentSummary> {
  try {
    const payments = await getUserPaymentHistory(userId, 1000);

    const summary: PaymentSummary = {
      totalPayments: payments.length,
      successfulPayments: payments.filter(p => p.status === 'success').length,
      failedPayments: payments.filter(p => p.status === 'failed').length,
      totalAmount: payments
        .filter(p => p.status === 'success')
        .reduce((sum, p) => sum + p.amount, 0),
      refundedAmount: payments
        .filter(p => p.status === 'refunded')
        .reduce((sum, p) => sum + (p.refundAmount || p.amount), 0),
      pendingAmount: payments
        .filter(p => p.status === 'pending')
        .reduce((sum, p) => sum + p.amount, 0),
      lastPaymentDate: payments[0]?.createdAt,
    };

    return summary;
  } catch (error) {
    console.error('❌ Error calculating payment summary:', error);
    return {
      totalPayments: 0,
      successfulPayments: 0,
      failedPayments: 0,
      totalAmount: 0,
      refundedAmount: 0,
      pendingAmount: 0,
    };
  }
}

/**
 * Process refund for a payment
 */
export async function processRefund(
  paymentId: string,
  refundAmount?: number,
  reason?: string
): Promise<void> {
  try {
    const payment = await getPaymentByPaymentId(paymentId);
    if (!payment) {
      throw new Error('Payment not found');
    }

    if (payment.status !== 'success') {
      throw new Error('Only successful payments can be refunded');
    }

    // Call Razorpay refund API
    const { initializeRazorpay } = await import('./razorpay.service');
    const razorpay = await initializeRazorpay();
    const refundOptions: any = {};
    if (refundAmount) {
      refundOptions.amount = Math.round(refundAmount * 100); // Convert to paise
    }
    if (reason) {
      refundOptions.notes = { reason };
    }
    await razorpay.payments.refund(paymentId, refundOptions);

    // Update payment record after successful Razorpay refund
    await updatePaymentStatus(paymentId, 'refunded', {
      refundAmount: refundAmount || payment.amount,
      refundStatus: 'processed',
      refundedAt: new Date(),
      notes: {
        ...payment.notes,
        refundReason: reason,
      },
    });

    console.log('✅ Refund processed for payment:', paymentId?.substring(0,8)+'...');
  } catch (error) {
    console.error('❌ Error processing refund:', error);
    throw error;
  }
}

/**
 * Get payment statistics for admin dashboard (from Supabase)
 */
export async function getPaymentStatistics(
  startDate?: Date,
  endDate?: Date
): Promise<{
  totalRevenue: number;
  totalTransactions: number;
  successRate: number;
  averageTransactionValue: number;
  topPaymentMethods: Record<string, number>;
  dailyRevenue: Record<string, number>;
}> {
  try {
    const { paymentsSupabaseService } = await import('@/lib/services/payments-supabase');
    
    // Default to last 30 days if no dates provided
    const end = endDate || new Date();
    const start = startDate || new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Fetch ONLY completed payments in the date range, using server-side filtering
    const paymentDocs = await paymentsSupabaseService.getCompletedPaymentsForReporting(start, end);

    // Calculate statistics
    const totalRevenue = paymentDocs.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalTransactions = paymentDocs.length;
    const successRate = totalTransactions > 0 ? 100 : 0;
    const averageTransactionValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    // Payment methods breakdown
    const topPaymentMethods: Record<string, number> = {};
    paymentDocs.forEach(p => {
      const method = p.method || 'unknown';
      topPaymentMethods[method] = (topPaymentMethods[method] || 0) + 1;
    });

    // Daily revenue
    const dailyRevenue: Record<string, number> = {};
    paymentDocs.forEach(p => {
      const date = new Date(p.transaction_date || 0).toISOString().split('T')[0];
      dailyRevenue[date] = (dailyRevenue[date] || 0) + (p.amount || 0);
    });

    return {
      totalRevenue,
      totalTransactions,
      successRate,
      averageTransactionValue,
      topPaymentMethods,
      dailyRevenue,
    };
  } catch (error) {
    console.error('❌ Error calculating payment statistics:', error);
    throw error;
  }
}

