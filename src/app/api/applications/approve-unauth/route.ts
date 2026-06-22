import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, FieldValue } from '@/lib/firebase-admin';
import { v2 as cloudinary } from 'cloudinary';
import { calculateRenewalDate } from '@/lib/utils/renewal-utils';
import { incrementBusCapacity } from '@/lib/busCapacityService';
import { generateOfflinePaymentId } from '@/lib/types/payment';
import { computeBlockDatesFromValidUntil } from '@/lib/utils/deadline-computation';
import { sendApplicationApprovedNotification } from '@/lib/services/admin-email.service';
import { getDeadlineConfig } from '@/lib/deadline-config-service';
import { requireModeratorPermission } from '@/lib/security/moderator-permissions';
import { PaymentTransactionService } from '@/lib/payment/payment-transaction.service';

type JsonRecord = Record<string, unknown>;

if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET && process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? value as JsonRecord : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeShiftValue(shift: unknown): string {
  const value = asString(shift).toLowerCase().trim();
  if (value.includes('evening')) return 'Evening';
  if (value.includes('morning')) return 'Morning';
  if (value === 'both') return 'Both';
  return 'Morning';
}

function extractPublicIdFromUrl(url: string): string | null {
  try {
    const matches = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
    return matches ? matches[1] : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const moderatorUid = decodedToken.uid;
    const moderatorEmail = decodedToken.email || '';
    const body = asRecord(await request.json());
    const studentUid = asString(body.studentUid);

    if (!studentUid) {
      return NextResponse.json({ error: 'Missing student UID' }, { status: 400 });
    }

    const [moderatorDoc, adminDoc, applicationDoc] = await Promise.all([
      adminDb.collection('moderators').doc(moderatorUid).get(),
      adminDb.collection('admins').doc(moderatorUid).get(),
      adminDb.collection('applications').doc(studentUid).get(),
    ]);

    if (!moderatorDoc.exists && !adminDoc.exists) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const moderatorData = moderatorDoc.exists ? moderatorDoc.data() : adminDoc.data();
    const approverRole = adminDoc.exists ? 'admin' : 'moderator';
    const permissionDenied = await requireModeratorPermission(
      {
        uid: moderatorUid,
        email: moderatorEmail,
        role: approverRole,
        name: moderatorData?.fullName || moderatorData?.name || '',
      },
      'applications',
      'canApprove'
    );
    if (permissionDenied) return permissionDenied;

    if (!applicationDoc.exists) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const appData = applicationDoc.data() as JsonRecord;
    const formData = asRecord(appData.formData);
    const sessionInfo = asRecord(formData.sessionInfo);
    const paymentInfo = asRecord(formData.paymentInfo);
    const applicantUid = asString(appData.applicantUid) || studentUid;
    const nowIso = new Date().toISOString();
    const approverName = moderatorData?.name || moderatorData?.fullName || 'Approver';
    const approverEmpId = moderatorData?.employeeId || moderatorData?.staffId || moderatorUid;
    const approvedByDisplay = adminDoc.exists
      ? `${approverName} (Admin)`
      : `${approverName} (${approverEmpId})`;

    // Check for overridden session start/end years (Part 2 & 3)
    const overrideStartYear = body.sessionStartYear ? Number(body.sessionStartYear) : null;
    const overrideEndYear = body.sessionEndYear ? Number(body.sessionEndYear) : null;

    const deadlineConfig = await getDeadlineConfig();
    
    // Compute final start year, duration, and end year based on overrides
    const finalStartYear = overrideStartYear !== null ? overrideStartYear : Number(sessionInfo.sessionStartYear || new Date().getFullYear());
    const finalEndYear = overrideEndYear !== null ? overrideEndYear : (Number(sessionInfo.sessionEndYear) || (finalStartYear + 1));
    const finalDurationYears = overrideStartYear !== null && overrideEndYear !== null ? (overrideEndYear - overrideStartYear) : Number(sessionInfo.durationYears || 1);

    const anchorMonth = deadlineConfig.academicYear.anchorMonth;
    const anchorDay = deadlineConfig.academicYear.anchorDay;
    const validUntilDate = new Date(finalEndYear, anchorMonth, anchorDay, 23, 59, 59, 999);
    const validUntil = validUntilDate.toISOString();
    const sessionEndYear = finalEndYear;
    
    const blockDates = computeBlockDatesFromValidUntil(validUntil, deadlineConfig);
    const busId = asString(formData.routeId) ? asString(formData.routeId).replace('route_', 'bus_') : '';
    const shift = normalizeShiftValue(formData.shift);

    const userDoc = {
      createdAt: nowIso,
      email: asString(appData.email) || asString(formData.email),
      name: asString(formData.fullName),
      role: 'student',
      uid: applicantUid,
    };

    const studentDoc = {
      address: formData.address,
      alternatePhone: formData.alternatePhone || '',
      approvedAt: nowIso,
      approvedBy: approvedByDisplay,
      bloodGroup: formData.bloodGroup,
      busId,
      createdAt: nowIso,
      department: formData.department,
      dob: formData.dob,
      durationYears: finalDurationYears,
      email: asString(appData.email) || asString(formData.email),
      enrollmentId: formData.enrollmentId,
      faculty: formData.faculty,
      fullName: formData.fullName,
      gender: formData.gender,
      parentName: formData.parentName,
      parentPhone: formData.parentPhone,
      phoneNumber: formData.phoneNumber,
      profilePhotoUrl: formData.profilePhotoUrl || '',
      role: 'student',
      routeId: formData.routeId || '',
      semester: formData.semester,
      sessionEndYear,
      sessionStartYear: finalStartYear,
      shift,
      status: 'active',
      stopId: formData.stopId || '',
      uid: applicantUid,
      updatedAt: nowIso,
      validUntil,
      softBlock: blockDates.softBlock,
      hardBlock: blockDates.hardBlock,
      paymentAmount: Number(paymentInfo.amountPaid || 0),
      paid_on: nowIso,
    };


    const paymentAmount = Number(paymentInfo.amountPaid || 0);
    if (paymentAmount > 0) {
      const isOnlinePayment = paymentInfo.paymentMode === 'online';

      if (isOnlinePayment) {
        const { paymentsSupabaseService } = await import('@/lib/services/payments-supabase');
        const studentPayments = await paymentsSupabaseService.getPaymentsByStudentUid(applicantUid);
        const onlinePayment = studentPayments.find(p => p.method === 'Online' && p.status === 'Completed');
        if (!onlinePayment) {
          throw new Error('Completed online payment record not found');
        }

        const updatedPaymentId = await paymentsSupabaseService.upsertPayment({
          paymentId: onlinePayment.payment_id,
          studentId: onlinePayment.student_id,
          studentUid: onlinePayment.student_uid,
          studentName: onlinePayment.student_name,
          amount: onlinePayment.amount,
          method: 'Online',
          status: 'Completed',
          sessionStartYear: finalStartYear,
          sessionEndYear,
          durationYears: finalDurationYears,
          validUntil: new Date(validUntil),
          razorpayPaymentId: onlinePayment.razorpay_payment_id,
          razorpayOrderId: onlinePayment.razorpay_order_id,
        });

        if (!updatedPaymentId) {
          throw new Error('Failed to update online payment validity');
        }
      } else {
        const paymentId =
          asString(appData.paymentId) ||
          asString(formData.paymentId) ||
          asString(paymentInfo.paymentReference) ||
          generateOfflinePaymentId('new_registration');

        await PaymentTransactionService.saveTransaction({
          paymentId,
          studentId: asString(formData.enrollmentId),
          studentName: asString(formData.fullName),
          userId: applicantUid,
          amount: paymentAmount,
          paymentMethod: 'offline',
          status: 'completed',
          sessionStartYear: finalStartYear,
          sessionEndYear,
          durationYears: finalDurationYears,
          validUntil,
          timestamp: nowIso,
          offlineTransactionId: asString(paymentInfo.paymentReference) || `unauth_app_fee_${applicantUid}`,
          approvedBy: {
            userId: moderatorUid,
            empId: asString(moderatorData?.employeeId) || moderatorUid,
            name: asString(moderatorData?.name) || moderatorEmail || 'Approver',
            role: approverRole,
            email: moderatorEmail,
          },
          approvedByDisplay,
          approvedAtISO: nowIso,
        });
      }
    }

    const batch = adminDb.batch();
    batch.set(adminDb.collection('users').doc(applicantUid), userDoc);
    batch.set(adminDb.collection('students').doc(applicantUid), studentDoc);
    batch.delete(applicationDoc.ref);
    batch.delete(adminDb.collection('unauthUsers').doc(applicantUid));
    await batch.commit();

    // Audit Logging if session years were modified (Part 5)
    if (overrideStartYear !== null || overrideEndYear !== null) {
      const originalStart = Number(sessionInfo.sessionStartYear || 0);
      const originalEnd = Number(sessionInfo.sessionEndYear || 0);
      
      if (originalStart !== finalStartYear || originalEnd !== finalEndYear) {
        await adminDb.collection('activity_logs').add({
          action: 'application_approved_with_modified_session',
          performedBy: moderatorUid,
          actorName: approverName,
          actorRole: approverRole,
          targetId: applicantUid,
          targetName: asString(formData.fullName),
          details: {
            applicationId: studentUid,
            previousStartYear: originalStart,
            finalApprovedStartYear: finalStartYear,
            previousEndYear: originalEnd,
            finalApprovedEndYear: finalEndYear,
          },
          timestamp: FieldValue.serverTimestamp(),
        }).catch(err => console.error('Failed to write modification audit log:', err));
      }
    }


    if (studentDoc.email) {
      try {
        await sendApplicationApprovedNotification({
          studentName: asString(studentDoc.fullName),
          studentEmail: asString(studentDoc.email),
          busNumber: busId ? busId.replace('bus_', 'Bus-') : 'Assigned Soon',
          routeName: asString(formData.routeName) || `Route ${asString(studentDoc.routeId).replace('route_', '')}`,
          shift,
          validUntil: new Date(validUntil).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
        });
      } catch (emailError) {
        console.error('Failed to send application approval email:', emailError);
      }
    }

    if (busId) {
      await incrementBusCapacity(busId, applicantUid, shift).catch(error => {
        console.error(`Failed to increment bus capacity for ${busId}:`, error);
      });
    }

    const paymentEvidenceUrl = asString(paymentInfo.paymentEvidenceUrl);
    if (paymentEvidenceUrl && cloudinary.config().api_key) {
      const publicId = extractPublicIdFromUrl(paymentEvidenceUrl);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId).catch(error => {
          console.error('Failed to delete payment proof from Cloudinary:', error);
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Application approved successfully',
      studentUid: applicantUid,
    });
  } catch (error) {
    console.error('Error approving application:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to approve application' },
      { status: 500 }
    );
  }
}
