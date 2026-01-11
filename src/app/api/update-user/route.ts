import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let adminApp: any;
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

    db = getFirestore(adminApp);
    useAdminSDK = true;
  }
} catch (error) {
  console.log('Failed to initialize Firebase Admin SDK, falling back to client SDK:', error);
  useAdminSDK = false;
}

export async function POST(request: Request) {
  try {
    const userData = await request.json();
    const { uid, ...updateData } = userData;
    
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
    
    if (useAdminSDK && db) {
      // Use Firebase Admin SDK
      try {
        // Update user document in Firestore
        await db.collection('users').doc(uid).update(updateData);
        
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (adminError: any) {
        console.error('Error with Admin SDK:', adminError);
        return new Response(JSON.stringify({ 
          success: false, 
          error: adminError.message || 'Failed to update user with admin SDK' 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    
    // Fallback to client SDK
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Admin SDK not available for update operation' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error updating user:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Failed to update user' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}