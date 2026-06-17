import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { generateOfflinePaymentId } from '@/lib/types/payment';
import { PaymentTransactionService } from '@/lib/payment/payment-transaction.service';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? value as JsonRecord : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function withoutAge(formData: JsonRecord): JsonRecord {
  const next = { ...formData };
  delete next.age;
  return next;
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
    const rawFormData = asRecord(body.formData);
    const needsCapacityReview = body.needsCapacityReview === true;

    if (Object.keys(rawFormData).length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const paymentInfo = asRecord(rawFormData.paymentInfo);
    const sessionInfo = asRecord(rawFormData.sessionInfo);
    const isOnlinePayment = paymentInfo.paymentMode === 'online';
    const now = new Date().toISOString();
    const paymentId = isOnlinePayment
      ? asString(paymentInfo.razorpayPaymentId)
      : generateOfflinePaymentId('new_registration');
    const amountPaid = Number(paymentInfo.amountPaid || 0);

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

    const formDataWithoutAge = withoutAge(rawFormData);
    const applicationData = {
      applicationId: uid,
      applicantUid: uid,
      email: email || asString(rawFormData.email),
      state: 'submitted',
      formData: {
        ...formDataWithoutAge,
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
