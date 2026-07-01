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
import { getDeadlineConfig } from '@/lib/deadline-config-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('X-Razorpay-Signature');

    if (!signature) {
      return NextResponse.json({ error: 'No signature provided' }, { status: 400 });
    }

    // Verify webhook signature
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
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



      const rawPurpose = String(notes.purpose || notes.type || '');
      const isNewRegistration = rawPurpose.toLowerCase().includes('registration') || rawPurpose.toLowerCase() === 'new_registration';

      // Fetch dynamic deadline config
      const deadlineConfig = await getDeadlineConfig();

      if (isNewRegistration) {
        let alreadyMarked = false;
        await adminDb.runTransaction(async (transaction: any) => {
          const processedPaymentRef = adminDb.collection('processed_payments').doc(paymentId);
          const processedPaymentDoc = await transaction.get(processedPaymentRef);
          if (processedPaymentDoc.exists) {
            alreadyMarked = true;
            return;
          }
          transaction.set(processedPaymentRef, {
            paymentId,
            orderId: order_id,
            processedAt: FieldValue.serverTimestamp(),
            amount: amount / 100,
            enrollmentId: enrollmentId || '',
            userId: userId || '',
            source: 'webhook'
          });
        });

        if (alreadyMarked) {
          // Verify the Supabase ledger entry actually exists — the marker could be
          // stale from a previous attempt where saveTransaction failed after the
          // Firestore transaction committed.
          const supabaseExists = await PaymentTransactionService.isPaymentProcessed(paymentId);
          if (!supabaseExists) {
            await adminDb.collection('processed_payments').doc(paymentId).delete();
            return NextResponse.json({ error: 'Retry: stale marker cleaned' }, { status: 500 });
          }
          return NextResponse.json({ status: 'already_processed' }, { status: 200 });
        }

        // Session metadata: for a CURRENT-session new-registration payment the
        // student joins the current academic session; for a FUTURE-session
        // application the payment belongs to the chosen targetSession. We read
        // the application doc (id == userId) to recover the chosen session
        // exactly as it was frozen at submit time. Falls back gracefully when
        // the application doc is absent (legacy / pre-Phase-2).
        let sessionStartYear: number | undefined;
        let sessionEndYear: number | undefined;
        let targetValidUntil: Date;
        if (userId) {
          const appSnap = await adminDb.collection('applications').doc(userId).get();
          if (appSnap.exists) {
            const appDoc: any = appSnap.data() || {};
            const ts = appDoc.targetSession;
            if (ts && Number(ts.startYear) > 0 && Number(ts.endYear) > 0) {
              sessionStartYear = Number(ts.startYear);
              sessionEndYear = Number(ts.endYear);
            }
          }
        }
        if (sessionStartYear && sessionEndYear) {
          // Validity anchored to the chosen session's end year.
          const anchorMonth = deadlineConfig.academicYear.anchorMonth;
          const anchorDay = deadlineConfig.academicYear.anchorDay;
          targetValidUntil = new Date(Date.UTC(sessionEndYear, anchorMonth, anchorDay, 23, 59, 59, 999));
        } else {
          // Legacy fallback: current-year + duration.
          sessionStartYear = new Date().getFullYear();
          sessionEndYear = sessionStartYear + durationYears;
          targetValidUntil = calculateValidUntilDate(sessionStartYear, durationYears, deadlineConfig);
        }

        await PaymentTransactionService.saveTransaction({
          studentId: enrollmentId || '',
          studentName,
          amount: amount / 100,
          paymentMethod: 'online',
          paymentId,
          timestamp: new Date().toISOString(),
          durationYears,
          validUntil: targetValidUntil.toISOString(),
          sessionStartYear,
          sessionEndYear,
          userId: userId || '',
          status: 'completed',
          purpose: 'new_registration'
        });

        return NextResponse.json({ status: 'success' }, { status: 200 });
      }

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
      let studentEmail: string = '';
      let studentPhone: string = '';
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
          studentEmail = studentData?.email || '';
          studentPhone = studentData?.phone || studentData?.phoneNumber || '';



          // Get existing values
          const existingSessionStartYear = studentData?.sessionStartYear || new Date().getFullYear();
          const existingSessionEndYear = studentData?.sessionEndYear || new Date().getFullYear();
          const existingDurationYears = studentData?.durationYears || 0;
          const existingValidUntil = studentData?.validUntil;
          const previousValidUntilISO = existingValidUntil
            ? (existingValidUntil.toDate ? existingValidUntil.toDate().toISOString() : new Date(existingValidUntil).toISOString())
            : null;



          // Calculate base year for new validity
          let baseYear = new Date().getUTCFullYear();
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

          // ───────────────────────────────────────────────────────────────────
          // Phase 3 — The webhook NO LONGER reactivates the student. Online
          // renewals converge into the unified approval flow exactly like the
          // client `verify-payment` path: the captured payment is recorded
          // (immutable ledger, below) and a PENDING `renewal_requests` document is
          // created (after this transaction) so `approve-v2` remains the single
          // event that revalidates capacity, runs reassignment, reclaims the seat,
          // and flips the student to 'active'. The student document is left
          // untouched here — no instant entitlement restoration.
          // The processed_payments marker above still guarantees idempotency.
          // ───────────────────────────────────────────────────────────────────



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

        // Save transaction record after successful transaction (records the
        // captured online payment as Completed in the immutable ledger).
        if (transactionRecord) {
          await PaymentTransactionService.saveTransaction(transactionRecord);
        }

        // Phase 3 — create the PENDING renewal request that approval will act on.
        // Idempotent by doc id (`online_<paymentId>`); matches verify-payment so the
        // client path and the webhook safety-net never produce duplicates.
        const renewalRequestRef = adminDb.collection('renewal_requests').doc(`online_${paymentId}`);
        const existingRequest = await renewalRequestRef.get();
        if (!existingRequest.exists) {
          await renewalRequestRef.set({
            studentId: studentDocId,
            enrollmentId: enrollmentId || transactionRecord?.studentId || '',
            studentName: actualStudentName,
            studentEmail,
            studentPhone,
            durationYears,
            totalFee: amount / 100,
            paymentMode: 'online',
            paymentId,
            razorpayOrderId: order_id,
            paymentStatus: 'paid',
            requestedValidUntil: newValidUntil.toISOString(),
            status: 'pending',
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

          try {
            const [adminsSnapshot, moderatorsSnapshot] = await Promise.all([
              adminDb.collection('admins').get(),
              adminDb.collection('moderators').get(),
            ]);
            const allStaffIds = [
              ...adminsSnapshot.docs.map((d: any) => d.id),
              ...moderatorsSnapshot.docs.map((d: any) => d.id),
            ];
            if (allStaffIds.length > 0) {
              // Dedup: skip if a notification for this student's renewal already exists
              const existingNotif = await adminDb.collection('notifications')
                .where('sender.userId', '==', studentDocId)
                .where('title', '==', 'Online Renewal Awaiting Approval')
                .limit(1)
                .get();
              if (existingNotif.empty) {
                const expiryDate = new Date();
                expiryDate.setHours(23, 59, 59, 999);
                await adminDb.collection('notifications').add({
                  title: 'Online Renewal Awaiting Approval',
                  content: `${actualStudentName} (${enrollmentId || ''}) paid online for a ${durationYears} year(s) renewal and is awaiting approval.`,
                  sender: { userId: studentDocId, userName: actualStudentName, userRole: 'student', enrollmentId: enrollmentId || '' },
                  target: { type: 'specific_users', specificUserIds: allStaffIds },
                  recipientIds: allStaffIds,
                  autoInjectedRecipientIds: [],
                  readByUserIds: [],
                  isEdited: false,
                  isDeletedGlobally: false,
                  createdAt: FieldValue.serverTimestamp(),
                  expiresAt: expiryDate.toISOString(),
                  metadata: { paymentId },
                });
              }
            }
          } catch (notifyErr) {
            console.error('[webhook] Failed to notify staff of online renewal request:', notifyErr);
          }
        }

        return NextResponse.json({ status: 'success' }, { status: 200 });

      } catch (error: any) {
        // Handle already processed as success (not an error),
        // BUT verify the Supabase ledger entry actually exists — the marker could be
        // stale from a previous attempt where saveTransaction failed after the
        // Firestore transaction committed.
        if (error.message === 'ALREADY_PROCESSED') {
          const supabaseExists = await PaymentTransactionService.isPaymentProcessed(paymentId);
          if (!supabaseExists) {
            await adminDb.collection('processed_payments').doc(paymentId).delete();
            return NextResponse.json({ error: 'Retry: stale marker cleaned' }, { status: 500 });
          }
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
