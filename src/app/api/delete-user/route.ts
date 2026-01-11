import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
// Import the actual Cloudinary library - server-side only
import { v2 as cloudinary } from 'cloudinary';
import { decrementBusCapacity } from '@/lib/busCapacityService';

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

export async function DELETE(request: Request) {
  try {
    const { uid, idToken } = await request.json();

    // Validate required input
    if (!uid) {
      return new Response(JSON.stringify({
        success: false,
        error: 'User ID is required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (useAdminSDK && auth && db) {
      // Use Firebase Admin SDK
      try {
        // First, verify the admin/moderator token
        const decodedToken = await auth.verifyIdToken(idToken);
        const adminUid = decodedToken.uid;

        // Check if the requester is an admin or moderator
        const adminUserDoc = await db.collection('users').doc(adminUid).get();
        if (!adminUserDoc.exists) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Admin user not found'
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const adminUserData = adminUserDoc.data();
        if (adminUserData.role !== 'admin' && adminUserData.role !== 'moderator') {
          return new Response(JSON.stringify({
            success: false,
            error: 'Unauthorized: Only admins and moderators can delete users'
          }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // First, get the user data to check if they have a profile photo
        const userDocRef = db.collection('users').doc(uid);
        const userDoc = await userDocRef.get();

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

        // ✅ PERMISSION CHECK: Moderators cannot delete moderators
        if (adminUserData.role === 'moderator' && userData.role === 'moderator') {
          return new Response(JSON.stringify({
            success: false,
            error: 'Unauthorized: Moderators cannot delete other moderators'
          }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Handle role-specific cleanup
        if (userData.role === 'student') {
          // Get student data
          const studentDocRef = db.collection('students').doc(uid);
          const studentDoc = await studentDocRef.get();

          if (studentDoc.exists) {
            const studentData = studentDoc.data();

            // Delete profile photo from Cloudinary if it exists
            if (studentData.profilePhotoUrl && cloudinary.config().api_key) {
              try {
                const url = new URL(studentData.profilePhotoUrl);
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
                    console.log(`✅ Deleted profile photo from Cloudinary: ${publicId}`);
                  }
                }
              } catch (cloudinaryError) {
                console.error('⚠️ Error deleting profile photo from Cloudinary:', cloudinaryError);
              }
            }

            // Delete FCM tokens for this user
            try {
              const fcmTokensSnapshot = await db.collection('fcm_tokens').where('userUid', '==', uid).get();
              const batch = db.batch();
              fcmTokensSnapshot.docs.forEach((doc: any) => {
                batch.delete(doc.ref);
              });
              await batch.commit();
              console.log(`Deleted ${fcmTokensSnapshot.size} FCM tokens for student ${uid}`);
            } catch (fcmError) {
              console.error('Error deleting FCM tokens:', fcmError);
            }

            // Delete waiting flags for this student
            try {
              const waitingFlagsSnapshot = await db.collection('waiting_flags').where('student_uid', '==', uid).get();
              const batch = db.batch();
              waitingFlagsSnapshot.docs.forEach((doc: any) => {
                batch.delete(doc.ref);
              });
              await batch.commit();
              console.log(`Deleted ${waitingFlagsSnapshot.size} waiting flags for student ${uid}`);
            } catch (flagsError) {
              console.error('Error deleting waiting flags:', flagsError);
            }

            // Delete attendance records for this student
            try {
              const attendanceSnapshot = await db.collection('attendance').where('studentUid', '==', uid).get();
              const batch = db.batch();
              attendanceSnapshot.docs.forEach((doc: any) => {
                batch.delete(doc.ref);
              });
              await batch.commit();
              console.log(`Deleted ${attendanceSnapshot.size} attendance records for student ${uid}`);
            } catch (attendanceError) {
              console.error('Error deleting attendance records:', attendanceError);
            }

            // Delete profile update requests for this student
            try {
              const profileRequestsSnapshot = await db.collection('profile_update_requests').where('studentUid', '==', uid).get();
              const batch = db.batch();
              profileRequestsSnapshot.docs.forEach((doc: any) => {
                batch.delete(doc.ref);
              });
              await batch.commit();
              console.log(`Deleted ${profileRequestsSnapshot.size} profile update requests for student ${uid}`);
            } catch (requestsError) {
              console.error('Error deleting profile update requests:', requestsError);
            }

            // Decrement bus capacity if student was assigned to a bus
            const busId = studentData.busId || studentData.currentBusId || studentData.assignedBusId || null;
            if (busId) {
              try {
                await decrementBusCapacity(busId, uid, studentData.shift);
                console.log(`✅ Decremented bus capacity for bus ${busId} (student: ${uid})`);
              } catch (busError) {
                console.error(`⚠️ Error decrementing bus capacity for bus ${busId}:`, busError);
                // Continue with deletion even if bus capacity update fails
              }
            }

            // Delete student document from Firestore
            await studentDocRef.delete();
          }
        } else if (userData.role === 'driver') {
          // Delete driver-related data
          try {
            const driverDocRef = db.collection('drivers').doc(uid);
            const driverDoc = await driverDocRef.get();

            if (driverDoc.exists) {
              const driverData = driverDoc.data();

              // Delete profile photo from Cloudinary if it exists
              if (driverData.profilePhotoUrl && cloudinary.config().api_key) {
                try {
                  const url = new URL(driverData.profilePhotoUrl);
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
                      console.log(`✅ Deleted profile photo from Cloudinary: ${publicId}`);
                    }
                  }
                } catch (cloudinaryError) {
                  console.error('⚠️ Error deleting profile photo from Cloudinary:', cloudinaryError);
                }
              }

              // Delete driver document
              await driverDocRef.delete();
            }
          } catch (driverError) {
            console.error('Error deleting driver data:', driverError);
          }
        } else if (userData.role === 'moderator') {
          // Delete moderator-related data
          try {
            const moderatorDocRef = db.collection('moderators').doc(uid);
            const moderatorDoc = await moderatorDocRef.get();

            if (moderatorDoc.exists) {
              const moderatorData = moderatorDoc.data();

              // Delete profile photo from Cloudinary if it exists
              if (moderatorData.profilePhotoUrl && cloudinary.config().api_key) {
                try {
                  const url = new URL(moderatorData.profilePhotoUrl);
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
                      console.log(`✅ Deleted profile photo from Cloudinary: ${publicId}`);
                    }
                  }
                } catch (cloudinaryError) {
                  console.error('⚠️ Error deleting profile photo from Cloudinary:', cloudinaryError);
                }
              }

              // Delete moderator document
              await moderatorDocRef.delete();
            }
          } catch (moderatorError) {
            console.error('Error deleting moderator data:', moderatorError);
          }
        }

        // Delete user from Firebase Authentication with enhanced Google account handling
        try {
          // First, get the user record to check for Google provider
          const userRecord = await auth.getUser(uid);
          const hasGoogleProvider = userRecord.providerData.some((provider: any) => provider.providerId === 'google.com');

          if (hasGoogleProvider) {
            console.log(`User ${uid} has Google provider - performing enhanced deletion`);

            // Disconnect Google provider before deletion
            try {
              await auth.updateUser(uid, {
                providerToDelete: 'google.com'
              });
              console.log(`Successfully disconnected Google provider for user:`, uid);
            } catch (disconnectError: any) {
              console.log(`Could not disconnect Google provider (user may not have Google linked):`, disconnectError.message);
            }
          }

          // Delete the user from Firebase Authentication
          await auth.deleteUser(uid);
          console.log(`Successfully deleted Firebase Auth user ${uid}`);

          // Log additional information for audit
          if (hasGoogleProvider) {
            console.log(`User ${uid} was deleted with Google account disconnection`);
          }

        } catch (authError) {
          console.error('Error deleting Firebase Auth user:', authError);
          // Continue even if Firebase Auth deletion fails
        }

        // Delete user document from Firestore
        await userDocRef.delete();

        console.log(`Successfully deleted user ${uid} and all associated data`);

        return new Response(JSON.stringify({
          success: true,
          message: 'User and all associated data deleted successfully'
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (adminError: any) {
        console.error('Error with Admin SDK:', adminError);
        return new Response(JSON.stringify({
          success: false,
          error: adminError.message || 'Failed to delete user with admin SDK'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else {
      return new Response(JSON.stringify({
        success: false,
        error: 'Admin SDK not available for user deletion'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error: any) {
    console.error('Error deleting user:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to delete user'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}