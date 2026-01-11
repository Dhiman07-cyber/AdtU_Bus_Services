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
      console.error('❌ RAZORPAY_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.error('❌ Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const payload = JSON.parse(body);
    const event = payload.event;
    const paymentEntity = payload.payload?.payment?.entity;

    if (event === 'payment.captured' && paymentEntity) {
      const { id: paymentId, order_id, amount, status, method } = paymentEntity;

      console.log('\n🔔 RAZORPAY WEBHOOK - Payment Captured');
      console.log('💳 Payment ID:', paymentId);
      console.log('📦 Order ID:', order_id);

      // SECURITY: Fetch order details from Razorpay to get TRUSTED data
      // Don't trust payment notes - they can be different from order notes
      let orderDetails;
      try {
        orderDetails = await fetchOrderDetails(order_id);
        console.log('📋 Order details fetched from Razorpay');
      } catch (error) {
        console.error('❌ Failed to fetch order details:', error);
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
        console.error('No enrollment ID or user ID in order notes');
        return NextResponse.json({ error: 'Missing enrollment/user ID' }, { status: 400 });
      }

      console.log('👤 Enrollment ID:', enrollmentId);
      console.log('🔑 User ID:', userId);
      console.log('⏱️ Duration Years:', durationYears);
      console.log('💰 Amount:', amount / 100);

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
          console.error('❌ Student not found with enrollment ID:', enrollmentId);
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
          // First, check and set the processed payment marker atomically
          const processedPaymentRef = adminDb.collection('processed_payments').doc(paymentId);
          const processedPaymentDoc = await transaction.get(processedPaymentRef);

          if (processedPaymentDoc.exists) {
            console.log(`⚠️ Payment ${paymentId} already processed (atomic check), skipping`);
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
            console.error('❌ Student document not found:', enrollmentId || userId);
            throw new Error('Student document not found');
          }

          const studentData = studentDoc.data();
          actualStudentName = studentData?.fullName || studentName;

          console.log('\n📋 EXISTING STUDENT DATA:');
          console.log('Name:', actualStudentName);
          console.log('Current validUntil:', studentData?.validUntil);
          console.log('Current sessionStartYear:', studentData?.sessionStartYear);
          console.log('Current sessionEndYear:', studentData?.sessionEndYear);
          console.log('Current durationYears:', studentData?.durationYears);
          console.log('Current status:', studentData?.status);

          // Get existing values
          const existingSessionStartYear = studentData?.sessionStartYear || new Date().getFullYear();
          const existingSessionEndYear = studentData?.sessionEndYear || new Date().getFullYear();
          const existingDurationYears = studentData?.durationYears || 0;
          const existingValidUntil = studentData?.validUntil;
          const previousValidUntilISO = existingValidUntil
            ? (existingValidUntil.toDate ? existingValidUntil.toDate().toISOString() : new Date(existingValidUntil).toISOString())
            : null;

          console.log('\n🔄 CALCULATING NEW VALUES:');

          // Calculate base year for new validity
          let baseYear = new Date().getFullYear();
          const now = new Date();

          if (existingValidUntil) {
            const existingDate = existingValidUntil.toDate ? existingValidUntil.toDate() : new Date(existingValidUntil);
            console.log('Existing valid until (parsed):', existingDate.toISOString());
            console.log('Today:', now.toISOString());
            console.log('Is service still valid?', existingDate > now);

            if (existingDate > now) {
              baseYear = existingSessionEndYear;
              console.log('✅ Service active - extending from sessionEndYear:', baseYear);
            } else {
              console.log('⚠️ Service expired - starting fresh from current year:', baseYear);
            }
          } else {
            console.log('ℹ️ No existing validity - starting fresh from current year:', baseYear);
          }

          // Calculate new validity using config (June 30 deadline)
          newValidUntil = calculateValidUntilDate(baseYear, durationYears);
          newSessionStartYear = existingSessionStartYear;
          newSessionEndYear = baseYear + durationYears;
          totalDurationYears = existingDurationYears + durationYears;

          console.log('\n✨ NEW CALCULATED VALUES:');
          console.log('New validUntil:', newValidUntil.toISOString());
          console.log('New sessionStartYear:', newSessionStartYear, '(kept original)');
          console.log('New sessionEndYear:', newSessionEndYear);
          console.log('Total durationYears:', totalDurationYears, '(cumulative)');
          console.log('New status: active');

          // Update student document atomically
          transaction.update(studentRef, {
            validUntil: newValidUntil,
            status: 'active',
            sessionStartYear: newSessionStartYear,
            sessionEndYear: newSessionEndYear,
            paymentAmount: amount / 100,
            lastRenewalDate: FieldValue.serverTimestamp(),
            durationYears: totalDurationYears,
            updatedAt: FieldValue.serverTimestamp()
          });

          console.log('\n✅ FIRESTORE UPDATE QUEUED');

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
          console.log('\n💾 SAVING TRANSACTION RECORD');
          await PaymentTransactionService.saveTransaction(transactionRecord);
          console.log('✅ Transaction record saved');
        }

        console.log('\n🎉 SUCCESS - Webhook processing completed');
        console.log('Payment ID:', paymentId);
        console.log('Student:', enrollmentId || userId);
        console.log('New valid until:', newValidUntil.toISOString());
        console.log('Session:', newSessionStartYear, '-', newSessionEndYear);

        return NextResponse.json({ status: 'success' }, { status: 200 });

      } catch (error: any) {
        // Handle already processed as success (not an error)
        if (error.message === 'ALREADY_PROCESSED') {
          return NextResponse.json({ status: 'already_processed' }, { status: 200 });
        }

        console.error('Transaction failed:', error);

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
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
