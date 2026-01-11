import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
// Import the actual Cloudinary library - server-side only
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET && process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

let adminApp: any;
let auth: any;
let db: any;
let useAdminSDK = false;

// Try to initialize Firebase Admin SDK
try {
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    if (!getApps().length) {
      // Fix private key parsing issue
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
      adminApp = initializeApp({
        credential: require('firebase-admin').cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
    } else {
      adminApp = getApps()[0];
    }

    auth = getAuth(adminApp);
    db = getFirestore(adminApp);
    useAdminSDK = true;
  }
} catch (error) {
  console.log('Failed to initialize Firebase Admin SDK, falling back to client SDK:', error);
  useAdminSDK = false;
}

export async function POST(request: Request) {
  try {
    const { idToken, requestId, action } = await request.json();

    // Validate required input
    if (!idToken || !requestId || !action) {
      return new Response(JSON.stringify({
        success: false,
        error: 'ID token, request ID, and action are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action !== 'approve' && action !== 'reject') {
      return new Response(JSON.stringify({
        success: false,
        error: 'Action must be either "approve" or "reject"'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (useAdminSDK && auth && db) {
      try {
        // Verify the driver token
        const decodedToken = await auth.verifyIdToken(idToken);
        const driverUid = decodedToken.uid;

        // Check if the requester is a driver
        const userDoc = await db.collection('users').doc(driverUid).get();
        if (!userDoc.exists) {
          return new Response(JSON.stringify({
            success: false,
            error: 'User not found'
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const userData = userDoc.data();
        if (userData.role !== 'driver') {
          return new Response(JSON.stringify({
            success: false,
            error: 'Unauthorized: Only drivers can approve/reject profile updates'
          }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Get the profile update request
        const requestDoc = await db.collection('profile_update_requests').doc(requestId).get();
        if (!requestDoc.exists) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Profile update request not found'
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const requestData = requestDoc.data();

        // Check if this driver is assigned to the student's bus
        const studentDoc = await db.collection('students').doc(requestData.studentUid).get();
        if (!studentDoc.exists) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Student not found'
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const studentData = studentDoc.data();
        let isAuthorized = false;

        // Check if driver is assigned to student's bus
        if (studentData.assignedBusId) {
          const busDoc = await db.collection('buses').doc(studentData.assignedBusId).get();
          if (busDoc.exists) {
            const busData = busDoc.data();
            if (busData.assignedDriverId === driverUid || busData.driverUID === driverUid) {
              isAuthorized = true;
            }
          }
        }

        // Also check if driver is assigned to any bus that has this student
        if (!isAuthorized) {
          const busesSnapshot = await db.collection('buses')
            .where('assignedDriverId', '==', driverUid)
            .get();

          for (const busDoc of busesSnapshot.docs) {
            const busStudentsSnapshot = await db.collection('students')
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
          return new Response(JSON.stringify({
            success: false,
            error: 'Unauthorized: You are not assigned to this student\'s bus'
          }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        if (action === 'approve') {
          // Delete the old profile photo from Cloudinary if it exists
          if (requestData.currentImageUrl && requestData.currentImageUrl.includes('cloudinary') && cloudinary.config().api_key) {
            try {
              // Extract public ID from Cloudinary URL more robustly
              const url = new URL(requestData.currentImageUrl);
              const pathParts = url.pathname.split('/');
              // Find the index of 'upload' in the path
              const uploadIndex = pathParts.indexOf('upload');
              if (uploadIndex !== -1 && pathParts.length > uploadIndex + 2) {
                // Get everything after the version number (e.g., v1234567890)
                // Format: /upload/v1234567890/folder/filename.ext
                const relevantParts = pathParts.slice(uploadIndex + 2); // Skip 'upload' and version
                const fullPath = relevantParts.join('/');
                // Remove file extension
                const publicId = fullPath.replace(/\.[^/.]+$/, '');

                if (publicId) {
                  // Delete from Cloudinary
                  const result = await cloudinary.uploader.destroy(publicId);
                  console.log(`Cloudinary deletion result for old image (${publicId}):`, result);
                }
              }
            } catch (cloudinaryError) {
              console.error('Error deleting old profile photo from Cloudinary:', cloudinaryError);
              // Continue even if deletion fails
            }
          }

          // Update student's profile image
          await db.collection('students').doc(requestData.studentUid).update({
            profilePhotoUrl: requestData.newImageUrl,
            fullName: requestData.newName,
            pendingProfileUpdate: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp()
          });

          // Update the request status
          await db.collection('profile_update_requests').doc(requestId).update({
            status: 'approved',
            approvedAt: FieldValue.serverTimestamp(),
            approvedBy: driverUid,
            updatedAt: FieldValue.serverTimestamp()
          });

          console.log(`Profile update approved for student ${requestData.studentUid}: ${requestId}`);

          return new Response(JSON.stringify({
            success: true,
            message: 'Profile update approved successfully'
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } else {
          // Delete the new profile photo from Cloudinary since it's being rejected
          if (requestData.newImageUrl && requestData.newImageUrl.includes('cloudinary') && cloudinary.config().api_key) {
            try {
              // Extract public ID from Cloudinary URL more robustly
              const url = new URL(requestData.newImageUrl);
              const pathParts = url.pathname.split('/');
              // Find the index of 'upload' in the path
              const uploadIndex = pathParts.indexOf('upload');
              if (uploadIndex !== -1 && pathParts.length > uploadIndex + 2) {
                // Get everything after the version number (e.g., v1234567890)
                // Format: /upload/v1234567890/folder/filename.ext
                const relevantParts = pathParts.slice(uploadIndex + 2); // Skip 'upload' and version
                const fullPath = relevantParts.join('/');
                // Remove file extension
                const publicId = fullPath.replace(/\.[^/.]+$/, '');

                if (publicId) {
                  // Delete from Cloudinary
                  const result = await cloudinary.uploader.destroy(publicId);
                  console.log(`Cloudinary deletion result for rejected image (${publicId}):`, result);
                }
              }
            } catch (cloudinaryError) {
              console.error('Error deleting rejected profile photo from Cloudinary:', cloudinaryError);
              // Continue even if deletion fails
            }
          }

          // Reject the request
          await db.collection('students').doc(requestData.studentUid).update({
            pendingProfileUpdate: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp()
          });

          // Update the request status
          await db.collection('profile_update_requests').doc(requestId).update({
            status: 'rejected',
            rejectedAt: FieldValue.serverTimestamp(),
            rejectedBy: driverUid,
            rejectionReason: 'Driver rejected the request',
            updatedAt: FieldValue.serverTimestamp()
          });

          console.log(`Profile update rejected for student ${requestData.studentUid}: ${requestId}`);

          return new Response(JSON.stringify({
            success: true,
            message: 'Profile update request rejected'
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      } catch (adminError: any) {
        console.error('Error with Admin SDK:', adminError);
        return new Response(JSON.stringify({
          success: false,
          error: adminError.message || 'Failed to process profile update request'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else {
      return new Response(JSON.stringify({
        success: false,
        error: 'Admin SDK not available'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error: any) {
    console.error('Error processing profile update request:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to process profile update request'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}