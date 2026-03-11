import { NextResponse } from 'next/server';
import { db as adminDb, FieldValue } from '@/lib/firebase-admin';
import { createRazorpayOrder } from '@/lib/payment/razorpay.service';
import { getCurrentBusFee } from '@/lib/bus-fee-service';
import { withSecurity } from '@/lib/security/api-security';
import { RenewServiceV2Schema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

/**
 * POST /api/student/renew-service-v2
 * 
 * Handles both online (Razorpay) and offline renewal requests.
 */
export const POST = withSecurity(
  async (request, { auth, body }) => {
    const userId = auth.uid;
    const {
      durationYears,
      paymentMode,
      transactionId,
      receiptImageUrl
    } = body as any;

    // Get student document
    const studentDoc = await adminDb.collection('students').doc(userId).get();
    if (!studentDoc.exists) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const studentData = studentDoc.data()!;
    const enrollmentId = studentData.enrollmentId;
    const studentName = studentData.fullName || studentData.name;

    // Fetch current bus fee (Source of Truth)
    const busFeeData = await getCurrentBusFee();
    const currentBusFee = busFeeData.amount;
    const totalFee = currentBusFee * durationYears;

    console.log(`💰 Calculating renewal fee for ${userId}: ${currentBusFee} x ${durationYears} = ${totalFee}`);

    if (paymentMode === 'online') {
      // Create Razorpay order
      const receipt = `renewal_${enrollmentId}_${Date.now()}`;
      const order = await createRazorpayOrder(
        totalFee,
        receipt,
        {
          studentId: userId,
          enrollmentId,
          studentName,
          durationYears: durationYears.toString(),
          type: 'renewal'
        }
      );

      return NextResponse.json({
        success: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
      });

    } else if (paymentMode === 'offline') {
      // Create renewal request for offline payment
      const renewalRequestData = {
        studentId: userId,
        enrollmentId,
        studentName,
        durationYears,
        totalFee,
        transactionId: transactionId || '',
        receiptImageUrl: receiptImageUrl || '',
        paymentMode: 'offline',
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };

      const docRef = await adminDb.collection('renewal_requests').add(renewalRequestData);

      // Notify admins and moderators
      const [adminsSnapshot, moderatorsSnapshot] = await Promise.all([
        adminDb.collection('admins').get(),
        adminDb.collection('moderators').get()
      ]);

      const adminIds = adminsSnapshot.docs.map(doc => doc.id);
      const moderatorIds = moderatorsSnapshot.docs.map(doc => doc.id);
      const allStaffIds = [...adminIds, ...moderatorIds];

      // Calculate expiry (1 day from now)
      const expiryDate = new Date();
      expiryDate.setHours(23, 59, 59, 999);

      if (allStaffIds.length > 0) {
        await adminDb.collection('notifications').add({
          title: '🔄 New Renewal Request',
          content: `${studentName} (${enrollmentId}) has submitted an offline renewal request for ${durationYears} year(s).`,
          sender: {
            userId,
            userName: studentName,
            userRole: 'student',
            enrollmentId
          },
          target: {
            type: 'specific_users',
            specificUserIds: allStaffIds
          },
          recipientIds: allStaffIds,
          autoInjectedRecipientIds: [],
          readByUserIds: [],
          isEdited: false,
          isDeletedGlobally: false,
          createdAt: FieldValue.serverTimestamp(),
          expiresAt: expiryDate.toISOString()
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Offline renewal request submitted successfully',
        requestId: docRef.id
      });
    }

    return NextResponse.json({ error: 'Invalid payment mode' }, { status: 400 });
  },
  {
    requiredRoles: ['student'],
    schema: RenewServiceV2Schema,
    rateLimit: RateLimits.CREATE,
    allowBodyToken: true
  }
);
