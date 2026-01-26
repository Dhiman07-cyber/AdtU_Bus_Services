import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { v2 as cloudinary } from 'cloudinary';
import { calculateRenewalDate } from '@/lib/utils/renewal-utils';
import { incrementBusCapacity } from '@/lib/busCapacityService';
import { generateOfflinePaymentId, OfflinePaymentDocument } from '@/lib/types/payment';
import { computeBlockDatesFromValidUntil } from '@/lib/utils/deadline-computation';
import { sendApplicationApprovedNotification } from '@/lib/services/admin-email.service';

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
    const moderatorUid = decodedToken.uid;
    const moderatorEmail = decodedToken.email;

    const body = await request.json();
    const { studentUid } = body;

    if (!studentUid) {
      return NextResponse.json({ error: 'Missing student UID' }, { status: 400 });
    }

    // Verify user is admin or moderator
    const moderatorDoc = await adminDb.collection('moderators').doc(moderatorUid).get();
    const adminDoc = await adminDb.collection('admins').doc(moderatorUid).get();

    if (!moderatorDoc.exists && !adminDoc.exists) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const moderatorData = moderatorDoc.exists ? moderatorDoc.data() : adminDoc.data();

    // Construct approvedByDisplay
    const approverName = moderatorData?.name || moderatorData?.fullName || 'Approver';
    const approverEmpId = moderatorData?.employeeId || moderatorData?.staffId || moderatorUid;
    const approvedByDisplay = adminDoc.exists
      ? `${approverName} (Admin)`
      : `${approverName} ( ${approverEmpId} )`;

    // Get application data
    const applicationRef = adminDb.collection('applications').doc(studentUid);
    const applicationDoc = await applicationRef.get();

    if (!applicationDoc.exists) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const appData = applicationDoc.data()!;
    const formData = appData.formData;
    const now = Timestamp.now();
    const nowIso = new Date().toISOString();

    // Create USERS collection doc with ONLY 5 fields as specified
    const userDoc = {
      createdAt: nowIso,
      email: (appData as any).email || formData.email,
      name: formData.fullName,
      role: 'student',
      uid: studentUid
    };

    await adminDb.collection('users').doc(studentUid).set(userDoc);
    console.log('✅ User document created successfully');

    // Calculate validUntil using proper renewal date logic
    // This ensures the date is always in the future, accounting for current date
    const { newValidUntil } = calculateRenewalDate(null, formData.sessionInfo.durationYears);
    const validUntil = newValidUntil;

    // Calculate sessionEndYear from the calculated validUntil
    const validUntilDate = new Date(validUntil);
    const sessionEndYear = validUntilDate.getFullYear();

    // Compute block dates from validUntil date
    const blockDates = computeBlockDatesFromValidUntil(validUntil);

    // Create STUDENTS collection document with EXACT field structure as specified
    const studentDoc = {
      // Required fields only - as per specification
      address: formData.address,
      age: formData.age,
      alternatePhone: formData.alternatePhone || '',
      approvedAt: now,
      approvedBy: approvedByDisplay,
      bloodGroup: formData.bloodGroup,
      busId: formData.routeId ? formData.routeId.replace('route_', 'bus_') : '',
      createdAt: now,
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
      shift: formData.shift || 'both',
      status: 'active',
      stopId: formData.stopId || '',
      uid: studentUid,
      updatedAt: now,
      validUntil: validUntil,
      // Block dates computed from validUntil
      softBlock: blockDates.softBlock,
      hardBlock: blockDates.hardBlock,
      // Payment information from application form
      paymentAmount: formData.paymentInfo?.amountPaid || 0,
      paid_on: now // Set paid_on to approval date
    };

    await adminDb.collection('students').doc(studentUid).set(studentDoc);
    console.log('✅ Student document created successfully');

    // ✅ EMAIL NOTIFICATION: Send approval email to student
    if (studentDoc.email) {
      console.log(`📧 Notification: Queuing approval email for ${studentDoc.fullName} (${studentDoc.email})`);
      const emailResult = await sendApplicationApprovedNotification({
        studentName: studentDoc.fullName,
        studentEmail: studentDoc.email,
        busNumber: studentDoc.busId ? studentDoc.busId.replace('bus_', 'Bus-') : 'Assigned Soon',
        routeName: formData.routeName || `Route ${studentDoc.routeId.replace('route_', '')}`,
        shift: studentDoc.shift,
        validUntil: new Date(studentDoc.validUntil).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        })
      });
      console.log('📧 Notification result:', emailResult);
    }

    // ✅ CREATE PAYMENT RECORD
    // Store the application payment in the payments collection
    try {
      const paymentId = generateOfflinePaymentId('new_registration');
      const paymentAmount = Number(formData.paymentInfo?.amountPaid || 0);

      if (paymentAmount > 0) {
        // Check if this was an online payment
        const isOnlinePayment = formData.paymentInfo?.paymentMode === 'online';

        if (isOnlinePayment) {
          console.log('💳 Online payment detected - skipping manual record creation and updating existing record');

          // Update the existing online payment record in SUPABASE with correct validity
          try {
            const { paymentsSupabaseService } = await import('@/lib/services/payments-supabase');
            const studentPayments = await paymentsSupabaseService.getPaymentsByStudentUid(studentUid);
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
            studentUid: studentUid,
            studentName: formData.fullName,
            amount: paymentAmount,
            method: 'Offline',
            status: 'Completed',
            sessionStartYear: formData.sessionInfo.sessionStartYear,
            sessionEndYear: sessionEndYear,
            durationYears: formData.sessionInfo.durationYears,
            validUntil: new Date(validUntil),
            transactionDate: new Date(),
            offlineTransactionId: formData.paymentInfo?.paymentReference || `unauth_app_fee_${studentUid}`,
            approvedBy: {
              type: 'Manual',
              userId: moderatorUid,
              empId: moderatorData?.employeeId || moderatorUid,
              name: moderatorData?.name || moderatorEmail || 'Approver',
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
      }
    } catch (paymentError) {
      console.error('⚠️ Failed to create payment record:', paymentError);
      // Don't fail approval if payment record creation fails
    }

    // ✅ INCREMENT BUS CAPACITY
    // Get the busId for this student
    const busId = formData.routeId ? formData.routeId.replace('route_', 'bus_') : '';
    if (busId) {
      try {
        await incrementBusCapacity(busId, studentUid, formData.shift);
        console.log(`✅ Bus capacity incremented for ${busId}`);
      } catch (capacityError) {
        console.error(`⚠️ Failed to increment bus capacity for ${busId}:`, capacityError);
        // Don't fail the approval if capacity increment fails
      }
    }

    // ✅ CLEANUP: Delete payment proof from Cloudinary if exists
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


    // ✅ CLEANUP: Delete from applications collection after approval
    await applicationRef.delete();
    console.log('✅ Application document deleted');


    // Delete from unauthUsers collection
    try {
      const unauthUserDoc = await adminDb.collection('unauthUsers').doc(studentUid).get();
      if (unauthUserDoc.exists) {
        await adminDb.collection('unauthUsers').doc(studentUid).delete();
        console.log('✅ Deleted unauthUsers document for:', studentUid);
      } else {
        console.log('ℹ️ No unauthUsers document found for:', studentUid);
      }
    } catch (deleteError) {
      console.warn('⚠️ Could not delete unauthUser doc:', deleteError);
      // Don't fail the approval if deletion fails
    }

    return NextResponse.json({
      success: true,
      message: 'Application approved successfully',
      studentUid: studentUid
    });
  } catch (error: any) {
    console.error('Error approving application:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to approve application' },
      { status: 500 }
    );
  }
}

function extractPublicIdFromUrl(url: string): string | null {
  try {
    // Cloudinary URL format: https://res.cloudinary.com/{cloud_name}/image/upload/{transformations}/{version}/{public_id}.{format}
    const matches = url.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
    return matches ? matches[1] : null;
  } catch (error) {
    return null;
  }
}
