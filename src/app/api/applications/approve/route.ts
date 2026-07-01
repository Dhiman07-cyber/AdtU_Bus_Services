import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Application } from '@/lib/types/application';
import { validateAndSuggestBus, buildCapacityDelta, sendBusFullAlert } from '@/lib/busCapacityService';
import { calculateValidUntilDate } from '@/lib/utils/date-utils';
import { computeBlockDatesFromValidUntil } from '@/lib/utils/deadline-computation';
import { getDeadlineConfig } from '@/lib/deadline-config-service';
import { deleteAsset, extractPublicId } from '@/lib/cloudinary-server';
import { requireModeratorPermission } from '@/lib/security/moderator-permissions';
import { createOfflinePaymentAtApproval } from '@/lib/payment/payment.service';
import { isUpcomingApplication } from '@/lib/utils/application-eligibility';
import { writeAuditInTransaction, type AuditActorRole } from '@/lib/audit/audit-service';
import { CapacityFullError, ApprovalConflictError } from '@/lib/errors/sentinel-errors';
import { safeErrorMessage } from '@/lib/security/safe-error';

/**
 * Optimized Application Approval API
 * 
 * Enhancements:
 * - Parallelized initial data fetching (Auth, Metadata, App, Config)
 * - Parallelized multi-collection cleanup and creation
 * - Backgrounded heavy Cloudinary and Supabase tasks
 * - Integrated hardened Cloudinary server helper
 */

