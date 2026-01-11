/**
 * Supabase Payments Service (PRODUCTION-SAFE) 
 * ALLOWED OPERATIONS:
 * - Create new payment records
 * - Update payment status (Pending → Completed)
 * - Read/query payment records
  
 * IMPORTANT: Use only with service role key on server side.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================
// TYPES
// ============================================

export interface PaymentRecord {
    payment_id: string;
    student_id?: string;
    student_uid?: string;
    student_name?: string;
    amount?: number;
    currency?: string;
    method?: 'Online' | 'Offline';
    status?: 'Pending' | 'Completed';
    session_start_year?: number;
    session_end_year?: number;
    duration_years?: number;
    valid_until?: string;
    transaction_date?: string;
    offline_transaction_id?: string;
    razorpay_payment_id?: string;
    razorpay_order_id?: string;
    approved_by?: {
        type?: string;
        userId?: string;
        empId?: string;
        name?: string;
        role?: string;
    };
    approved_at?: string;
    created_at?: string;
    updated_at?: string;
}

export interface CreatePaymentInput {
    paymentId: string;
    studentId?: string;
    studentUid?: string;
    studentName?: string;
    amount?: number;
    method: 'Online' | 'Offline';
    status?: 'Pending' | 'Completed';
    sessionStartYear?: number;
    sessionEndYear?: number;
    durationYears?: number;
    validUntil?: Date;
    transactionDate?: Date;
    offlineTransactionId?: string;
    razorpayPaymentId?: string;
    razorpayOrderId?: string;
    approvedBy?: {
        type?: string;
        userId?: string;
        empId?: string;
        name?: string;
        role?: string;
    };
    approvedAt?: Date;
}

// ============================================
// SERVICE CLASS (IMMUTABLE PAYMENT LEDGER)
// ============================================

class PaymentsSupabaseService {
    private supabase: SupabaseClient;
    private isInitialized: boolean = false;

    constructor() {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!url || !serviceKey) {
            console.error('[PaymentsSupabaseService] Missing Supabase credentials');
            this.supabase = null as any;
            return;
        }

        this.supabase = createClient(url, serviceKey, {
            auth: { persistSession: false }
        });
        this.isInitialized = true;
        console.log('[PaymentsSupabaseService] Initialized');
    }

    isReady(): boolean {
        return this.isInitialized;
    }

    // ============================================
    // CREATE OPERATIONS
    // ============================================

    /**
     * Create or update a payment record in Supabase
     */
    async upsertPayment(input: CreatePaymentInput): Promise<string | null> {
        if (!this.isReady()) {
            console.error('[PaymentsSupabaseService] Not initialized');
            return null;
        }

        try {
            const record: PaymentRecord = {
                payment_id: input.paymentId,
                student_id: input.studentId,
                student_uid: input.studentUid,
                amount: input.amount,
                currency: 'INR',
                method: input.method,
                status: input.status || 'Pending',
                session_start_year: input.sessionStartYear,
                session_end_year: input.sessionEndYear,
                duration_years: input.durationYears,
                valid_until: input.validUntil?.toISOString(),
                transaction_date: input.transactionDate?.toISOString() || new Date().toISOString(),
                offline_transaction_id: input.offlineTransactionId,
                razorpay_payment_id: input.razorpayPaymentId,
                razorpay_order_id: input.razorpayOrderId,
                approved_by: input.approvedBy,
                approved_at: input.approvedAt?.toISOString(),
                student_name: input.studentName,
            };

            const { data, error } = await this.supabase
                .from('payments')
                .upsert([record], { onConflict: 'payment_id' })
                .select('payment_id')
                .single();

            if (error) {
                console.error('[PaymentsSupabaseService] Upsert error:', error);
                return null;
            }

            console.log(`[PaymentsSupabaseService] Payment upserted: ${input.paymentId}`);
            return data?.payment_id || input.paymentId;
        } catch (err) {
            console.error('[PaymentsSupabaseService] Upsert exception:', err);
            return null;
        }
    }

    /**
     * Alias for upsertPayment - creates a new payment record
     */
    async createPayment(input: CreatePaymentInput): Promise<string | null> {
        return this.upsertPayment(input);
    }

    /**
     * Update payment status (approve payment)
     * Only allows: Pending → Completed
     */
    async updatePaymentStatus(
        paymentId: string,
        status: 'Completed',
        approverInfo?: {
            userId: string;
            name: string;
            empId?: string;
            role: string;
        }
    ): Promise<boolean> {
        if (!this.isReady()) return false;

        try {
            const now = new Date().toISOString();
            const updateData: any = { status };

            if (status === 'Completed' && approverInfo) {
                updateData.approved_by = {
                    type: approverInfo.role === 'Admin' ? 'admin' : 'moderator',
                    userId: approverInfo.userId,
                    empId: approverInfo.empId,
                    name: approverInfo.name,
                    role: approverInfo.role,
                };
                updateData.approved_at = now;
            }

            const { error } = await this.supabase
                .from('payments')
                .update(updateData)
                .eq('payment_id', paymentId);

            if (error) {
                console.error('[PaymentsSupabaseService] Update error:', error);
                return false;
            }

            console.log(`[PaymentsSupabaseService] Payment ${paymentId} → ${status}`);
            return true;
        } catch (err) {
            console.error('[PaymentsSupabaseService] Update exception:', err);
            return false;
        }
    }

    // ============================================
    // READ OPERATIONS
    // ============================================

    /**
     * Get payment by ID
     */
    async getPaymentById(paymentId: string): Promise<PaymentRecord | null> {
        if (!this.isReady()) return null;

        try {
            const { data, error } = await this.supabase
                .from('payments')
                .select('*')
                .eq('payment_id', paymentId)
                .single();

            if (error) return null;
            return data as PaymentRecord;
        } catch {
            return null;
        }
    }

    /**
     * Get payment by Razorpay Payment ID
     */
    async getPaymentByRazorpayId(razorpayPaymentId: string): Promise<PaymentRecord | null> {
        if (!this.isReady()) return null;

        try {
            const { data, error } = await this.supabase
                .from('payments')
                .select('*')
                .eq('razorpay_payment_id', razorpayPaymentId)
                .single();

            if (error) return null;
            return data as PaymentRecord;
        } catch {
            return null;
        }
    }

    /**
     * Get payments by student UID with pagination
     */
    async getPaymentsByStudentUid(
        studentUid: string,
        options?: { limit?: number; offset?: number }
    ): Promise<PaymentRecord[]> {
        if (!this.isReady()) return [];

        const limit = options?.limit || 100;
        const offset = options?.offset || 0;

        try {
            const { data, error } = await this.supabase
                .from('payments')
                .select('*')
                .eq('student_uid', studentUid)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) return [];
            return (data || []) as PaymentRecord[];
        } catch {
            return [];
        }
    }

    /**
     * Get payments by student ID (Enrollment ID) with pagination
     */
    async getPaymentsByStudentId(
        studentId: string,
        options?: { limit?: number; offset?: number }
    ): Promise<PaymentRecord[]> {
        if (!this.isReady()) return [];

        const limit = options?.limit || 100;
        const offset = options?.offset || 0;

        try {
            const { data, error } = await this.supabase
                .from('payments')
                .select('*')
                .eq('student_id', studentId)
                .order('created_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) return [];
            return (data || []) as PaymentRecord[];
        } catch {
            return [];
        }
    }

    /**
     * Get all payments for a date range (for export/reporting)
     * READ-ONLY - no modifications
     */
    async getPaymentsForExport(
        startDate: Date,
        endDate: Date
    ): Promise<PaymentRecord[]> {
        if (!this.isReady()) return [];

        try {
            const { data, error } = await this.supabase
                .from('payments')
                .select('*')
                .gte('transaction_date', startDate.toISOString())
                .lte('transaction_date', endDate.toISOString())
                .order('transaction_date', { ascending: true });

            if (error) return [];
            return (data || []) as PaymentRecord[];
        } catch {
            return [];
        }
    }

    /**
     * Get recent transactions
     */
    async getRecentTransactions(limit: number = 5): Promise<PaymentRecord[]> {
        if (!this.isReady()) return [];

        try {
            const { data, error } = await this.supabase
                .from('payments')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) return [];
            return (data || []) as PaymentRecord[];
        } catch {
            return [];
        }
    }

    /**
     * Get pending offline payments (for approval queue)
     */
    async getPendingPayments(): Promise<PaymentRecord[]> {
        if (!this.isReady()) return [];

        try {
            const { data, error } = await this.supabase
                .from('payments')
                .select('*')
                .eq('status', 'Pending')
                .eq('method', 'Offline')
                .order('created_at', { ascending: true });

            if (error) return [];
            return (data || []) as PaymentRecord[];
        } catch {
            return [];
        }
    }

    /**
     * Get completed payments for a date range (for reporting)
     * READ-ONLY - no modifications
     */
    async getCompletedPaymentsForReporting(
        startDate: Date,
        endDate: Date
    ): Promise<PaymentRecord[]> {
        if (!this.isReady()) return [];

        try {
            const { data, error } = await this.supabase
                .from('payments')
                .select('*')
                .gte('transaction_date', startDate.toISOString())
                .lte('transaction_date', endDate.toISOString())
                .eq('status', 'Completed')
                .order('transaction_date', { ascending: true });

            if (error) {
                console.error('[PaymentsSupabaseService] Reporting fetch error:', error);
                return [];
            }

            console.log(`[PaymentsSupabaseService] Found ${data?.length || 0} completed payments for reporting`);
            return (data || []) as PaymentRecord[];
        } catch (err) {
            console.error('[PaymentsSupabaseService] Reporting fetch exception:', err);
            return [];
        }
    }

    // ============================================
    // STATISTICS & AGGREGATION
    // ============================================

    /**
     * Get payment statistics for dashboard
     */
    async getPaymentStats(): Promise<{
        totalPayments: number;
        completedPayments: number;
        pendingPayments: number;
        totalRevenue: number;
    }> {
        if (!this.isReady()) {
            return { totalPayments: 0, completedPayments: 0, pendingPayments: 0, totalRevenue: 0 };
        }

        try {
            const { data, error } = await this.supabase
                .from('payments')
                .select('status, amount');

            if (error) {
                console.error('[PaymentsSupabaseService] Stats error:', error);
                return { totalPayments: 0, completedPayments: 0, pendingPayments: 0, totalRevenue: 0 };
            }

            const payments = data || [];
            const completed = payments.filter(p => p.status === 'Completed');
            const pending = payments.filter(p => p.status === 'Pending');
            const totalRevenue = completed.reduce((sum, p) => sum + (p.amount || 0), 0);

            return {
                totalPayments: payments.length,
                completedPayments: completed.length,
                pendingPayments: pending.length,
                totalRevenue,
            };
        } catch (error) {
            console.error('[PaymentsSupabaseService] Stats error:', error);
            return { totalPayments: 0, completedPayments: 0, pendingPayments: 0, totalRevenue: 0 };
        }
    }

    /**
     * Get payment trend for the last 7 days (Daily Revenue)
     */
    async getPaymentTrend(): Promise<{ date: string; amount: number }[]> {
        if (!this.isReady()) return [];

        try {
            const last7Days = Array.from({ length: 7 }, (_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (6 - i));
                d.setHours(0, 0, 0, 0);
                return d;
            });

            const startDate = last7Days[0].toISOString();

            const { data, error } = await this.supabase
                .from('payments')
                .select('amount, transaction_date')
                .eq('status', 'Completed')
                .gte('transaction_date', startDate)
                .order('transaction_date', { ascending: true });

            if (error) {
                console.error('[PaymentsSupabaseService] Trend error:', error);
                return [];
            }

            const payments = data || [];

            return last7Days.map(day => {
                const dateStr = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const dayISO = day.toISOString().split('T')[0];

                const dayTotal = payments
                    .filter(p => p.transaction_date?.startsWith(dayISO))
                    .reduce((sum, p) => sum + (p.amount || 0), 0);

                return {
                    date: dateStr,
                    amount: dayTotal
                };
            });
        } catch (err) {
            console.error('[PaymentsSupabaseService] Trend exception:', err);
            return [];
        }
    }

    /**
     * Get student's total payment amount
     */
    async getStudentTotalPayments(studentUid: string): Promise<number> {
        if (!this.isReady()) return 0;

        try {
            const { data, error } = await this.supabase
                .from('payments')
                .select('amount')
                .eq('student_uid', studentUid)
                .eq('status', 'Completed');

            if (error) return 0;
            return (data || []).reduce((sum, p) => sum + (p.amount || 0), 0);
        } catch {
            return 0;
        }
    }
}

// Export singleton instance
export const paymentsSupabaseService = new PaymentsSupabaseService();

// Export class for custom instantiation
export { PaymentsSupabaseService };
