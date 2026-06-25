import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { generateOfflinePaymentId } from '@/lib/types/payment';
import { PaymentTransactionService } from '@/lib/payment/payment-transaction.service';
import { getDeadlineConfig } from '@/lib/deadline-config-service';
import { deriveCreationCategorisation } from '@/lib/utils/application-eligibility';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? value as JsonRecord : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}



export async function POST(request: NextRequest) {
  try {
    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const email = decodedToken.email;
    const body = asRecord(await request.json());
    const rawFormData = { ...asRecord(body.formData) };
    if ('age' in rawFormData) {
      delete rawFormData.age;
    }
    const needsCapacityReview = body.needsCapacityReview === true;

    if (Object.keys(rawFormData).length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const paymentInfo = asRecord(rawFormData.paymentInfo);
    const sessionInfo = asRecord(rawFormData.sessionInfo);
    const isOnlinePayment = paymentInfo.paymentMode === 'online';
    const now = new Date().toISOString();

    // ── Server-side duplicate-submission guard ───────────────────────────────
    // The application doc id IS the student uid, and this route uses .set() (an
    // upsert). Without a guard a student could overwrite a LIVE application
    // (e.g. a submitted upcoming app, or an already-approved record) via a direct
    // API call, destroying lifecycle/payment state. Reject the overwrite when an
    // existing application is in a live state. Re-application is still allowed
    // from terminal/editable states (rejected / expired / cancelled / draft).
    const existingAppSnap = await adminDb.collection('applications').doc(uid).get();
    if (existingAppSnap.exists) {
      const existingState = asString(existingAppSnap.data()?.state);
      const LIVE_STATES = ['submitted', 'approved', 'verified', 'awaiting_verification'];
      if (LIVE_STATES.includes(existingState)) {
        return NextResponse.json(
          {
            error: 'An application is already in progress',
            message: 'You already have an active application. You cannot submit another until it is resolved.',
            state: existingState,
          },
          { status: 409 }
        );
      }
    }
    const paymentId = isOnlinePayment
      ? asString(paymentInfo.razorpayPaymentId)
      : generateOfflinePaymentId('new_registration');
    const amountPaid = Number(paymentInfo.amountPaid || 0);

    // Phase 2: categorise the application (fresh vs future) and freeze its
    // eligibleApproval date from the chosen session. A future application targets
    // the next academic session and must not be approvable until seats are freed.
    const deadlineConfig = await getDeadlineConfig();
    const categorisation = deriveCreationCategorisation(
      Number(sessionInfo.sessionStartYear || new Date().getFullYear()),
      Number(sessionInfo.sessionEndYear || (Number(sessionInfo.sessionStartYear || new Date().getFullYear()) + 1)),
      deadlineConfig,
      now
    );

    if (!isOnlinePayment && amountPaid > 0) {
      try {
        await PaymentTransactionService.saveTransaction({
          studentId: asString(rawFormData.enrollmentId) || 'N/A',
          studentName: asString(rawFormData.fullName) || 'N/A',
          userId: uid,
          amount: amountPaid,
          paymentMethod: 'offline',
          paymentId,
          timestamp: now,
          durationYears: Number(sessionInfo.durationYears || 1),
          validUntil: '',
          status: 'pending',
          offlineTransactionId: asString(paymentInfo.paymentReference),
        });
      } catch (supabaseError) {
        console.error('Failed to create pending application payment ledger:', supabaseError);
        return NextResponse.json(
          { error: 'Failed to create payment record. Please retry before submitting the application.' },
          { status: 503 }
        );
      }
    }

    const applicationData = {
      applicationId: uid,
      applicantUid: uid,
      email: email || asString(rawFormData.email),
      state: 'submitted',
      formData: {
        ...rawFormData,
        paymentId,
      },
      paymentId,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
      fullName: asString(rawFormData.fullName),
      enrollmentId: asString(rawFormData.enrollmentId),
      routeId: asString(rawFormData.routeId),
      busId: asString(rawFormData.busId),
      busAssigned: asString(rawFormData.busAssigned),
      stopId: asString(rawFormData.stopId),
      shift: asString(rawFormData.shift),
      verificationCodeId: '',
      verifiedBy: isOnlinePayment ? 'system_online_payment' : 'system_offline_submission_bypass',
      verifiedAt: now,
      needsCapacityReview,
      // Phase 2 categorisation (fresh/future + frozen eligibility date)
      applicationType: categorisation.applicationType,
      targetSession: categorisation.targetSession,
      eligibleApproval: categorisation.eligibleApproval,
    };

    await adminDb.collection('applications').doc(uid).set(applicationData);

    if (needsCapacityReview) {
      try {
        const [adminsSnapshot, modsSnapshot] = await Promise.all([
          adminDb.collection('admins').get(),
          adminDb.collection('moderators').get(),
        ]);

        const recipientIds = [
          ...adminsSnapshot.docs.map(doc => doc.id),
          ...modsSnapshot.docs.map(doc => doc.id),
        ];

        if (recipientIds.length > 0) {
          const batch = adminDb.batch();

          recipientIds.forEach(recipientId => {
            const notifRef = adminDb.collection('notifications').doc();
            batch.set(notifRef, {
              toUid: recipientId,
              title: 'Bus Capacity Alert - Overloaded Bus Request',
              content: `A new application from ${asString(rawFormData.fullName)} (${asString(rawFormData.enrollmentId)}) needs review because the selected bus (${asString(rawFormData.busAssigned) || asString(rawFormData.busId)}) is at full capacity.`,
              type: 'capacity_alert',
              createdAt: now,
              isRead: false,
              links: {
                applicationId: uid,
                routeId: asString(rawFormData.routeId),
              },
              sender: {
                name: 'System',
                role: 'system',
              },
            });
          });

          await batch.commit();
        }
      } catch (notificationError) {
        console.error('Failed to send capacity notifications:', notificationError);
      }
    }

    return NextResponse.json({
      success: true,
      applicationId: uid,
      message: 'Application submitted successfully and waiting for approval',
    });
  } catch (error) {
    console.error('Failed to submit application:', error);
    return NextResponse.json({ error: 'Failed to submit application' }, { status: 500 });
  }
}
