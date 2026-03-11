import { NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { v2 as cloudinary } from 'cloudinary';
import { withSecurity } from '@/lib/security/api-security';
import { HandleProfileUpdateSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

// Configure Cloudinary
if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET && process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/**
 * POST /api/driver/handle-profile-update
 * 
 * Approves or rejects a student's profile update request.
 */
export const POST = withSecurity(
  async (request, { auth, body }) => {
    const { requestId, action } = body as any;
    const driverUid = auth.uid;

    // Get the profile update request
    const requestDoc = await adminDb.collection('profile_update_requests').doc(requestId).get();
    if (!requestDoc.exists) {
      return NextResponse.json(
        { error: 'Profile update request not found' },
        { status: 404 }
      );
    }

    const requestData = requestDoc.data();

    // Check if this driver is assigned to the student's bus
    const studentDoc = await adminDb.collection('students').doc(requestData.studentUid).get();
    if (!studentDoc.exists) {
      return NextResponse.json(
        { error: 'Student not found' },
        { status: 404 }
      );
    }

    const studentData = studentDoc.data();
    let isAuthorized = false;

    // Check if driver is assigned to student's bus
    if (studentData.assignedBusId) {
      const busDoc = await adminDb.collection('buses').doc(studentData.assignedBusId).get();
      if (busDoc.exists) {
        const busData = busDoc.data();
        if (busData.assignedDriverId === driverUid || busData.driverUID === driverUid) {
          isAuthorized = true;
        }
      }
    }

    // Also check if driver is assigned to any bus that has this student
    if (!isAuthorized) {
      const busesSnapshot = await adminDb.collection('buses')
        .where('assignedDriverId', '==', driverUid)
        .get();

      for (const busDoc of busesSnapshot.docs) {
        const busStudentsSnapshot = await adminDb.collection('students')
          .where('assignedBusId', '==', busDoc.id)
          .where('uid', '==', requestData.studentUid)
          .get();

        if (!busStudentsSnapshot.empty) {
          isAuthorized = true;
          break;
        }
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized: You are not assigned to this student\'s bus' },
        { status: 403 }
      );
    }

    if (action === 'approve') {
      // Delete the old profile photo from Cloudinary if it exists
      if (requestData.currentImageUrl && requestData.currentImageUrl.includes('cloudinary') && cloudinary.config().api_key) {
        try {
          const url = new URL(requestData.currentImageUrl);
          const pathParts = url.pathname.split('/');
          const uploadIndex = pathParts.indexOf('upload');
          if (uploadIndex !== -1 && pathParts.length > uploadIndex + 2) {
            const relevantParts = pathParts.slice(uploadIndex + 2);
            const fullPath = relevantParts.join('/');
            const publicId = fullPath.replace(/\.[^/.]+$/, '');

            if (publicId) {
              const result = await cloudinary.uploader.destroy(publicId);
              console.log(`Cloudinary deletion result for old image (${publicId}):`, result);
            }
          }
        } catch (cloudinaryError) {
          console.error('Error deleting old profile photo from Cloudinary:', cloudinaryError);
        }
      }

      // Update student's profile image
      await adminDb.collection('students').doc(requestData.studentUid).update({
        profilePhotoUrl: requestData.newImageUrl,
        fullName: requestData.newName,
        pendingProfileUpdate: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      });

      // Update the request status
      await adminDb.collection('profile_update_requests').doc(requestId).update({
        status: 'approved',
        approvedAt: FieldValue.serverTimestamp(),
        approvedBy: driverUid,
        updatedAt: FieldValue.serverTimestamp()
      });

      console.log(`Profile update approved for student ${requestData.studentUid}: ${requestId}`);

      return NextResponse.json({
        success: true,
        message: 'Profile update approved successfully'
      });
    } else {
      // action === 'reject'
      // Delete the new profile photo from Cloudinary since it's being rejected
      if (requestData.newImageUrl && requestData.newImageUrl.includes('cloudinary') && cloudinary.config().api_key) {
        try {
          const url = new URL(requestData.newImageUrl);
          const pathParts = url.pathname.split('/');
          const uploadIndex = pathParts.indexOf('upload');
          if (uploadIndex !== -1 && pathParts.length > uploadIndex + 2) {
            const relevantParts = pathParts.slice(uploadIndex + 2);
            const fullPath = relevantParts.join('/');
            const publicId = fullPath.replace(/\.[^/.]+$/, '');

            if (publicId) {
              const result = await cloudinary.uploader.destroy(publicId);
              console.log(`Cloudinary deletion result for rejected image (${publicId}):`, result);
            }
          }
        } catch (cloudinaryError) {
          console.error('Error deleting rejected profile photo from Cloudinary:', cloudinaryError);
        }
      }

      // Reject the request
      await adminDb.collection('students').doc(requestData.studentUid).update({
        pendingProfileUpdate: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      });

      // Update the request status
      await adminDb.collection('profile_update_requests').doc(requestId).update({
        status: 'rejected',
        rejectedAt: FieldValue.serverTimestamp(),
        rejectedBy: driverUid,
        rejectionReason: 'Driver rejected the request',
        updatedAt: FieldValue.serverTimestamp()
      });

      console.log(`Profile update rejected for student ${requestData.studentUid}: ${requestId}`);

      return NextResponse.json({
        success: true,
        message: 'Profile update request rejected'
      });
    }
  },
  {
    requiredRoles: ['driver'],
    schema: HandleProfileUpdateSchema,
    rateLimit: RateLimits.CREATE,
    allowBodyToken: true
  }
);