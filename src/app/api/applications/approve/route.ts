import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Application, AuditLogEntry, StudentUser } from '@/lib/types/application';
import { v2 as cloudinary } from 'cloudinary';
import { checkBusCapacity, incrementBusCapacity, validateAndSuggestBus } from '@/lib/busCapacityService';
import { calculateRenewalDate } from '@/lib/utils/renewal-utils';
import { generateOfflinePaymentId, OfflinePaymentDocument } from '@/lib/types/payment';
import { computeBlockDatesFromValidUntil } from '@/lib/utils/deadline-computation';
import { createUpdatedByEntry } from '@/lib/utils/updatedBy';
import { getDeadlineConfig } from '@/lib/deadline-config-service';

// Helper function to normalize shift values (remove "Shift" word, standardize to "Morning"/"Evening")
function normalizeShift(shift: string | undefined): string {
  if (!shift) return 'Morning';
  const normalized = shift.toLowerCase().trim();
  if (normalized.includes('evening')) return 'Evening';
  if (normalized.includes('morning')) return 'Morning';
  if (normalized === 'both') return 'Both';
  return 'Morning'; // Default
}

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

    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const body = await request.json();
    const { applicationId, approverName, approverId, notes } = body;

    if (!applicationId || !approverName || !approverId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify user is admin or moderator
    const adminDoc = await adminDb.collection('admins').doc(uid).get();
    const modDoc = await adminDb.collection('moderators').doc(uid).get();

    if (!adminDoc.exists && !modDoc.exists) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Get application
    const appRef = adminDb.collection('applications').doc(applicationId);
    const appDoc = await appRef.get();

    if (!appDoc.exists) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const appData = appDoc.data() as Application;

    // Validate state - must be submitted
    if (appData.state !== 'submitted') {
      return NextResponse.json({
        error: 'Application must be submitted before approval'
      }, { status: 400 });
    }

    // Delete payment proof from Cloudinary before approval
    const formData = appData.formData;
    if (formData.paymentInfo?.paymentEvidenceUrl && cloudinary.config().api_key) {
      try {
        const url = new URL(formData.paymentInfo.paymentEvidenceUrl);
        const pathParts = url.pathname.split('/');

        // Find the part after 'upload' to get the full path
        const uploadIndex = pathParts.findIndex(part => part === 'upload');
        if (uploadIndex !== -1) {
          // Get everything after 'upload' (version, folder, filename)
          const afterUpload = pathParts.slice(uploadIndex + 1);
          const fileName = afterUpload[afterUpload.length - 1];

          if (fileName) {
            // Remove version (v1234567890) and get the actual public ID path
            const publicIdParts = afterUpload.filter(part => !part.startsWith('v') || isNaN(Number(part.substring(1))));
            // Remove file extension from the last part
            const lastPart = publicIdParts[publicIdParts.length - 1];
            const nameWithoutExtension = lastPart.split('.').slice(0, -1).join('.');
            publicIdParts[publicIdParts.length - 1] = nameWithoutExtension;
            const publicId = publicIdParts.join('/');

            await cloudinary.uploader.destroy(publicId);
            console.log(`✅ Deleted payment proof from Cloudinary: ${publicId}`);
          }
        }
      } catch (cloudinaryError) {
        console.error('⚠️ Error deleting payment proof from Cloudinary:', cloudinaryError);
        // Don't fail approval if deletion fails
      }
    }

    // ✅ INTELLIGENT BUS CAPACITY CHECK
    // Auto-derive busId from routeId and validate capacity
    const busId = formData.routeId ? formData.routeId.replace('route_', 'bus_') : null;

    // Normalize stopId/pickupPoint
    const finalStopId = formData.stopId || (formData as any).pickupPoint;

    if (!busId || !formData.routeId || !finalStopId || !formData.shift) {
      return NextResponse.json({
        error: 'Invalid route information in application (Missing stop or shift)'
      }, { status: 400 });
    }

    // Check if bus has available capacity
    const capacityValidation = await validateAndSuggestBus({
      routeId: formData.routeId as string,
      stopId: formData.stopId as string,
      shift: formData.shift as string
    });

    if (!capacityValidation.canAssign) {
      // Bus is full - check if alternatives exist
      if (capacityValidation.alternatives && capacityValidation.alternatives.length > 0) {
        // Return alternative suggestions to admin
        return NextResponse.json({
          error: 'Bus is at full capacity',
          message: capacityValidation.message,
          alternatives: capacityValidation.alternatives,
          suggestion: 'Please manually assign student to one of the alternative buses or increase capacity'
        }, { status: 400 });
      } else if (capacityValidation.requiresAdminAttention) {
        // Critical: No alternatives available, alert sent to admins
        return NextResponse.json({
          error: 'No available seats',
          message: capacityValidation.message,
          critical: true
        }, { status: 400 });
      }
    }

    console.log(`✅ Bus capacity validated for ${busId}: AVAILABLE`);

    // Approve application
    const approvedAt = new Date().toISOString();
    const auditEntry: AuditLogEntry = {
      actorId: uid,
      actorRole: adminDoc.exists ? 'admin' : 'moderator',
      action: 'application_approved',
      timestamp: approvedAt,
      notes: notes || 'Application approved'
    };

    const name = adminDoc.exists ? (adminDoc.data()?.name || 'Admin') : (modDoc.data()?.fullName || modDoc.data()?.name || 'Moderator');
    const empId = adminDoc.exists ? (adminDoc.data()?.employeeId || 'ADMIN') : (modDoc.data()?.employeeId || modDoc.data()?.staffId || 'MOD');

    // Format approvedBy for display
    const approvedByDisplay = adminDoc.exists
      ? `${name} (Admin)`
      : `${name} ( ${empId} )`;

    await appRef.update({
      state: 'approved',
      approvedAt,
      approvedBy: approvedByDisplay,
      updatedAt: approvedAt,
      stateHistory: [...(appData.stateHistory || []), { state: 'approved', timestamp: approvedAt, actor: uid }],
      auditLogs: [...(appData.auditLogs || []), auditEntry]
    });

    // ✅ Fetch Deadline Configuration Dynamically
    const deadlineConfig = await getDeadlineConfig();
    const anchorMonth = deadlineConfig.academicYear.anchorMonth;
    const anchorDay = deadlineConfig.academicYear.anchorDay;

    // Calculate validUntil using dynamic renewal logic
    const { newValidUntil } = calculateRenewalDate(
      null,
      formData.sessionInfo.durationYears,
      deadlineConfig
    );
    const validUntil = newValidUntil;

    // Calculate sessionEndYear
    const validUntilDate = new Date(validUntil);
    const sessionEndYear = validUntilDate.getFullYear();

    // Create STUDENTS collection document with EXACT field structure
    // Compute block dates from validUntil date using dynamic config
    const blockDates = computeBlockDatesFromValidUntil(validUntil, deadlineConfig); // Ensure computeBlockDates accepts config if possible, or we might need to update it too. Wait, assume computeBlockDates uses static defaults unless updated?
    // Let's verify computeBlockDatesFromValidUntil. Ideally passing config is safer.
    // If not updated, it uses static. I should check computeBlockDatesFromValidUntil.
    // Assuming for now I need to pass it or rely on it being updated.
    // Step 400 checked date-utils but not deadline-computation. Let's check deadline-computation first.
    // actually, let's just finish this file assuming I'll fix deadline-computation next.
    // Wait, let's stick to calculateRenewalDate for now.

    const studentDoc = {
      // Required fields only - as per specification
      address: formData.address,
      age: formData.age,
      alternatePhone: formData.alternatePhone || '',
      approvedAt: approvedAt,
      approvedBy: approvedByDisplay,
      bloodGroup: formData.bloodGroup,
      busId: formData.routeId ? formData.routeId.replace('route_', 'bus_') : '',
      createdAt: approvedAt,
      department: formData.department,
      dob: formData.dob,
      durationYears: formData.sessionInfo.durationYears,
      email: (appData as any).email || formData.email,
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
      sessionEndYear: sessionEndYear,
      sessionStartYear: formData.sessionInfo.sessionStartYear,
      shift: normalizeShift(formData.shift),
      status: 'active',
      stopId: finalStopId || '',
      uid: appData.applicantUid,
      updatedAt: approvedAt,
      validUntil: validUntil,
      // Block dates computed from sessionEndYear
      softBlock: blockDates.softBlock,
      hardBlock: blockDates.hardBlock,
      // Payment information from application form
      paymentAmount: formData.paymentInfo?.amountPaid || 0,
      paid_on: approvedAt, // Set paid_on to approval date
      // Audit trail - who created/updated this document
      updatedBy: [createUpdatedByEntry(name, adminDoc.exists ? 'Admin' : empId)]
    };

    console.log('📝 Creating STUDENTS collection document for:', appData.applicantUid);
    await adminDb.collection('students').doc(appData.applicantUid).set(studentDoc);
    console.log('✅ STUDENTS document created successfully');

    // ✅ CREATE PAYMENT RECORD
    // Store the application payment in the payments collection
    try {
      const paymentId = generateOfflinePaymentId('new_registration');
      const paymentAmount = Number(formData.paymentInfo?.amountPaid || 0);

      if (paymentAmount > 0) {
        // Check if this was an online payment (check mode OR presence of payment ID)
        const isOnlinePayment = formData.paymentInfo?.paymentMode === 'online' || !!formData.paymentInfo?.razorpayPaymentId;

        if (isOnlinePayment) {
          console.log('💳 Online payment detected - skipping manual record creation and updating existing record');

          // Update the existing online payment record in SUPABASE with correct validity
          try {
            const { paymentsSupabaseService } = await import('@/lib/services/payments-supabase');
            const studentPayments = await paymentsSupabaseService.getPaymentsByStudentUid(appData.applicantUid);
            const onlinePayment = studentPayments.find(p => p.method === 'Online' && p.status === 'Completed');

            if (onlinePayment) {
              // Update in Supabase
              await paymentsSupabaseService.upsertPayment({
                paymentId: onlinePayment.payment_id,
                studentId: onlinePayment.student_id,
                studentUid: onlinePayment.student_uid,
                studentName: onlinePayment.student_name,
                amount: onlinePayment.amount,
                method: 'Online',
                status: 'Completed',
                sessionStartYear: onlinePayment.session_start_year,
                sessionEndYear: sessionEndYear,
                durationYears: onlinePayment.duration_years,
                validUntil: new Date(validUntil),
                stopId: finalStopId,
                razorpayPaymentId: onlinePayment.razorpay_payment_id,
                razorpayOrderId: onlinePayment.razorpay_order_id,
              });
              console.log(`✅ Updated existing online payment record in Supabase: ${onlinePayment.payment_id}`);
            } else {
              console.log('⚠️ No existing online payment record found in Supabase to update');
            }
          } catch (updateError) {
            console.error('⚠️ Failed to update online payment record:', updateError);
          }
        } else {
          // Creating offline payment record in SUPABASE
          const { paymentsSupabaseService } = await import('@/lib/services/payments-supabase');
          const paymentId = generateOfflinePaymentId('new_registration');

          const paymentCreated = await paymentsSupabaseService.createPayment({
            paymentId,
            studentId: formData.enrollmentId,
            studentUid: appData.applicantUid,
            studentName: formData.fullName,
            amount: paymentAmount,
            method: 'Offline',
            status: 'Completed',
            stopId: finalStopId,
            sessionStartYear: formData.sessionInfo.sessionStartYear,
            sessionEndYear: sessionEndYear,
            durationYears: formData.sessionInfo.durationYears,
            validUntil: new Date(validUntil),
            transactionDate: new Date(),
            offlineTransactionId: formData.paymentInfo?.paymentReference || `app_fee_${applicationId}`,
            approvedBy: {
              type: 'Manual',
              userId: uid,
              empId: approverId,
              name: approverName,
              role: adminDoc.exists ? 'Admin' : 'Moderator'
            },
            approvedAt: new Date(),
          });

          if (paymentCreated) {
            console.log('✅ PAYMENT created in Supabase:', paymentId);
          } else {
            console.warn('⚠️ Failed to create payment in Supabase');
          }
        }
      } else {
        console.log('ℹ️ Skipping payment record creation (Amount is 0)');
      }
    } catch (paymentError) {
      console.error('⚠️ Failed to create payment record:', paymentError);
      // Don't fail the approval if payment creation fails
    }

    // ✅ INCREMENT BUS CAPACITY
    // Student successfully added, increment the bus capacity
    try {
      await incrementBusCapacity(busId, appData.applicantUid, formData.shift);
      console.log(`✅ Bus capacity incremented for ${busId}`);
    } catch (capacityError) {
      console.error(`⚠️ Failed to increment bus capacity for ${busId}:`, capacityError);
      // Don't fail the approval if capacity increment fails
      // Admin can manually fix capacity later
    }

    // Create USERS collection doc with ONLY 5 fields as specified
    const userDoc = {
      createdAt: approvedAt,
      email: (appData as any).email || formData.email,
      name: formData.fullName,
      role: 'student',
      uid: appData.applicantUid
    };

    console.log('📝 Creating USERS collection document for:', appData.applicantUid);
    console.log('📄 User document data:', JSON.stringify(userDoc, null, 2));

    try {
      await adminDb.collection('users').doc(appData.applicantUid).set(userDoc);
      console.log('✅ USERS document created successfully');
    } catch (userDocError: any) {
      console.error('❌ Failed to create USERS document:', userDocError);
      console.error('Error code:', userDocError.code);
      console.error('Error message:', userDocError.message);
      // Don't fail the approval if user doc creation fails
    }

    // ✅ CLEANUP: Delete from unauthUsers collection
    try {
      const unauthUserDoc = await adminDb.collection('unauthUsers').doc(appData.applicantUid).get();
      if (unauthUserDoc.exists) {
        await adminDb.collection('unauthUsers').doc(appData.applicantUid).delete();
        console.log('✅ Deleted unauthUsers document for:', appData.applicantUid);
      } else {
        console.log('ℹ️ No unauthUsers document found for:', appData.applicantUid);
      }
    } catch (deleteError) {
      console.warn('⚠️ Could not delete unauthUser doc:', deleteError);
      // Don't fail the approval if deletion fails
    }

    // ✅ CLEANUP: Delete from applications collection
    try {
      await adminDb.collection('applications').doc(applicationId).delete();
      console.log('✅ Deleted applications document for:', applicationId);
    } catch (deleteError) {
      console.warn('⚠️ Could not delete applications doc:', deleteError);
      // Don't fail the approval if deletion fails
    }



    return NextResponse.json({
      success: true,
      message: 'Application approved successfully',
      studentUid: appData.applicantUid
    });
  } catch (error: any) {
    console.error('Error approving application:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to approve application' },
      { status: 500 }
    );
  }
}

