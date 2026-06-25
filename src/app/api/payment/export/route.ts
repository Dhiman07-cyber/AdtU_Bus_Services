import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, adminDb } from '@/lib/firebase-admin';
import { paymentsSupabaseService } from '@/lib/services/payments-supabase';
import { decryptData } from '@/lib/security/encryption.service';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await verifyToken(token);
    const userId = decodedToken.uid;

    // Get user data to determine role
    const userDoc = await adminDb.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData || !['admin', 'moderator'].includes(userData.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const startYearStr = searchParams.get('startYear');
    const endYearStr = searchParams.get('endYear');

    if (!startYearStr || !endYearStr) {
      return NextResponse.json({ error: 'Missing startYear or endYear parameters' }, { status: 400 });
    }

    const startYear = parseInt(startYearStr);
    const endYear = parseInt(endYearStr);

    // Academic cycle is from July to June
    const startDate = new Date(Date.UTC(startYear, 6, 1, 0, 0, 0)); // July 1st of startYear
    const endDate = new Date(Date.UTC(endYear, 5, 30, 23, 59, 59, 999)); // June 30th of endYear

    const payments = await paymentsSupabaseService.getPaymentsForExport(startDate, endDate);

    if (!payments || payments.length === 0) {
      return NextResponse.json({ success: true, payments: [] });
    }

    const exportedPayments = payments.map((payment) => {
      // approved_by parsing & decryption
      const approvedByObj = payment.approved_by;
      let approvedByName = '';
      let approvedByRole = '';
      let approvedByEmpId = '';

      if (approvedByObj && typeof approvedByObj === 'object') {
        const approvedBy = approvedByObj as any;
        approvedByName = approvedBy.name || '';
        approvedByRole = approvedBy.role || approvedBy.type || '';
        
        const empIdRaw = approvedBy.empId || '';
        approvedByEmpId = empIdRaw ? (decryptData(empIdRaw) || empIdRaw) : '';
      }

      // Decrypt legacy or double-check encryption
      const studentId = payment.student_id ? (decryptData(payment.student_id) || payment.student_id) : '';
      const studentName = payment.student_name ? (decryptData(payment.student_name) || payment.student_name) : '';
      const offlineTransactionId = payment.offline_transaction_id ? (decryptData(payment.offline_transaction_id) || payment.offline_transaction_id) : '';

      return {
        paymentId: payment.payment_id,
        studentId,
        studentName,
        amount: payment.amount,
        transactionDate: payment.transaction_date,
        method: payment.method,
        status: payment.status,
        session: `${payment.session_start_year || startYear}-${payment.session_end_year || endYear}`,
        validUntil: payment.valid_until,
        offlineTransactionId,
        razorpayPaymentId: payment.razorpay_payment_id || '',
        razorpayOrderId: payment.razorpay_order_id || '',
        approvedByName,
        approvedByRole,
        approvedByEmpId,
        approvedAt: payment.approved_at || ''
      };
    });

    return NextResponse.json({
      success: true,
      payments: exportedPayments
    });

  } catch (error: any) {
    console.error('Error exporting payments:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
