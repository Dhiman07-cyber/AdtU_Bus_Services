import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue, verifyToken } from '@/lib/firebase-admin';
import { PaymentTransactionService } from '@/lib/payment/payment-transaction.service';
import { calculateValidUntilDate } from '@/lib/utils/date-utils';
import { generateOfflinePaymentId } from '@/lib/types/payment';
import { computeBlockDatesFromValidUntil } from '@/lib/utils/deadline-computation';
import { deleteAsset, extractPublicId } from '@/lib/cloudinary-server';
import { getDeadlineConfig } from '@/lib/deadline-config-service';
import { requireModeratorPermission } from '@/lib/security/moderator-permissions';
import { buildCapacityDelta } from '@/lib/busCapacityService';
import { wasSeatReleased } from '@/lib/config/capacity-flags';
import { writeAuditInTransaction, type AuditActorRole } from '@/lib/audit/audit-service';

/** Thrown inside the renewal transaction when the target bus has no free seat. */
class CapacityFullError extends Error {}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }

  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * POST /api/renewal-requests/approve-v2
 * 
 * Production-hardened renewal approval with parallel processing and security checks.
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { requestId } = body;
    if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 100) {
      return NextResponse.json({ error: 'Request ID required' }, { status: 400 });
    }

    // 1. Parallel Initial Data Fetching (Metadata & Auth)
    const [decodedToken, deadlineConfig] = await Promise.all([
      verifyToken(token),
      getDeadlineConfig()
    ]);

    const approverUserId = decodedToken.uid;
    const [approverSnap, requestSnap] = await adminDb.getAll(
      adminDb.collection('users').doc(approverUserId),
      adminDb.collection('renewal_requests').doc(requestId)
    );

    const approverData = approverSnap.data();
    if (!approverData || !['admin', 'moderator'].includes(approverData.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const permissionDenied = await requireModeratorPermission(
      {
        uid: approverUserId,
        email: decodedToken.email || '',
        role: approverData.role,
        name: approverData.fullName || approverData.name || '',
      },
      'payments',
      'canApproveOfflinePayment'
    );
    if (permissionDenied) return permissionDenied;

    if (!requestSnap.exists) return NextResponse.json({ error: 'Renewal request not found' }, { status: 404 });
    const requestData = requestSnap.data()!;
    if (requestData.status !== 'pending') return NextResponse.json({ error: 'Request already processed' }, { status: 400 });

    const {
      studentId, enrollmentId, studentName, durationYears, totalFee,
      transactionId, receiptImageUrl, studentEmail, studentPhone
    } = requestData;

    // Phase 3 — renewals converge here from BOTH channels. Online requests
    // (created by verify-payment / the Razorpay webhook) carry the captured
    // payment id and were already recorded as Completed in the ledger; offline
    // requests are pending until this approval. Capacity/seat/activation logic is
    // identical for both — only the payment-method metadata differs.
    const isOnlineRenewal = requestData.paymentMode === 'online';

    // 2. Identify/Generate Payment ID (Supabase Lookup)
    let paymentId = requestData.paymentId;
    if (!paymentId) {
      try {
        const { paymentsSupabaseService } = await import('@/lib/services/payments-supabase');
        const pendingPayments = await paymentsSupabaseService.getPendingPayments();
        const matching = pendingPayments.find(p => p.student_id === enrollmentId && p.amount === totalFee);
        paymentId = matching ? matching.payment_id : generateOfflinePaymentId('renewal');
      } catch (err) {
        console.warn('Supabase lookup failed:', err);
        paymentId = generateOfflinePaymentId('renewal');
      }
    }

    // 3. Persist payment first, then update entitlement state.
    const studentRef = adminDb.collection('students').doc(studentId) as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
    const requestRef = requestSnap.ref as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
    const studentSnap = await studentRef.get();
    if (!studentSnap.exists) throw new Error('Student document not found');

    const savedStudentData = studentSnap.data() || {};
    const existingValidUntil = toDate(savedStudentData.validUntil);
    const now = new Date();
    let baseYear = now.getFullYear();

    if (existingValidUntil && existingValidUntil > now) {
      baseYear = savedStudentData.sessionEndYear || existingValidUntil.getFullYear();
    }

    const newValidUntil = calculateValidUntilDate(baseYear, durationYears, deadlineConfig);
    const newSessionEndYear = baseYear + durationYears;

    // ── Late-renewal seat reclamation ──────────────────────────────────────────
    // If this student's seat was released at soft block (seatReleasedAt marker set),
    // the renewal must re-acquire a bus seat. PRE-CHECK capacity BEFORE taking the
    // payment so a full original bus is rejected cleanly (request stays pending, no
    // payment saved, no half-state). Students whose seat was never released (marker
    // absent — early renewal or legacy/flag-off) take ZERO new capacity action.
    const seatWasReleased = wasSeatReleased(savedStudentData);
    const renewalBusId = savedStudentData.busId || savedStudentData.currentBusId || savedStudentData.assignedBusId || null;
    if (seatWasReleased && renewalBusId) {
      const preBusSnap = await adminDb.collection('buses').doc(renewalBusId).get();
      if (!preBusSnap.exists) {
        return NextResponse.json({ error: 'Assigned bus not found for renewal' }, { status: 409 });
      }
      const preBusData = preBusSnap.data() || {};
      if ((preBusData.currentMembers || 0) >= (preBusData.capacity || 55)) {
        return NextResponse.json({
          error: 'Original bus is full',
          message: "This student's seat was released at soft block and the original bus is now full. Reassign the student to a bus with capacity (or increase capacity) before approving this renewal.",
        }, { status: 409 });
      }
    }

    const approvalTimestamp = Date.now();
    const transactionRecord = {
      studentId: enrollmentId,
      studentName,
      studentEmail: studentEmail || savedStudentData?.email || 'N/A',
      studentPhone: studentPhone || savedStudentData?.phone || 'N/A',
      amount: totalFee,
      paymentMethod: (isOnlineRenewal ? 'online' : 'offline') as 'online' | 'offline',
      paymentId,
      offlineTransactionId: isOnlineRenewal ? '' : (transactionId || ''),
      durationYears,
      validUntil: newValidUntil.toISOString(),
      newValidUntil: newValidUntil.toISOString(),
      sessionStartYear: savedStudentData?.sessionStartYear,
      sessionEndYear: newSessionEndYear,
      userId: studentId,
      status: 'completed' as const,
      approvedBy: {
        type: 'Manual',
        userId: approverUserId,
        empId: approverData.empId || approverData.employeeId || 'N/A',
        name: approverData.fullName || 'Admin',
        role: approverData.role as 'admin' | 'moderator',
        email: approverData.email || 'N/A'
      },
      approvedByDisplay: `${approverData.fullName} (${approverData.role})`,
      renewalRequestId: requestId,
      timestamp: new Date().toISOString(),
      timestampMs: approvalTimestamp,
      approvedAtISO: new Date(approvalTimestamp).toISOString(),
      metadata: { source: 'admin_approval', processedAt: new Date().toISOString() }
    };

    await PaymentTransactionService.saveTransaction(transactionRecord);

    try {
      await adminDb.runTransaction(async (transaction: FirebaseFirestore.Transaction) => {
        const freshStudentDoc = await transaction.get(studentRef);
        const freshRequestDoc = await transaction.get(requestRef);

        // For a released seat, re-read the bus INSIDE the transaction (all reads
        // before any write) so the increment + status flip + marker clear commit
        // atomically. No compensation needed — bus and student move together.
        const reclaimBusRef = (seatWasReleased && renewalBusId)
          ? (adminDb.collection('buses').doc(renewalBusId) as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>)
          : null;
        const reclaimBusDoc = reclaimBusRef ? await transaction.get(reclaimBusRef) : null;

        if (!freshStudentDoc.exists) throw new Error('Student document not found');
        if (!freshRequestDoc.exists) throw new Error('Renewal request not found');
        if (freshRequestDoc.data()?.status !== 'pending') throw new Error('Request already processed');

        let busDelta: ReturnType<typeof buildCapacityDelta> | null = null;
        if (reclaimBusRef) {
          if (!reclaimBusDoc!.exists) throw new Error('Assigned bus not found for renewal');
          const reclaimBusData = reclaimBusDoc!.data();
          // Atomic ceiling enforcement — closes the last-seat race with the pre-check.
          if ((reclaimBusData?.currentMembers || 0) >= (reclaimBusData?.capacity || 55)) {
            throw new CapacityFullError();
          }
          busDelta = buildCapacityDelta(reclaimBusData, savedStudentData.shift, 1);
        }

        const freshStudentData = freshStudentDoc.data() || {};
        const totalDuration = (freshStudentData.durationYears || 0) + durationYears;
        const blockDates = computeBlockDatesFromValidUntil(newValidUntil, deadlineConfig);

        transaction.update(studentRef, {
          validUntil: newValidUntil,
          status: 'active',
          sessionEndYear: newSessionEndYear,
          durationYears: totalDuration,
          paymentAmount: totalFee,
          softBlock: blockDates.softBlock,
          hardBlock: blockDates.hardBlock,
          lastRenewalDate: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          // Seat reclaimed → clear the release marker so delete/renewal dedup is correct.
          ...(seatWasReleased ? { seatReleasedAt: null } : {})
        });

        if (reclaimBusRef && busDelta) {
          transaction.update(reclaimBusRef, busDelta.updates);
        }

        transaction.update(requestRef, {
          status: 'approved',
          approvedBy: approverUserId,
          approverName: approverData.fullName,
          approvedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });

        // ── Tier A audit (in-transaction): the renewal approval — including the
        //    seat reclaim and entitlement reactivation — commits if and only if
        //    this audit row commits. Replaces the former best-effort post-task log.
        writeAuditInTransaction(transaction, {
          action: 'renewal_request_approved',
          actor: { id: approverUserId, role: approverData.role as AuditActorRole, name: approverData.fullName },
          targetId: studentId,
          targetType: 'student',
          targetName: studentName,
          reason: seatWasReleased ? 'renewal_with_seat_reclaim' : 'renewal_approval',
          before: {
            requestId,
            requestStatus: 'pending',
            seatWasReleased,
            previousValidUntil: savedStudentData.validUntil ?? null,
            previousStatus: freshStudentData.status ?? null,
          },
          after: {
            requestStatus: 'approved',
            status: 'active',
            validUntil: newValidUntil.toISOString(),
            sessionEndYear: newSessionEndYear,
            durationYears: totalDuration,
            seatReclaimedBusId: (reclaimBusRef && busDelta) ? renewalBusId : null,
          },
          details: { requestId, paymentId, paymentMode: isOnlineRenewal ? 'online' : 'offline', totalFee, durationYears },
          correlationId: requestId,
        });
      });
    } catch (txErr: any) {
      if (txErr instanceof CapacityFullError) {
        // Lost the last seat to a concurrent claim after the pre-check. Payment was
        // already recorded (system of record); surface a clear, actionable error so
        // the admin reassigns/increases capacity and re-approves (marker still set,
        // request still pending → safe to retry).
        return NextResponse.json({
          error: 'Original bus is full',
          message: 'The original bus filled up before this renewal completed. Reassign the student or increase capacity, then approve again.',
        }, { status: 409 });
      }
      throw txErr;
    }

    // 4. Parallel Post-Approval Tasks (Audit & Notifications)
    // Parallelize non-critical secondary ops
    const postTasks = [
      // 2. Student Notification (Firestore)
      adminDb.collection('notifications').add({
        title: '✅ Renewal Request Approved',
        content: `Your renewal for ${durationYears} year(s) has been approved. Active until ${newValidUntil.toLocaleDateString()}.`,
        sender: { userId: approverUserId, userName: approverData.fullName, userRole: approverData.role },
        recipientIds: [studentId],
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(), // 1 day
        isRead: false
      }),

      // (Renewal approval audit is written atomically inside the transaction above.)

      // 4. Cloudinary Cleanup
      (async () => {
        if (receiptImageUrl) {
          const publicId = extractPublicId(receiptImageUrl);
          if (publicId) await deleteAsset(publicId);
        }
      })(),

      // 5. Email (Background)
      (async () => {
        const email = studentEmail || savedStudentData?.email;
        if (email) {
          try {
            const { sendApplicationApprovedNotification } = await import('@/lib/services/admin-email.service');
            await sendApplicationApprovedNotification({
              studentName, studentEmail: email,
              busNumber: savedStudentData?.busId?.replace('bus_', 'Bus-') || 'Assigned Bus',
              routeName: 'Service Renewal', shift: savedStudentData?.shift || 'Assigned Shift',
              validUntil: newValidUntil.toLocaleDateString('en-IN')
            });
          } catch (err) { console.error('Email notify failed:', err); }
        }
      })()
    ];

    await Promise.allSettled(postTasks);

    return NextResponse.json({
      success: true,
      message: 'Renewal approved successfully',
      validUntil: newValidUntil.toISOString()
    });

  } catch (error: any) {
    console.error('Renewal approval failed:', error);
    return NextResponse.json({ error: error.message || 'Failed to process renewal approval' }, { status: 500 });
  }
}