function normalizeShift(shift: string | undefined): string {
  if (!shift) return 'Morning';
  const n = shift.toLowerCase().trim();
  if (n.includes('even')) return 'Evening';
  if (n.includes('morn')) return 'Morning';
  if (n === 'both') return 'Both';
  return 'Morning';
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { applicationId, notes } = body;
    if (!applicationId) return NextResponse.json({ error: 'Application ID required' }, { status: 400 });

    // 1. Parallelize ALL initial distributed reads
    const [decodedToken, deadlineConfig] = await Promise.all([
      adminAuth.verifyIdToken(token),
      getDeadlineConfig()
    ]);

    const uid = decodedToken.uid;
    const [adminSnap, modSnap, appSnap] = (await adminDb.getAll(
      adminDb.collection('admins').doc(uid),
      adminDb.collection('moderators').doc(uid),
      adminDb.collection('applications').doc(applicationId)
    )) as any[];

    if (!adminSnap.exists && !modSnap.exists) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const approverData = adminSnap.exists ? adminSnap.data() : modSnap.data();
    const permissionDenied = await requireModeratorPermission(
      {
        uid,
        email: decodedToken.email || '',
        role: adminSnap.exists ? 'admin' : 'moderator',
        name: approverData?.fullName || approverData?.name || '',
      },
      'applications',
      'canApprove'
    );
    if (permissionDenied) return permissionDenied;

    if (!appSnap.exists) return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    const appData = appSnap.data() as Application;
    if (appData.state !== 'submitted') return NextResponse.json({ error: 'Application already processed' }, { status: 400 });

    const approverName = approverData?.fullName || approverData?.name || 'Admin';
    const approverEmpId = approverData?.employeeId || approverData?.staffId || (adminSnap.exists ? 'ADMIN' : 'MOD');
    const approverRole = adminSnap.exists ? 'admin' : 'moderator';

    // Future-session approval: an admin verifying a future-session application
    // must NOT activate the student directly. It always transitions the application
    // to `verified_upcoming`, where it waits for activation by the Session Activation
    // Service. No student doc, no seat, no capacity decrement, no bus pass is generated
    // at this stage — only the verification of identity, docs, payment, and eligibility.
    if (isUpcomingApplication(appData)) {
      const nowIsoVU = new Date().toISOString();
      try {
        await adminDb.runTransaction(async (transaction) => {
          const freshSnap = await transaction.get(adminDb.collection('applications').doc(applicationId));
          if (!freshSnap.exists || (freshSnap.data() as Application).state !== 'submitted') {
            throw new ApprovalConflictError('Application already processed');
          }
          const freshData = freshSnap.data() as Application;
          const approverNameVU = approverData?.fullName || approverData?.name || 'Admin';
          const approverEmpIdVU = approverData?.employeeId || approverData?.staffId || (adminSnap.exists ? 'ADMIN' : 'MOD');
          transaction.update(freshSnap.ref, {
            state: 'verified_upcoming',
            verifiedUpcomingAt: nowIsoVU,
            verifiedUpcomingBy: `${approverNameVU} (${adminSnap.exists ? 'Admin' : approverEmpIdVU})`,
            verifiedUpcomingById: uid,
            updatedAt: nowIsoVU,
            stateHistory: [...(freshData.stateHistory || []), { state: 'verified_upcoming', timestamp: nowIsoVU, actor: uid }],
          });
          writeAuditInTransaction(transaction, {
            action: 'application_verified_upcoming',
            actor: { id: uid, role: approverRole as AuditActorRole, name: approverNameVU },
            targetId: appData.applicantUid,
            targetType: 'application',
            targetName: appData.formData?.fullName || '',
            reason: 'future_session_verified_pre_activation',
            before: { applicationId, state: 'submitted' },
            after: { applicationId, state: 'verified_upcoming', eligibleApproval: appData.eligibleApproval, targetSession: appData.targetSession },
            details: { applicationId, notes: notes || null },
            correlationId: applicationId,
          });
        });
      } catch (vuErr: any) {
        if (vuErr instanceof ApprovalConflictError) {
          return NextResponse.json({ error: vuErr.message }, { status: 409 });
        }
        throw vuErr;
      }
      // Notify the student that their application is verified and waiting.
      try {
        const notifRef = adminDb.collection('notifications').doc();
        await notifRef.set({
          notifId: notifRef.id,
          toUid: appData.applicantUid,
          toRole: 'student',
          type: 'VerifiedUpcoming',
          title: 'Application verified — awaiting new session',
          body: 'Your application has been verified and will become active when the new academic session begins.',
          links: { applicationId, statusPage: `/apply/status/${applicationId}` },
          read: false,
          createdAt: nowIsoVU,
        });
      } catch (notifErr) {
        console.warn('verified_upcoming notify failed:', notifErr);
      }
      return NextResponse.json({
        success: true,
        message: 'Application verified for the upcoming academic session. It will activate when the session begins.',
        state: 'verified_upcoming',
        eligibleApproval: appData.eligibleApproval,
      });
    }

    const formData = appData.formData;
    const requestedBusId = formData.routeId ? formData.routeId.replace('route_', 'bus_') : null;
    const overrideBusId = (body as any).overrideBusId as string | undefined;

    // ── Override bus (Case 2: alternative-bus picker, parity with /approve-unauth)
    if (overrideBusId && overrideBusId !== requestedBusId) {
      const overrideDoc = await adminDb.collection('buses').doc(overrideBusId).get();
      if (!overrideDoc.exists) {
        return NextResponse.json({ error: 'Selected alternative bus not found' }, { status: 404 });
      }
      const overrideData = overrideDoc.data() || {};
      const overrideShift = (overrideData.shift || '').toLowerCase();
      const appShift = normalizeShift(formData.shift).toLowerCase();
      const shiftCompatible =
        overrideShift === 'both' ||
        overrideShift.includes(appShift) ||
        appShift.includes(overrideShift);
      if (!shiftCompatible) {
        return NextResponse.json({ error: 'Selected bus is not compatible with the required shift' }, { status: 400 });
      }
      if ((overrideData.currentMembers || 0) >= (overrideData.capacity || 55)) {
        return NextResponse.json({ error: 'Selected alternative bus is also full' }, { status: 400 });
      }
      // Mutate formData so the downstream studentDoc and transaction see the override.
      (formData as any).routeId = overrideData.routeId || overrideData.routeRef || formData.routeId;
    }

    const busId = overrideBusId || requestedBusId;
    const finalStopId = formData.stopId || (formData as any).pickupPoint || '';

    if (!busId || !formData.routeId || !finalStopId || !formData.shift) {
      return NextResponse.json({ error: 'Invalid route/stop info' }, { status: 400 });
    }

    // 2. Parallel Validation (Capacity Check)
    const capacityValidation = await validateAndSuggestBus({
      routeId: formData.routeId as string,
      stopId: finalStopId,
      shift: formData.shift as string
    });

    if (!capacityValidation.canAssign) {
      return NextResponse.json({
        error: 'Bus is at full capacity',
        message: capacityValidation.message,
        alternatives: capacityValidation.alternatives
      }, { status: 400 });
    }

    // 3. Prepare data for atomic creation
    const approvedAt = new Date().toISOString();
    const approvedByDisplay = `${approverName} (${adminSnap.exists ? 'Admin' : approverEmpId})`;

    // Check for overridden session start/end years (Part 2 & 3)
    const overrideStartYear = body.sessionStartYear ? Number(body.sessionStartYear) : null;
    const overrideEndYear = body.sessionEndYear ? Number(body.sessionEndYear) : null;

    // Compute final start year, duration, and end year based on overrides
    const finalStartYear = overrideStartYear !== null ? overrideStartYear : Number(formData.sessionInfo?.sessionStartYear || new Date().getUTCFullYear());
    const finalEndYear = overrideEndYear !== null ? overrideEndYear : (Number(formData.sessionInfo?.sessionEndYear) || (finalStartYear + 1));
    const finalDurationYears = overrideStartYear !== null && overrideEndYear !== null ? (overrideEndYear - overrideStartYear) : Number(formData.sessionInfo?.durationYears || 1);

    const validUntilDate = calculateValidUntilDate(finalEndYear - finalDurationYears, finalDurationYears, deadlineConfig);
    const validUntil = validUntilDate.toISOString();
    const sessionEndYear = finalEndYear;

    const blockDates = computeBlockDatesFromValidUntil(validUntil, deadlineConfig);

    const studentDoc = {
      address: formData.address, alternatePhone: formData.alternatePhone || '',
      approvedAt, approvedBy: approvedByDisplay, bloodGroup: formData.bloodGroup,
      busId, createdAt: approvedAt, department: formData.department, dob: formData.dob,
      durationYears: finalDurationYears, email: (appData as any).email || formData.email,
      enrollmentId: formData.enrollmentId, faculty: formData.faculty, fullName: formData.fullName,
      gender: formData.gender, parentName: formData.parentName, parentPhone: formData.parentPhone,
      phoneNumber: formData.phoneNumber, profilePhotoUrl: formData.profilePhotoUrl || '',
      role: 'student', routeId: formData.routeId || '', semester: formData.semester,
      sessionEndYear: sessionEndYear,
      sessionStartYear: finalStartYear, shift: normalizeShift(formData.shift),
      status: 'active', stopId: finalStopId, uid: appData.applicantUid, updatedAt: approvedAt,
      validUntil: validUntil, softBlock: blockDates.softBlock, hardBlock: blockDates.hardBlock,
      paymentAmount: formData.paymentInfo?.amountPaid || 0, paid_on: approvedAt,
    };

    const userDoc = {
      createdAt: approvedAt, email: (appData as any).email || formData.email,
      name: formData.fullName, role: 'student', uid: appData.applicantUid
    };

    // 4. Atomic entitlement + capacity allocation (single Firestore transaction).
    //    Student + user creation, application/unauth cleanup, and the bus capacity
    //    increment all commit together or not at all. The application and bus are
    //    re-read INSIDE the transaction to make approval idempotent (double-click /
    //    retry) and to enforce capacity atomically (no time-of-check/time-of-use race).
    const studentRef = adminDb.collection('students').doc(appData.applicantUid);
    const userRef = adminDb.collection('users').doc(appData.applicantUid);
    const unauthRef = adminDb.collection('unauthUsers').doc(appData.applicantUid);
    const applicationRef = adminDb.collection('applications').doc(applicationId);
    const busRef = adminDb.collection('buses').doc(busId);

    let capacityNewMembers = 0;
    let capacityLimit = 0;
    let busNumberForAlert = '';
    let routeIdForAlert = '';

    try {
      await adminDb.runTransaction(async (transaction) => {
        const [freshAppSnap, busSnap] = await transaction.getAll(applicationRef, busRef);

        // Idempotency guard: a duplicate/retried approval finds the application
        // already consumed and aborts cleanly without creating a second student.
        if (!freshAppSnap.exists || (freshAppSnap.data() as Application).state !== 'submitted') {
          throw new ApprovalConflictError('Application already processed');
        }
        if (!busSnap.exists) {
          throw new Error(`Bus ${busId} not found`);
        }

        // Atomic capacity gate — closes the race with concurrent approvals competing
        // for the last seat. Uses the shared single-source capacity math.
        const busData = busSnap.data();
        const delta = buildCapacityDelta(busData, studentDoc.shift, 1);
        if (delta.oldMembers >= delta.capacity) {
          throw new CapacityFullError();
        }

        capacityNewMembers = delta.newMembers;
        capacityLimit = delta.capacity;
        busNumberForAlert = busData?.busNumber || '';
        routeIdForAlert = busData?.routeId || '';

        transaction.set(userRef, userDoc);
        transaction.set(studentRef, studentDoc);
        transaction.update(busRef, delta.updates);
        transaction.delete(unauthRef);
        transaction.delete(applicationRef);

        // ── Tier A audit: written INSIDE the transaction. The approval commits
        //    if and only if this audit row commits (mutation ⟺ audit). This
        //    replaces the former best-effort post-commit logs and, critically,
        //    guarantees EVERY approval (not just session/bus overrides) is audited.
        const sessionModified =
          (overrideStartYear !== null || overrideEndYear !== null) &&
          (Number(formData.sessionInfo?.sessionStartYear || 0) !== finalStartYear ||
            Number(formData.sessionInfo?.sessionEndYear || 0) !== finalEndYear);
        const usedAlternativeBus = !!overrideBusId && overrideBusId !== requestedBusId;
        writeAuditInTransaction(transaction, {
          action: 'application_approved',
          actor: { id: uid, role: approverRole as AuditActorRole, name: approverName },
          targetId: appData.applicantUid,
          targetType: 'student',
          targetName: formData.fullName || '',
          reason: usedAlternativeBus ? 'capacity_reallocation' : 'application_approval',
          before: { applicationId, applicationState: 'submitted', requestedBusId: requestedBusId || null },
          after: {
            studentUid: appData.applicantUid,
            busId,
            shift: studentDoc.shift,
            sessionStartYear: finalStartYear,
            sessionEndYear: finalEndYear,
            validUntil,
            status: 'active',
          },
          details: {
            applicationId,
            notes: notes || null,
            sessionModified,
            previousStartYear: Number(formData.sessionInfo?.sessionStartYear || 0),
            previousEndYear: Number(formData.sessionInfo?.sessionEndYear || 0),
            alternativeBus: usedAlternativeBus
              ? { requestedBusId: requestedBusId || null, approvedBusId: overrideBusId }
              : null,
          },
          correlationId: applicationId,
        });
      });
    } catch (txErr: any) {
      if (txErr instanceof ApprovalConflictError) {
        return NextResponse.json({ error: txErr.message }, { status: 409 });
      }
      if (txErr instanceof CapacityFullError) {
        // Lost the last seat after the up-front pre-check — return the same
        // "bus full" response (with alternatives) as the initial gate.
        const fullValidation = await validateAndSuggestBus({
          routeId: formData.routeId as string,
          stopId: finalStopId,
          shift: formData.shift as string
        });
        return NextResponse.json({
          error: 'Bus is at full capacity',
          message: fullValidation.message,
          alternatives: fullValidation.alternatives
        }, { status: 400 });
      }
      throw txErr;
    }

    // (Approval audit is now written atomically inside the transaction above —
    //  see the Tier A `writeAuditInTransaction` call. No best-effort post-commit
    //  audit remains, so an approval can never commit without its audit record.)

    // 5. Payment processing AFTER successful transaction — prevents inconsistent
    //    state where payment is Completed but student was never created (e.g. bus
    //    full race or duplicate approval conflict).
    const amount = Number(formData.paymentInfo?.amountPaid || 0);
    if (amount > 0) {
      const { paymentsSupabaseService } = await import('@/lib/services/payments-supabase');
      const isOnline = formData.paymentInfo?.paymentMode === 'online' || !!formData.paymentInfo?.razorpayPaymentId;

      if (isOnline) {
        const studentPayments = await paymentsSupabaseService.getPaymentsByStudentUid(appData.applicantUid);
        const onlinePayment = studentPayments.find(p => p.method === 'Online' && p.status === 'Completed');
        if (!onlinePayment) {
          console.error('Completed online payment record not found post-transaction for', appData.applicantUid);
        } else {
          const updatedPaymentId = await paymentsSupabaseService.upsertPayment({
            paymentId: onlinePayment.payment_id,
            studentId: formData.enrollmentId,
            studentUid: appData.applicantUid,
            studentName: formData.fullName,
            amount: onlinePayment.amount,
            method: 'Online',
            status: 'Completed',
            sessionStartYear: finalStartYear,
            sessionEndYear: sessionEndYear,
            durationYears: finalDurationYears,
            validUntil: new Date(validUntil),
            stopId: finalStopId,
            razorpayPaymentId: onlinePayment.razorpay_payment_id,
            razorpayOrderId: onlinePayment.razorpay_order_id,
          });

          if (!updatedPaymentId) {
            console.error('Failed to update online payment validity post-transaction for', appData.applicantUid);
          }
        }
      } else {
        // OFFLINE PAYMENT: Create completed payment record AT APPROVAL TIME.
        // Financial ledger contains ONLY verified financial events.
        // The student's submitted payment details are verified by the admin
        // and become the authoritative financial record.
        const transactionId = formData.paymentInfo?.paymentReference || '';
        const paidAtFromStudent = formData.paymentInfo?.paidAt
          ? new Date(formData.paymentInfo.paidAt)
          : new Date(approvedAt);
        const receipt = formData.paymentInfo?.paymentEvidenceUrl || '';

        await createOfflinePaymentAtApproval({
          studentId: formData.enrollmentId,
          studentUid: appData.applicantUid,
          studentName: formData.fullName,
          amount,
          durationYears: finalDurationYears,
          sessionStartYear: finalStartYear,
          sessionEndYear: sessionEndYear,
          validUntil,
          transactionId,
          paidAt: paidAtFromStudent,
          receipt,
          approverUserId: uid,
          approverName,
          approverEmpId,
          approverRole,
          purpose: 'new_registration',
        });
      }
    }

    // 6. Post-commit side effects (never affect the committed entitlement/capacity invariant).
    const postTasks: Promise<unknown>[] = [
      // Cloudinary Cleanup
      (async () => {
        if (formData.paymentInfo?.paymentEvidenceUrl) {
          const publicId = extractPublicId(formData.paymentInfo.paymentEvidenceUrl);
          if (publicId) await deleteAsset(publicId);
        }
      })(),
    ];

    // Bus full alert if this approval consumed the last seat
    if (capacityLimit > 0 && capacityNewMembers >= capacityLimit) {
      postTasks.push(sendBusFullAlert(busId, busNumberForAlert, routeIdForAlert));
    }

    await Promise.allSettled(postTasks);

    return NextResponse.json({
      success: true,
      message: 'Application approved successfully',
      studentUid: appData.applicantUid
    });

  } catch (error: any) {
    console.error('Approval error:', error);
    return NextResponse.json({ error: safeErrorMessage(error, 'Failed to approve application') }, { status: 500 });
  }
}
