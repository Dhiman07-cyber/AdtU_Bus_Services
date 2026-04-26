import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Application, AuditLogEntry } from '@/lib/types/application';
import { validateAndSuggestBus, incrementBusCapacity } from '@/lib/busCapacityService';
import { calculateRenewalDate } from '@/lib/utils/renewal-utils';
import { generateOfflinePaymentId } from '@/lib/types/payment';
import { computeBlockDatesFromValidUntil } from '@/lib/utils/deadline-computation';
import { getDeadlineConfig } from '@/lib/deadline-config-service';
import { deleteAsset, extractPublicId } from '@/lib/cloudinary-server';

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
    const approverData = adminSnap.exists ? adminSnap.data() : modSnap.data();
    const approverName = approverData?.fullName || approverData?.name || 'Admin';
    const approverEmpId = approverData?.employeeId || approverData?.staffId || (adminSnap.exists ? 'ADMIN' : 'MOD');
    const approvedByDisplay = `${approverName} (${adminSnap.exists ? 'Admin' : approverEmpId})`;

    const { newValidUntil } = calculateRenewalDate(null, formData.sessionInfo.durationYears, deadlineConfig);
    const blockDates = computeBlockDatesFromValidUntil(newValidUntil, deadlineConfig);

    const studentDoc = {
      address: formData.address, alternatePhone: formData.alternatePhone || '',
      approvedAt, approvedBy: approvedByDisplay, bloodGroup: formData.bloodGroup,
      busId, createdAt: approvedAt, department: formData.department, dob: formData.dob,
      durationYears: formData.sessionInfo.durationYears, email: (appData as any).email || formData.email,
      enrollmentId: formData.enrollmentId, faculty: formData.faculty, fullName: formData.fullName,
      gender: formData.gender, parentName: formData.parentName, parentPhone: formData.parentPhone,
      phoneNumber: formData.phoneNumber, profilePhotoUrl: formData.profilePhotoUrl || '',
      role: 'student', routeId: formData.routeId || '', semester: formData.semester,
      sessionEndYear: new Date(newValidUntil).getFullYear(),
      sessionStartYear: formData.sessionInfo.sessionStartYear, shift: normalizeShift(formData.shift),
      status: 'active', stopId: finalStopId, uid: appData.applicantUid, updatedAt: approvedAt,
      validUntil: newValidUntil, softBlock: blockDates.softBlock, hardBlock: blockDates.hardBlock,
      paymentAmount: formData.paymentInfo?.amountPaid || 0, paid_on: approvedAt,
    };

    const userDoc = {
      createdAt: approvedAt, email: (appData as any).email || formData.email,
      name: formData.fullName, role: 'student', uid: appData.applicantUid
    };

    // 4. Batch/Parallelize ALL Firestore Writes & Deletions
    // Using individual set/delete calls but firing in parallel is faster for distributed IDs
    await Promise.all([
      adminDb.collection('students').doc(appData.applicantUid).set(studentDoc),
      adminDb.collection('users').doc(appData.applicantUid).set(userDoc),
      adminDb.collection('unauthUsers').doc(appData.applicantUid).delete().catch(() => null),
      adminDb.collection('applications').doc(applicationId).delete()
    ]);

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
      // Supabase Payment Sync
      (async () => {
        try {
          const { paymentsSupabaseService } = await import('@/lib/services/payments-supabase');
          const amount = Number(formData.paymentInfo?.amountPaid || 0);
          if (amount <= 0) return;

          const isOnline = formData.paymentInfo?.paymentMode === 'online' || !!formData.paymentInfo?.razorpayPaymentId;
          
          if (isOnline) {
             const studentPayments = await paymentsSupabaseService.getPaymentsByStudentUid(appData.applicantUid);
             const onlinePayment = studentPayments.find(p => p.method === 'Online' && p.status === 'Completed');
             if (onlinePayment) {
               await paymentsSupabaseService.upsertPayment({
                 paymentId: onlinePayment.payment_id, studentId: formData.enrollmentId,
                 studentUid: appData.applicantUid, studentName: formData.fullName,
                 amount: onlinePayment.amount, method: 'Online', status: 'Completed',
                 sessionStartYear: onlinePayment.session_start_year,
                 sessionEndYear: studentDoc.sessionEndYear, durationYears: onlinePayment.duration_years,
                 validUntil: new Date(newValidUntil), stopId: finalStopId,
                 razorpayPaymentId: onlinePayment.razorpay_payment_id, razorpayOrderId: onlinePayment.razorpay_order_id,
               });
             }
          } else {
            let paymentId = (appData as any).paymentId || formData.paymentId || formData.paymentInfo?.paymentReference || generateOfflinePaymentId('new_registration');
            await paymentsSupabaseService.upsertPayment({
              paymentId, studentId: formData.enrollmentId, studentUid: appData.applicantUid,
              studentName: formData.fullName, amount, method: 'Offline', status: 'Completed',
              stopId: finalStopId, sessionStartYear: formData.sessionInfo.sessionStartYear,
              sessionEndYear: studentDoc.sessionEndYear, durationYears: formData.sessionInfo.durationYears,
              validUntil: new Date(newValidUntil), transactionDate: new Date(),
              offlineTransactionId: formData.paymentInfo?.paymentReference || `app_fee_${applicationId}`,
              approvedBy: { type: 'Manual', userId: uid, empId: approverEmpId, name: approverName, role: adminSnap.exists ? 'Admin' : 'Moderator' },
              approvedAt: new Date(),
            });
          }
        } catch (e) { console.error('Supabase sync error:', e); }
      })()
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
