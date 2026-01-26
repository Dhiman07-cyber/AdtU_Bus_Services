import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { v2 as cloudinary } from 'cloudinary';
import nodemailer from 'nodemailer';

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
    const { requestId, rejectorName, rejectorId, reason } = body;

    if (!requestId || !rejectorName || !rejectorId || !reason) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify user is admin or moderator
    const adminDoc = await adminDb.collection('admins').doc(uid).get();
    const modDoc = await adminDb.collection('moderators').doc(uid).get();

    if (!adminDoc.exists && !modDoc.exists) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Get renewal request
    const requestRef = adminDb.collection('renewal_requests').doc(requestId);
    const requestDoc = await requestRef.get();

    if (!requestDoc.exists) {
      return NextResponse.json({ error: 'Renewal request not found' }, { status: 404 });
    }

    const requestData = requestDoc.data();

    // Validate status - must be pending
    if (requestData?.status !== 'pending') {
      return NextResponse.json({
        error: 'Renewal request must be pending'
      }, { status: 400 });
    }

    const studentId = requestData?.studentId;
    const durationYears = requestData?.durationYears;

    if (!studentId) {
      return NextResponse.json({ error: 'Student ID not found in request' }, { status: 400 });
    }

    console.log('\n🚫 REJECTING RENEWAL REQUEST');
    console.log('Request ID:', requestId);
    console.log('Student ID:', studentId);
    console.log('Reason:', reason);

    // Fetch student email if not in request
    let studentEmail = requestData?.studentEmail;
    if (!studentEmail && studentId) {
      try {
        const studentDoc = await adminDb.collection('students').doc(studentId).get();
        if (studentDoc.exists) {
          studentEmail = studentDoc.data()?.email;
        } else {
          // Try searching by enrollmentId if studentId didn't work (fallback)
          const enrollmentId = requestData?.enrollmentId;
          if (enrollmentId) {
            const studentsQuery = await adminDb.collection('students').where('enrollmentId', '==', enrollmentId).limit(1).get();
            if (!studentsQuery.empty) {
              studentEmail = studentsQuery.docs[0].data()?.email;
            }
          }
        }
      } catch (err) {
        console.error('Error fetching student email:', err);
      }
    }

    // Send Rejection Email via Service
    if (studentEmail) {
      try {
        const { sendApplicationRejectedNotification } = await import('@/lib/services/admin-email.service');

        console.log(`📧 Notification: Queuing renewal rejection email for ${requestData?.studentName} (${studentEmail})`);

        await sendApplicationRejectedNotification({
          studentName: requestData?.studentName || 'Student',
          studentEmail: studentEmail,
          reason: reason,
          rejectedBy: rejectorName || 'Administrator'
        });

        console.log(`📧 Rejection email sent to ${studentEmail}`);
      } catch (emailError) {
        console.error('❌ Failed to send rejection email:', emailError);
        // Continue with deletion even if email fails
      }
    } else {
      console.warn('⚠️ Student email not found. Notification skipped.');
    }

    // Delete payment proof image from Cloudinary (if exists)
    const receiptImageUrl = requestData?.receiptImageUrl;
    if (receiptImageUrl && cloudinary.config().api_key) {
      try {
        console.log('\n🗑️ DELETING PAYMENT PROOF FROM CLOUDINARY');
        const url = new URL(receiptImageUrl);
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
        // Don't fail rejection if deletion fails
      }
    }

    // Delete renewal request document (cleanup after rejection)
    console.log('\n🗑️ Deleting renewal request document from Firestore');
    await requestRef.delete();
    console.log('✅ Renewal request document deleted');

    return NextResponse.json({
      success: true,
      message: 'Renewal request rejected successfully'
    });

  } catch (error: any) {
    console.error('Error rejecting renewal request:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reject renewal request' },
      { status: 500 }
    );
  }
}