import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, FieldValue } from '@/lib/firebase-admin';
import { Application, AuditLogEntry } from '@/lib/types/application';
import { validateAndSuggestBus, incrementBusCapacity } from '@/lib/busCapacityService';
import { calculateRenewalDate } from '@/lib/utils/renewal-utils';
import { generateOfflinePaymentId } from '@/lib/types/payment';
import { computeBlockDatesFromValidUntil } from '@/lib/utils/deadline-computation';
import { getDeadlineConfig } from '@/lib/deadline-config-service';
import { deleteAsset, extractPublicId } from '@/lib/cloudinary-server';
import { requireModeratorPermission } from '@/lib/security/moderator-permissions';
import { PaymentTransactionService } from '@/lib/payment/payment-transaction.service';

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

    const formData = appData.formData;
    const busId = formData.routeId ? formData.routeId.replace('route_', 'bus_') : null;
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
        const paymentId = (appData as any).paymentId || formData.paymentId || formData.paymentInfo?.paymentReference || generateOfflinePaymentId('new_registration');
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

    // 4. Batch/Parallelize ALL Firestore Writes & Deletions
    const batch = adminDb.batch();
    batch.set(adminDb.collection('users').doc(appData.applicantUid), userDoc);
    batch.set(adminDb.collection('students').doc(appData.applicantUid), studentDoc);
    batch.delete(adminDb.collection('unauthUsers').doc(appData.applicantUid));
    batch.delete(adminDb.collection('applications').doc(applicationId));
    await batch.commit();

    // Audit Logging if session years were modified (Part 5)
    if (overrideStartYear !== null || overrideEndYear !== null) {
      const originalStart = Number(formData.sessionInfo?.sessionStartYear || 0);
      const originalEnd = Number(formData.sessionInfo?.sessionEndYear || 0);
      
      if (originalStart !== finalStartYear || originalEnd !== finalEndYear) {
        await adminDb.collection('activity_logs').add({
          action: 'application_approved_with_modified_session',
          performedBy: uid,
          actorName: approverName,
          actorRole: approverRole,
          targetId: appData.applicantUid,
          targetName: formData.fullName || '',
          details: {
            applicationId: applicationId,
            previousStartYear: originalStart,
            finalApprovedStartYear: finalStartYear,
            previousEndYear: originalEnd,
            finalApprovedEndYear: finalEndYear,
          },
          timestamp: FieldValue.serverTimestamp(),
        }).catch(err => console.error('Failed to write modification audit log:', err));
      }
    }

    // 5. Parallelized Background Post-Tasks (Cloudinary, Supabase, Capacity)
    const postTasks = [
      // Cloudinary Cleanup
      (async () => {
        if (formData.paymentInfo?.paymentEvidenceUrl) {
          const publicId = extractPublicId(formData.paymentInfo.paymentEvidenceUrl);
          if (publicId) await deleteAsset(publicId);
        }
      })(),
      // Bus Capacity Sync
      incrementBusCapacity(busId, appData.applicantUid, formData.shift).catch(() => null),
    ];

    // Optional: Await them briefly or just return if backgrounding is safe
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
