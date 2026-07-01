/**
 * Payment History Service
 * 
 * ⚠️ REDUCED TO TYPE-ONLY MODULE
 * 
 * The canonical payment data access layer is:
 *   src/lib/services/payments-supabase.ts (PaymentsSupabaseService)
 * 
 * The canonical payment orchestration layer is:
 *   src/lib/payment/payment.service.ts
 * 
 * All functions previously in this file were dead code or pointed to
 * the wrong database table. They have been removed.
 * 
 * This file is retained ONLY for the PaymentRecord type import used by
 * application-payment.service.ts. It will be removed once that import
 * is updated.
 */

// Legacy type kept for backward compatibility only.
// Canonical PaymentRecord type is in src/lib/services/payments-supabase.ts
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
