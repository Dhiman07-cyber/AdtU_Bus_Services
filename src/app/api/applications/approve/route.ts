import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Application, AuditLogEntry } from '@/lib/types/application';
import { validateAndSuggestBus, buildCapacityDelta, sendBusFullAlert } from '@/lib/busCapacityService';
import { calculateRenewalDate } from '@/lib/utils/renewal-utils';
import { computeBlockDatesFromValidUntil } from '@/lib/utils/deadline-computation';
import { getDeadlineConfig } from '@/lib/deadline-config-service';
import { deleteAsset, extractPublicId } from '@/lib/cloudinary-server';
import { requireModeratorPermission } from '@/lib/security/moderator-permissions';
import { PaymentTransactionService } from '@/lib/payment/payment-transaction.service';
import { isApprovalEligible } from '@/lib/utils/application-eligibility';
import { writeAuditInTransaction, type AuditActorRole } from '@/lib/audit/audit-service';

/**
 * Optimized Application Approval API
 * 
 * Enhancements:
 * - Parallelized initial data fetching (Auth, Metadata, App, Config)
 * - Parallelized multi-collection cleanup and creation
 * - Backgrounded heavy Cloudinary and Supabase tasks
 * - Integrated hardened Cloudinary server helper
 */

/** Thrown inside the approval transaction when the application was already consumed (duplicate / retry). */
class ApprovalConflictError extends Error {}
/** Thrown inside the approval transaction when the target bus has no free seat (lost the last-seat race). */
class CapacityFullError extends Error {}

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

    // Phase 2 eligibility gate (server-enforced; UI also disables the button).
    // A future-session application may not be approved before its frozen
    // eligibleApproval date (= softBlock(targetSession.startYear) + 1 day).
    // Legacy/absent eligibleApproval ⇒ immediately eligible.
    if (!isApprovalEligible(appData)) {
      return NextResponse.json({
        error: 'Application is not yet eligible for approval',
        message: `This future-session application becomes eligible on ${new Date(appData.eligibleApproval as string).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}.`,
        eligibleApproval: appData.eligibleApproval,
      }, { status: 409 });
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
    const approverName = approverData?.fullName || approverData?.name || 'Admin';
    const approverEmpId = approverData?.employeeId || approverData?.staffId || (adminSnap.exists ? 'ADMIN' : 'MOD');
    const approvedByDisplay = `${approverName} (${adminSnap.exists ? 'Admin' : approverEmpId})`;
    const approverRole = adminSnap.exists ? 'admin' : 'moderator';

    // Check for overridden session start/end years (Part 2 & 3)
    const overrideStartYear = body.sessionStartYear ? Number(body.sessionStartYear) : null;
    const overrideEndYear = body.sessionEndYear ? Number(body.sessionEndYear) : null;

    // Compute final start year, duration, and end year based on overrides
    const finalStartYear = overrideStartYear !== null ? overrideStartYear : Number(formData.sessionInfo?.sessionStartYear || new Date().getFullYear());
    const finalEndYear = overrideEndYear !== null ? overrideEndYear : (Number(formData.sessionInfo?.sessionEndYear) || (finalStartYear + 1));
    const finalDurationYears = overrideStartYear !== null && overrideEndYear !== null ? (overrideEndYear - overrideStartYear) : Number(formData.sessionInfo?.durationYears || 1);

    const anchorMonth = deadlineConfig.academicYear.anchorMonth;
    const anchorDay = deadlineConfig.academicYear.anchorDay;
    const validUntilDate = new Date(finalEndYear, anchorMonth, anchorDay, 23, 59, 59, 999);
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

    const amount = Number(formData.paymentInfo?.amountPaid || 0);
    if (amount > 0) {
      const { paymentsSupabaseService } = await import('@/lib/services/payments-supabase');
      const isOnline = formData.paymentInfo?.paymentMode === 'online' || !!formData.paymentInfo?.razorpayPaymentId;

      if (isOnline) {
        const studentPayments = await paymentsSupabaseService.getPaymentsByStudentUid(appData.applicantUid);
        const onlinePayment = studentPayments.find(p => p.method === 'Online' && p.status === 'Completed');
        if (!onlinePayment) {
          throw new Error('Completed online payment record not found');
        }

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
          throw new Error('Failed to update online payment validity');
        }
      } else {
        // Deterministic offline payment id keyed by applicationId — stable across
        // retries so re-running the approval never creates a duplicate ledger entry.
        const paymentId = (appData as any).paymentId || formData.paymentId || formData.paymentInfo?.paymentReference || `OADF_APP_${applicationId}`;
        await PaymentTransactionService.saveTransaction({
          paymentId,
          studentId: formData.enrollmentId,
          studentName: formData.fullName,
          userId: appData.applicantUid,
          amount,
          paymentMethod: 'offline',
          status: 'completed',
          sessionStartYear: finalStartYear,
          sessionEndYear: sessionEndYear,
          durationYears: finalDurationYears,
          validUntil: validUntil,
          timestamp: approvedAt,
          offlineTransactionId: formData.paymentInfo?.paymentReference || `app_fee_${applicationId}`,
          approvedBy: {
            userId: uid,
            empId: approverEmpId,
            name: approverName,
            role: approverRole,
            email: decodedToken.email || '',
          },
          approvedByDisplay,
          approvedAtISO: approvedAt,
        });
      }
    }

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

    // 5. Post-commit side effects (never affect the committed entitlement/capacity invariant).
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
    return NextResponse.json({ error: error.message || 'Failed to approve application' }, { status: 500 });
  }
}
