import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

let adminApp: any;
let auth: any;
let db: any;
let useAdminSDK = false;

// Try to initialize Firebase Admin SDK
try {
    if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        if (!getApps().length) {
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
    console.log('Failed to initialize Firebase Admin SDK:', error);
    useAdminSDK = false;
}

export async function POST(request: Request) {
    try {
        const { idToken, requestId } = await request.json();

        if (!idToken || !requestId) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Missing required fields'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        if (useAdminSDK && auth && db) {
            try {
                // Verify the token
                const decodedToken = await auth.verifyIdToken(idToken);
                const studentUid = decodedToken.uid;

                // Check the request document
                const requestDoc = await db.collection('profile_update_requests').doc(requestId).get();

                if (!requestDoc.exists) {
                    // Request doesn't exist - clean up stale reference from student
                    await db.collection('students').doc(studentUid).update({
                        pendingProfileUpdate: FieldValue.delete(),
                        updatedAt: FieldValue.serverTimestamp()
                    });

                    return new Response(JSON.stringify({
                        success: true,
                        exists: false,
                        status: null,
                        cleaned: true
                    }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }

                const requestData = requestDoc.data();

                // If request exists but is not pending (approved/rejected), clean up
                if (requestData.status !== 'pending') {
                    await db.collection('students').doc(studentUid).update({
                        pendingProfileUpdate: FieldValue.delete(),
                        updatedAt: FieldValue.serverTimestamp()
                    });

                    return new Response(JSON.stringify({
                        success: true,
                        exists: true,
                        status: requestData.status,
                        cleaned: true
                    }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    });
                }

                // Request exists and is pending
                return new Response(JSON.stringify({
                    success: true,
                    exists: true,
                    status: 'pending',
                    cleaned: false
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });

            } catch (adminError: any) {
                console.error('Error checking pending status:', adminError);
                return new Response(JSON.stringify({
                    success: false,
                    error: adminError.message || 'Failed to check pending status'
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
        console.error('Error in check-pending-status:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Failed to check pending status'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
