/**
 * Razorpay Webhook Handler
 * 
 * SECURITY FIXES:
 * - Atomic idempotency check inside transaction to prevent race conditions
 * - Uses order notes (trusted source) instead of payment notes
 * - Processed payment marker set BEFORE student update
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminDb, FieldValue } from '@/lib/firebase-admin';
import { PaymentTransactionService } from '@/lib/payment/payment-transaction.service';
import { calculateValidUntilDate } from '@/lib/utils/date-utils';
import { fetchOrderDetails } from '@/lib/payment/razorpay.service';
import { computeBlockDatesFromValidUntil } from '@/lib/utils/deadline-computation';
import { getDeadlineConfig } from '@/lib/deadline-config-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('X-Razorpay-Signature');

    if (!signature) {
      return NextResponse.json({ error: 'No signature provided' }, { status: 400 });
    }

    // Verify webhook signature
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    if (!secret) {
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    // SECURITY: Use timing-safe comparison to prevent timing attacks
    if (!signature || signature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(expectedSignature, 'utf8')
      )) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(body);
    const event = payload.event;
    const paymentEntity = payload.payload?.payment?.entity;

    if (event === 'payment.captured' && paymentEntity) {
      const { id: paymentId, order_id, amount, status, method } = paymentEntity;

      // SECURITY: Fetch order details from Razorpay to get TRUSTED data
      // Don't trust payment notes - they can be different from order notes
      let orderDetails;
      try {
        orderDetails = await fetchOrderDetails(order_id);
      } catch (error) {
        // Fallback to payment notes if order fetch fails
        orderDetails = { notes: paymentEntity.notes || {} };
      }

      // SECURITY: Extract trusted values from order notes
      const notes = orderDetails.notes || paymentEntity.notes || {};
      const enrollmentId = notes.enrollmentId || notes.studentId;
      const userId = notes.userId;
      const durationYears = parseInt(notes.durationYears || '1');
      const studentName = notes.studentName || notes.userName || 'Unknown';

      if (!enrollmentId && !userId) {
        return NextResponse.json({ error: 'Missing enrollment/user ID' }, { status: 400 });
      }



      // Fetch dynamic deadline config
      const deadlineConfig = await getDeadlineConfig();

      // Find student by enrollmentId OR userId
      let studentRef: any;
      let studentDocId: string;

      if (userId) {
        // Use userId directly as document ID
        studentRef = adminDb.collection('students').doc(userId);
        studentDocId = userId;
      } else {
        // Find by enrollmentId
        const studentsQuery = await adminDb.collection('students')
          .where('enrollmentId', '==', enrollmentId)
          .limit(1)
          .get();

        if (studentsQuery.empty) {
          return NextResponse.json({ error: 'Student not found' }, { status: 404 });
        }

        const studentDoc = studentsQuery.docs[0];
        studentRef = studentDoc.ref;
        studentDocId = studentDoc.id;
      }

      let newValidUntil: Date = new Date();
      let newSessionStartYear: number = new Date().getFullYear();
      let newSessionEndYear: number = new Date().getFullYear();
      let totalDurationYears: number = 0;
      let actualStudentName: string = studentName;
      let transactionRecord: any = null;

      try {
        // SECURITY FIX: Atomic idempotency check inside transaction
        await adminDb.runTransaction(async (transaction: any) => {
          // ... existing code ...
          const processedPaymentRef = adminDb.collection('processed_payments').doc(paymentId);
          const processedPaymentDoc = await transaction.get(processedPaymentRef);

          if (processedPaymentDoc.exists) {
            throw new Error('ALREADY_PROCESSED');
          }

          // IMMEDIATELY mark as processed BEFORE any updates
          // This is critical to prevent race conditions
          transaction.set(processedPaymentRef, {
            paymentId,
            orderId: order_id,
            processedAt: FieldValue.serverTimestamp(),
            amount: amount / 100,
            enrollmentId,
            userId: studentDocId,
            source: 'webhook'
          });

          const studentDoc = await transaction.get(studentRef);

          if (!studentDoc.exists) {
            throw new Error('Student document not found');
          }

          const studentData = studentDoc.data();
          actualStudentName = studentData?.fullName || studentName;



          // Get existing values
          const existingSessionStartYear = studentData?.sessionStartYear || new Date().getFullYear();
          const existingSessionEndYear = studentData?.sessionEndYear || new Date().getFullYear();
          const existingDurationYears = studentData?.durationYears || 0;
          const existingValidUntil = studentData?.validUntil;
          const previousValidUntilISO = existingValidUntil
            ? (existingValidUntil.toDate ? existingValidUntil.toDate().toISOString() : new Date(existingValidUntil).toISOString())
            : null;



          // Calculate base year for new validity
          let baseYear = new Date().getFullYear();
          const now = new Date();

          if (existingValidUntil) {
            const existingDate = existingValidUntil.toDate ? existingValidUntil.toDate() : new Date(existingValidUntil);
            if (existingDate > now) {
              baseYear = existingSessionEndYear;
            }
          }

          // Calculate new validity using dynamic config
          newValidUntil = calculateValidUntilDate(baseYear, durationYears, deadlineConfig);
          newSessionStartYear = existingSessionStartYear;
          newSessionEndYear = baseYear + durationYears;
          totalDurationYears = existingDurationYears + durationYears;

          // Compute block dates from the new validUntil
          const blockDates = computeBlockDatesFromValidUntil(newValidUntil, deadlineConfig);



          // Update student document atomically with block dates
          transaction.update(studentRef, {
            validUntil: newValidUntil,
            status: 'active',
            sessionStartYear: newSessionStartYear,
            sessionEndYear: newSessionEndYear,
            paymentAmount: amount / 100,
            lastRenewalDate: FieldValue.serverTimestamp(),
            durationYears: totalDurationYears,
            // CRITICAL: Always update block dates when validUntil changes
            softBlock: blockDates.softBlock,
            hardBlock: blockDates.hardBlock,
            updatedAt: FieldValue.serverTimestamp()
          });



          // Prepare transaction record
          transactionRecord = {
            studentId: enrollmentId || studentData?.enrollmentId,
            studentName: actualStudentName,
            amount: amount / 100,
            paymentMethod: 'online' as const,
            paymentId,
            timestamp: new Date().toISOString(),
            durationYears,

            // Validity Information
            validUntil: newValidUntil.toISOString(),
            previousValidUntil: previousValidUntilISO,
            newValidUntil: newValidUntil.toISOString(),
            previousSessionEndYear: existingSessionEndYear,
            newSessionEndYear,
            previousDurationYears: existingDurationYears,
            newDurationYears: totalDurationYears,

            userId: studentDocId,
            status: 'completed' as const
          };
        });

        // Save transaction record after successful transaction
        if (transactionRecord) {
          await PaymentTransactionService.saveTransaction(transactionRecord);
        }



        return NextResponse.json({ status: 'success' }, { status: 200 });

      } catch (error: any) {
        // Handle already processed as success (not an error)
        if (error.message === 'ALREADY_PROCESSED') {
          return NextResponse.json({ status: 'already_processed' }, { status: 200 });
        }

        console.error('[webhook] Transaction failed:', error?.message);

        // Mark transaction as pending for manual reconciliation
        await PaymentTransactionService.markTransactionPending(paymentId);

        return NextResponse.json({
          error: 'Failed to update student record',
          paymentId
        }, { status: 500 });
      }
    }

    return NextResponse.json({ status: 'received' }, { status: 200 });

  } catch (error) {
    console.error('[webhook] Processing error:', (error as any)?.message);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
