import { NextResponse } from 'next/server';
import { db as adminDb, FieldValue } from '@/lib/firebase-admin';
import { createRazorpayOrder } from '@/lib/payment/razorpay.service';
import { getCurrentBusFee } from '@/lib/bus-fee-service';
import { withSecurity } from '@/lib/security/api-security';
import { RenewServiceV2Schema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';
import { generateOfflinePaymentId } from '@/lib/types/payment';
import { PaymentTransactionService } from '@/lib/payment/payment-transaction.service';

type RenewServiceBody = {
  durationYears: number;
  paymentMode: 'online' | 'offline';
  transactionId?: string;
  receiptImageUrl?: string;
};

export const POST = withSecurity<RenewServiceBody>(
  async (_request, { auth, body }) => {
    const userId = auth.uid;
    const { durationYears, paymentMode, transactionId, receiptImageUrl } = body;

    const studentDoc = await adminDb.collection('students').doc(userId).get();
    if (!studentDoc.exists) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const studentData = studentDoc.data()!;
    const enrollmentId = studentData.enrollmentId || '';
    const studentName = studentData.fullName || studentData.name || auth.name || 'Student';

    const busFeeData = await getCurrentBusFee();
    const currentBusFee = Number(busFeeData.amount || 0);
    const totalFee = currentBusFee * durationYears;

    if (!currentBusFee || totalFee <= 0) {
      return NextResponse.json({ error: 'Bus fee is not configured' }, { status: 500 });
    }

    if (paymentMode === 'online') {
      const receipt = `renewal_${enrollmentId || userId}_${Date.now()}`;
      const order = await createRazorpayOrder(totalFee, receipt, {
        userId,
        studentId: userId,
        enrollmentId,
        studentName,
        durationYears: durationYears.toString(),
        type: 'renewal',
      });

      return NextResponse.json({
        success: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      });
    }

    if (paymentMode === 'offline') {
      const paymentId = generateOfflinePaymentId('renewal');

      try {
        await PaymentTransactionService.saveTransaction({
          studentId: enrollmentId,
          studentName,
          userId,
          amount: totalFee,
          paymentMethod: 'offline',
          paymentId,
          timestamp: new Date().toISOString(),
          durationYears,
          validUntil: '',
          status: 'pending',
          offlineTransactionId: transactionId || '',
        });
      } catch (supabaseError) {
        console.error('Failed to create pending renewal payment ledger:', supabaseError);
        return NextResponse.json(
          { error: 'Failed to create payment record. Please retry before submitting the renewal request.' },
          { status: 503 }
        );
      }

      const docRef = await adminDb.collection('renewal_requests').add({
        studentId: userId,
        enrollmentId,
        studentName,
        durationYears,
        totalFee,
        transactionId: transactionId || '',
        receiptImageUrl: receiptImageUrl || '',
        paymentMode: 'offline',
        paymentId,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const [adminsSnapshot, moderatorsSnapshot] = await Promise.all([
        adminDb.collection('admins').get(),
        adminDb.collection('moderators').get(),
      ]);

      const allStaffIds = [
        ...adminsSnapshot.docs.map(doc => doc.id),
        ...moderatorsSnapshot.docs.map(doc => doc.id),
      ];

      if (allStaffIds.length > 0) {
        const expiryDate = new Date();
        expiryDate.setHours(23, 59, 59, 999);

        await adminDb.collection('notifications').add({
          title: 'New Renewal Request',
          content: `${studentName} (${enrollmentId}) has submitted an offline renewal request for ${durationYears} year(s).`,
          sender: {
            userId,
            userName: studentName,
            userRole: 'student',
            enrollmentId,
          },
          target: {
            type: 'specific_users',
            specificUserIds: allStaffIds,
          },
          recipientIds: allStaffIds,
          autoInjectedRecipientIds: [],
          readByUserIds: [],
          isEdited: false,
          isDeletedGlobally: false,
          createdAt: FieldValue.serverTimestamp(),
          expiresAt: expiryDate.toISOString(),
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Offline renewal request submitted successfully',
        requestId: docRef.id,
      });
    }

    return NextResponse.json({ error: 'Invalid payment mode' }, { status: 400 });
  },
  {
    requiredRoles: ['student'],
    schema: RenewServiceV2Schema,
    rateLimit: RateLimits.CREATE,
    allowBodyToken: true,
  }
);
