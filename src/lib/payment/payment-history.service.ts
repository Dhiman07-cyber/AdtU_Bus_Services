/**
 * Payment History Service
 * Manages payment records in Firestore and Supabase
 */

import { adminDb } from '@/lib/firebase-admin';
import { supabase } from '@/lib/supabase-client';
import { FieldValue } from 'firebase-admin/firestore';

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
    // Import the Supabase payments service
    const { paymentsSupabaseService } = await import('@/lib/services/payments-supabase');

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

    console.log('✅ Payment saved to Supabase:', paymentId);
    return paymentId;
  } catch (error) {
    console.error('❌ Error saving payment:', error);
    throw error;
  }
}

/**
 * Save payment record to Supabase
 */
export async function savePaymentToSupabase(payment: PaymentRecord): Promise<string> {
  try {

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

    console.log('✅ Payment saved to Supabase:', data.id);
    return data.id;
  } catch (error) {
    console.error('❌ Error saving payment to Supabase:', error);
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
    // Update in Firestore
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

    // Update in Supabase
    await supabase
      .from('payment_history')
      .update({
        status,
        updated_at: new Date(),
      })
      .eq('payment_id', paymentId);

    console.log('✅ Payment status updated:', paymentId, status);
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
    throw error;
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
    throw error;
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
    throw error;
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

    // TODO: Call Razorpay refund API here
    // const razorpay = await initializeRazorpay();
    // const refund = await razorpay.payments.refund(paymentId, {
    //   amount: refundAmount ? refundAmount * 100 : undefined,
    //   notes: { reason },
    // });

    // Update payment record
    await updatePaymentStatus(paymentId, 'refunded', {
      refundAmount: refundAmount || payment.amount,
      refundStatus: 'processed',
      refundedAt: new Date(),
      notes: {
        ...payment.notes,
        refundReason: reason,
      },
    });

    console.log('✅ Refund processed for payment:', paymentId);
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
    let paymentDocs = await paymentsSupabaseService.getRecentTransactions(1000);

    // Filter by status (Completed = success)
    paymentDocs = paymentDocs.filter(p => p.status === 'Completed');

    // Filter by date range if provided
    if (startDate) {
      paymentDocs = paymentDocs.filter(p =>
        new Date(p.transaction_date || 0) >= startDate
      );
    }
    if (endDate) {
      paymentDocs = paymentDocs.filter(p =>
        new Date(p.transaction_date || 0) <= endDate
      );
    }

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

