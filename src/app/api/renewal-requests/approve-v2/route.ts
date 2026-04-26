import { NextRequest, NextResponse } from 'next/server';
import { adminDb, FieldValue, verifyToken } from '@/lib/firebase-admin';
import { PaymentTransactionService } from '@/lib/payment/payment-transaction.service';
import { calculateValidUntilDate } from '@/lib/utils/date-utils';
import { generateOfflinePaymentId } from '@/lib/types/payment';
import { computeBlockDatesFromValidUntil } from '@/lib/utils/deadline-computation';
import { deleteAsset, extractPublicId } from '@/lib/cloudinary-server';
import { getDeadlineConfig } from '@/lib/deadline-config-service';

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
    if (!requestId) return NextResponse.json({ error: 'Request ID required' }, { status: 400 });

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

    if (!requestSnap.exists) return NextResponse.json({ error: 'Renewal request not found' }, { status: 404 });
    const requestData = requestSnap.data()!;
    if (requestData.status !== 'pending') return NextResponse.json({ error: 'Request already processed' }, { status: 400 });

    const { 
      studentId, enrollmentId, studentName, durationYears, totalFee, 
      transactionId, receiptImageUrl, studentEmail, studentPhone 
    } = requestData;

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

    // Check for double processing
    if (await PaymentTransactionService.isPaymentProcessed(paymentId)) {
      return NextResponse.json({ error: 'Payment already processed' }, { status: 400 });
    }

    // 3. Main Atomic Transaction (Validity & Status)
    const studentRef = adminDb.collection('students').doc(studentId);
    let newValidUntil: Date = new Date();
    let savedStudentData: any;

    await adminDb.runTransaction(async (transaction: any) => {
      const studentDoc = await transaction.get(studentRef);
      if (!studentDoc.exists) throw new Error('Student document not found');
      savedStudentData = studentDoc.data();

      const existingValidUntil = savedStudentData.validUntil;
      const now = new Date();
      let baseYear = now.getFullYear();

      if (existingValidUntil) {
        const existingDate = existingValidUntil.toDate ? existingValidUntil.toDate() : new Date(existingValidUntil);
        if (existingDate > now) {
          baseYear = savedStudentData.sessionEndYear || baseYear;
        }
      }

      newValidUntil = calculateValidUntilDate(baseYear, durationYears, deadlineConfig);
      const newSessionEndYear = baseYear + durationYears;
      const totalDuration = (savedStudentData.durationYears || 0) + durationYears;
      const blockDates = computeBlockDatesFromValidUntil(newValidUntil, deadlineConfig);

      // Update student document
      transaction.update(studentRef, {
        validUntil: newValidUntil,
        status: 'active',
        sessionEndYear: newSessionEndYear,
        durationYears: totalDuration,
        paymentAmount: totalFee,
        softBlock: blockDates.softBlock,
        hardBlock: blockDates.hardBlock,
        lastRenewalDate: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      // Update request status
      transaction.update(requestSnap.ref, {
        status: 'approved',
        approvedBy: approverUserId,
        approverName: approverData.fullName,
        approvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    // 4. Parallel Post-Approval Tasks (Audit & Notifications)
    const approvalTimestamp = Date.now();
    const transactionRecord = {
      studentId: enrollmentId,
      studentName,
      studentEmail: studentEmail || savedStudentData?.email || 'N/A',
      studentPhone: studentPhone || savedStudentData?.phone || 'N/A',
      amount: totalFee,
      paymentMethod: 'offline' as const,
      paymentId,
      offlineTransactionId: transactionId || '',
      durationYears,
      validUntil: newValidUntil.toISOString(),
      newValidUntil: newValidUntil.toISOString(),
      sessionStartYear: savedStudentData?.sessionStartYear,
      sessionEndYear: newValidUntil.getFullYear(),
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

    // Parallelize secondary ops
    const postTasks = [
      // 1. Transaction Log (Supabase)
      PaymentTransactionService.saveTransaction(transactionRecord),
      
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

      // 3. Activity Log (Firestore)
      adminDb.collection('activity_logs').add({
        action: 'renewal_request_approved', performedBy: approverUserId,
        targetId: studentId, targetName: studentName,
        details: { requestId, durationYears, totalFee, newValidUntil: newValidUntil.toISOString() },
        timestamp: FieldValue.serverTimestamp()
      }),

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