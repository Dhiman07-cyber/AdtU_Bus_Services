import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

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
    const { idToken, newImageUrl, fullName } = await request.json();

    // Validate required input
    if (!idToken || !newImageUrl) {
      return new Response(JSON.stringify({
        success: false,
        error: 'ID token and new image URL are required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (useAdminSDK && auth && db) {
      try {
        // Verify the student token
        const decodedToken = await auth.verifyIdToken(idToken);
        const studentUid = decodedToken.uid;

        // Check if the requester is a student
        const userDoc = await db.collection('users').doc(studentUid).get();
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
        if (userData.role !== 'student') {
          return new Response(JSON.stringify({
            success: false,
            error: 'Unauthorized: Only students can request profile updates'
          }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Get current student data
        const studentDoc = await db.collection('students').doc(studentUid).get();
        if (!studentDoc.exists) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Student record not found'
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const studentData = studentDoc.data();
        const currentImageUrl = studentData.profilePhotoUrl || '';
        const currentName = studentData.fullName || '';
        // Check both possible field names for bus ID
        const assignedBusId = studentData.assignedBusId || studentData.busId || null;

        // Create a profile update request
        const requestId = `profile_update_${studentUid}_${Date.now()}`;
        const requestData = {
          requestId,
          studentUid,
          studentName: userData.name || studentData.fullName,
          currentImageUrl,
          newImageUrl,
          currentName,
          newName: fullName || currentName,
          assignedBusId, // Store the bus ID so drivers can find this request
          status: 'pending',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        };

        // Save the request to Firestore
        await db.collection('profile_update_requests').doc(requestId).set(requestData);

        // Also save to student's document for easy access
        await db.collection('students').doc(studentUid).update({
          pendingProfileUpdate: requestId,
          updatedAt: FieldValue.serverTimestamp()
        });

        console.log(`Profile update request created for student ${studentUid}: ${requestId}`);

        return new Response(JSON.stringify({
          success: true,
          message: 'Profile update request sent to driver for approval',
          requestId
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (adminError: any) {
        console.error('Error with Admin SDK:', adminError);
        return new Response(JSON.stringify({
          success: false,
          error: adminError.message || 'Failed to create profile update request'
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
    console.error('Error creating profile update request:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to create profile update request'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function PUT(request: Request) {
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
        if (studentData.assignedBusId) {
          const busDoc = await db.collection('buses').doc(studentData.assignedBusId).get();
          if (busDoc.exists) {
            const busData = busDoc.data();
            if (busData.assignedDriverId !== driverUid && busData.driverUID !== driverUid) {
              return new Response(JSON.stringify({
                success: false,
                error: 'Unauthorized: You are not assigned to this student\'s bus'
              }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
              });
            }
          }
        }

        if (action === 'approve') {
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