import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/firebase-admin';
import { adminDb, FieldValue } from '@/lib/firebase-admin';
import { PaymentTransactionService } from '@/lib/payment/payment-transaction.service';
import { calculateValidUntilDate } from '@/lib/utils/date-utils';
import { v4 as uuidv4 } from 'uuid';
import { generateOfflinePaymentId } from '@/lib/types/payment';
import { computeBlockDatesFromValidUntil } from '@/lib/utils/deadline-computation';
import { v2 as cloudinary } from 'cloudinary';
import { getDeadlineConfig } from '@/lib/deadline-config-service';

// Configure Cloudinary
if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET && process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await verifyToken(token);
    const approverUserId = decodedToken.uid;

    // Verify approver is admin or moderator
    const approverDoc = await adminDb.collection('users').doc(approverUserId).get();
    const approverData = approverDoc.data();

    if (!approverData || !['admin', 'moderator'].includes(approverData.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const { requestId } = body;

    if (!requestId) {
      return NextResponse.json({ error: 'Request ID is required' }, { status: 400 });
    }

    // Get renewal request
    const requestDoc = await adminDb.collection('renewal_requests').doc(requestId).get();
    if (!requestDoc.exists) {
      return NextResponse.json({ error: 'Renewal request not found' }, { status: 404 });
    }

    const requestData = requestDoc.data()!;

    if (requestData.status !== 'pending') {
      return NextResponse.json({
        error: 'Request has already been processed'
      }, { status: 400 });
    }

    const {
      studentId,
      enrollmentId,
      studentName,
      durationYears,
      totalFee,
      transactionId,
      receiptImageUrl
    } = requestData;

    // Generate payment ID for offline approval with timestamp
    const approvalTimestamp = Date.now();
    const paymentId = generateOfflinePaymentId('renewal');

    // Check idempotency (unlikely with this paymentId but good for safety if transactionId was used)
    const isProcessed = await PaymentTransactionService.isPaymentProcessed(paymentId);
    if (isProcessed) {
      return NextResponse.json({
        error: 'This payment has already been processed'
      }, { status: 400 });
    }

    console.log('🔄 Processing offline renewal approval (V2)');
    console.log('📊 Renewal details:', {
      studentId,
      enrollmentId,
      durationYears,
      totalFee,
      paymentId
    });

    // Fetch dynamic deadline config
    const deadlineConfig = await getDeadlineConfig();

    // Start atomic transaction
    const studentRef = adminDb.collection('students').doc(studentId);
    const requestRef = adminDb.collection('renewal_requests').doc(requestId);

    let newValidUntil: Date = new Date(); // Will be properly set in transaction
    let finalDurationYears: number = durationYears; // Will be updated to cumulative in transaction
    let previousValidUntilISO: string | null = null;
    let existingSessionEndYear: number = new Date().getFullYear();
    let existingDurationYears: number = 0;
    let savedStudentData: any = null;

    try {
      await adminDb.runTransaction(async (transaction: any) => {
        const studentDoc = await transaction.get(studentRef);

        if (!studentDoc.exists) {
          throw new Error('Student document not found');
        }

        const studentData = studentDoc.data();
        savedStudentData = studentData;

        // Get existing values
        const existingSessionStartYear = studentData?.sessionStartYear || new Date().getFullYear();
        existingDurationYears = studentData?.durationYears || 0;
        const existingValidUntil = studentData?.validUntil;
        existingSessionEndYear = studentData?.sessionEndYear || new Date().getFullYear();
        previousValidUntilISO = existingValidUntil ? (existingValidUntil.toDate ? existingValidUntil.toDate().toISOString() : new Date(existingValidUntil).toISOString()) : null;

        // Calculate new validity from existing or current date
        let baseYear = new Date().getFullYear();
        const now = new Date();

        if (existingValidUntil) {
          // If there's existing validity, check if it's still valid
          const existingDate = existingValidUntil.toDate ? existingValidUntil.toDate() : new Date(existingValidUntil);
          if (existingDate > now) {
            // Still valid, extend from existing session end year
            baseYear = existingSessionEndYear;
          }
        }

        // Calculate new validity date using dynamic config
        newValidUntil = calculateValidUntilDate(baseYear, durationYears, deadlineConfig);
        const newSessionEndYear = baseYear + durationYears;

        // Calculate cumulative duration (existing + new)
        const totalDurationYears = existingDurationYears + durationYears;
        finalDurationYears = totalDurationYears; // Store for use outside transaction

        console.log('📝 Updating student document with:', {
          validUntil: newValidUntil.toISOString(),
          sessionEndYear: newSessionEndYear,
          totalDurationYears,
          paymentAmount: totalFee
        });

        // Compute block dates from the new validUntil date
        const blockDates = computeBlockDatesFromValidUntil(newValidUntil, deadlineConfig);

        // Update student document atomically with ALL required fields
        transaction.update(studentRef, {
          validUntil: newValidUntil,
          status: 'active', // Always set to active (even if was expired)
          sessionStartYear: existingSessionStartYear, // Keep original start year
          sessionEndYear: newSessionEndYear, // Based on new validity
          durationYears: totalDurationYears, // Cumulative duration
          paymentAmount: totalFee,
          // CRITICAL: Update block dates to align with new validUntil
          softBlock: blockDates.softBlock,
          hardBlock: blockDates.hardBlock,
          lastRenewalDate: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });

        // Update renewal request status
        transaction.update(requestRef, {
          status: 'approved',
          approvedBy: approverUserId,
          approverName: approverData.fullName,
          approverRole: approverData.role,
          approvedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      });

      // Save transaction record to JSON file (outside Firestore transaction)
      const transactionRecord = {
        studentId: enrollmentId, // Using enrollmentId as studentId for consistency
        studentName,
        studentEmail: requestData.studentEmail || 'N/A',
        studentPhone: requestData.studentPhone || 'N/A',
        amount: totalFee,
        paymentMethod: 'offline' as const,
        paymentId,
        offlineTransactionId: transactionId || '',
        durationYears,

        // Validity Information
        validUntil: newValidUntil.toISOString(), // Required field
        previousValidUntil: previousValidUntilISO,
        newValidUntil: newValidUntil.toISOString(),
        previousSessionEndYear: existingSessionEndYear,
        newSessionEndYear: newValidUntil.getFullYear(),
        previousDurationYears: existingDurationYears,
        newDurationYears: finalDurationYears,

        userId: studentId, // Store Firestore doc ID for View Details link

        // Approval Information
        approvedBy: {
          name: approverData.fullName || 'Admin',
          userId: approverUserId,
          role: approverData.role as 'admin' | 'moderator',
          empId: approverData.empId || approverData.employeeId || 'N/A',
          email: approverData.email || 'N/A'
        },
        approvedByDisplay: `${approverData.fullName} (${approverData.role})`,

        // request tracking
        renewalRequestId: requestId,

        timestamp: new Date().toISOString(),
        timestampMs: approvalTimestamp,
        approvedAtISO: new Date(approvalTimestamp).toISOString(),

        status: 'completed' as const,
        metadata: {
          source: 'admin_approval' as const,
          calculationMethod: 'recalculated_at_approval_v2',
          wasServiceActive: previousValidUntilISO ? new Date(previousValidUntilISO) > new Date() : false,
          processedAt: new Date().toISOString()
        }
      };

      await PaymentTransactionService.saveTransaction(transactionRecord);

      // Create notification for student (with 1-day expiry)
      const notifExpiryDate = new Date();
      notifExpiryDate.setDate(notifExpiryDate.getDate() + 1);
      notifExpiryDate.setHours(23, 59, 59, 999);

      await adminDb.collection('notifications').add({
        title: '✅ Renewal Request Approved',
        content: `Your offline renewal request for ${durationYears} year(s) has been approved. Your service is now active until ${newValidUntil.toLocaleDateString()}.`,
        sender: {
          userId: approverUserId,
          userName: approverData.fullName,
          userRole: approverData.role
        },
        target: {
          type: 'specific_users',
          specificUserIds: [studentId]
        },
        recipientIds: [studentId],
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: notifExpiryDate.toISOString(),
        isRead: false,
        isDeletedGlobally: false
      });

      // Send Approval Email via Service
      const finalStudentEmail = requestData.studentEmail || savedStudentData?.email;
      if (finalStudentEmail) {
        try {
          const { sendApplicationApprovedNotification } = await import('@/lib/services/admin-email.service');

          console.log(`📧 Notification: Queuing renewal approval email for ${studentName} (${finalStudentEmail})`);

          await sendApplicationApprovedNotification({
            studentName: studentName || 'Student',
            studentEmail: finalStudentEmail,
            // Format existing bus info or fallback
            busNumber: savedStudentData?.busId ? savedStudentData.busId.replace('bus_', 'Bus-') : 'Assigned Bus',
            routeName: 'Service Renewal', // Context specific
            shift: savedStudentData?.shift || 'Assigned Shift',
            validUntil: newValidUntil.toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            })
          });

          console.log(`📧 Approval email sent to ${finalStudentEmail}`);
        } catch (emailError) {
          console.error('❌ Failed to send approval email:', emailError);
          // Non-critical error
        }
      }

      // Log activity
      await adminDb.collection('activity_logs').add({
        action: 'renewal_request_approved',
        performedBy: approverUserId,
        performedByName: approverData.fullName,
        role: approverData.role,
        targetId: studentId,
        targetName: studentName,
        details: {
          requestId,
          durationYears,
          totalFee,
          newValidUntil: newValidUntil.toISOString()
        },
        timestamp: FieldValue.serverTimestamp()
      });

      // Delete receipt image from Cloudinary after successful approval (cleanup)
      if (receiptImageUrl && cloudinary.config().api_key) {
        try {
          console.log('\n🗑️ CLEANING UP PAYMENT PROOF FROM CLOUDINARY (post-approval)');
          const url = new URL(receiptImageUrl);
          const pathParts = url.pathname.split('/');

          // Find the part after 'upload' to get the full path
          const uploadIndex = pathParts.findIndex(part => part === 'upload');
          if (uploadIndex !== -1) {
            const afterUpload = pathParts.slice(uploadIndex + 1);
            const fileName = afterUpload[afterUpload.length - 1];

            if (fileName) {
              const publicIdParts = afterUpload.filter(part => !part.startsWith('v') || isNaN(Number(part.substring(1))));
              const lastPart = publicIdParts[publicIdParts.length - 1];
              const nameWithoutExtension = lastPart.split('.').slice(0, -1).join('.');
              publicIdParts[publicIdParts.length - 1] = nameWithoutExtension;
              const publicId = publicIdParts.join('/');

              await cloudinary.uploader.destroy(publicId);
              console.log(`✅ Deleted payment proof from Cloudinary: ${publicId}`);
            }
          }
        } catch (cloudinaryError) {
          console.error('⚠️ Error deleting payment proof from Cloudinary (non-fatal):', cloudinaryError);
          // Don't fail approval if cleanup fails
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Renewal request approved successfully',
        validUntil: newValidUntil.toISOString()
      });

    } catch (error) {
      console.error('Transaction failed:', error);

      // Mark transaction as pending for manual reconciliation
      await PaymentTransactionService.markTransactionPending(paymentId);

      return NextResponse.json({
        error: 'Failed to process renewal approval'
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Renewal approval error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}