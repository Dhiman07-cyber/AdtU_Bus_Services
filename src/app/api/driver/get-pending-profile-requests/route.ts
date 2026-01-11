import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

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
    const { idToken } = await request.json();

    // Validate required input
    if (!idToken) {
      return new Response(JSON.stringify({
        success: false,
        error: 'ID token is required'
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
            error: 'Unauthorized: Only drivers can fetch profile requests'
          }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Get all buses assigned to this driver
        const busesSnapshot = await db.collection('buses')
          .where('assignedDriverId', '==', driverUid)
          .get();

        const busIds = busesSnapshot.docs.map((doc: any) => doc.id);
        console.log(`Driver ${driverUid} has buses:`, busIds);

        if (busIds.length === 0) {
          console.log('Driver has no assigned buses');
          // Return empty array if driver has no assigned buses
          return new Response(JSON.stringify({
            success: true,
            requests: []
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Query profile_update_requests directly by assignedBusId
        // This is more efficient than going through students collection
        const requests: any[] = [];

        for (const busId of busIds) {
          // Query pending requests for this bus
          const requestsSnapshot = await db.collection('profile_update_requests')
            .where('assignedBusId', '==', busId)
            .where('status', '==', 'pending')
            .get();

          requestsSnapshot.docs.forEach((doc: any) => {
            const data = doc.data();
            requests.push({
              requestId: doc.id,
              ...data,
              createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
              approvedAt: data.approvedAt ? data.approvedAt.toDate().toISOString() : null,
              rejectedAt: data.rejectedAt ? data.rejectedAt.toDate().toISOString() : null
            });
          });
        }

        // Also check for legacy requests without assignedBusId by looking at students
        // This handles older requests OR requests where student didn't have assignedBusId set
        for (const busId of busIds) {
          // Check students with assignedBusId field
          const studentsSnapshot1 = await db.collection('students')
            .where('assignedBusId', '==', busId)
            .get();

          // Also check students with busId field (some records use this)
          const studentsSnapshot2 = await db.collection('students')
            .where('busId', '==', busId)
            .get();

          // Combine both queries, removing duplicates
          const allStudentDocs = [...studentsSnapshot1.docs];
          const existingIds = new Set(allStudentDocs.map((d: any) => d.id));
          for (const doc of studentsSnapshot2.docs) {
            if (!existingIds.has(doc.id)) {
              allStudentDocs.push(doc);
            }
          }

          for (const studentDoc of allStudentDocs) {
            const studentData = studentDoc.data();
            if (studentData.pendingProfileUpdate) {
              // Check if we already have this request
              const existingRequest = requests.find(r => r.requestId === studentData.pendingProfileUpdate);
              if (!existingRequest) {
                // Fetch the request document
                const requestDoc = await db.collection('profile_update_requests')
                  .doc(studentData.pendingProfileUpdate)
                  .get();

                if (requestDoc.exists) {
                  const data = requestDoc.data();
                  if (data.status === 'pending') {
                    requests.push({
                      requestId: requestDoc.id,
                      ...data,
                      // Also update the request with the correct busId for future queries
                      assignedBusId: busId,
                      createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
                      approvedAt: data.approvedAt ? data.approvedAt.toDate().toISOString() : null,
                      rejectedAt: data.rejectedAt ? data.rejectedAt.toDate().toISOString() : null
                    });

                    // Fix the request document to have the correct busId
                    if (!data.assignedBusId) {
                      await db.collection('profile_update_requests').doc(requestDoc.id).update({
                        assignedBusId: busId
                      });
                      console.log(`Fixed assignedBusId for request ${requestDoc.id}`);
                    }
                  }
                }
              }
            }
          }
        }

        // FINAL FALLBACK: Check for ANY pending profile requests with null assignedBusId
        // and see if their student belongs to this driver's bus
        if (requests.length === 0) {
          console.log('No requests found via normal methods, checking orphaned requests...');

          const orphanedRequestsSnapshot = await db.collection('profile_update_requests')
            .where('status', '==', 'pending')
            .get();

          for (const requestDoc of orphanedRequestsSnapshot.docs) {
            const requestData = requestDoc.data();

            // Skip if we already have this request or if it has a valid busId we can't access
            if (requests.find(r => r.requestId === requestDoc.id)) continue;
            if (requestData.assignedBusId && !busIds.includes(requestData.assignedBusId)) continue;

            // Check if the student belongs to one of the driver's buses
            if (requestData.studentUid) {
              const studentDoc = await db.collection('students').doc(requestData.studentUid).get();
              if (studentDoc.exists) {
                const studentData = studentDoc.data();
                const studentBusId = studentData.assignedBusId || studentData.busId;

                console.log(`Checking student ${requestData.studentUid} with busId: ${studentBusId}`);

                if (studentBusId && busIds.includes(studentBusId)) {
                  console.log(`Found orphaned request ${requestDoc.id} for student on bus ${studentBusId}`);

                  requests.push({
                    requestId: requestDoc.id,
                    ...requestData,
                    assignedBusId: studentBusId,
                    createdAt: requestData.createdAt ? requestData.createdAt.toDate().toISOString() : null,
                    approvedAt: requestData.approvedAt ? requestData.approvedAt.toDate().toISOString() : null,
                    rejectedAt: requestData.rejectedAt ? requestData.rejectedAt.toDate().toISOString() : null
                  });

                  // Fix the request document
                  await db.collection('profile_update_requests').doc(requestDoc.id).update({
                    assignedBusId: studentBusId
                  });
                  console.log(`Fixed assignedBusId for orphaned request ${requestDoc.id}`);
                }
              }
            }
          }
        }

        console.log(`Found ${requests.length} pending profile update requests for driver ${driverUid}`);

        return new Response(JSON.stringify({
          success: true,
          requests
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (adminError: any) {
        console.error('Error with Admin SDK:', adminError);
        return new Response(JSON.stringify({
          success: false,
          error: adminError.message || 'Failed to fetch profile requests'
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
    console.error('Error fetching profile requests:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Failed to fetch profile requests'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}