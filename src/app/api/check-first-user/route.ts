import { db } from '@/lib/firebase';
import { collection, getDocs, query, limit } from 'firebase/firestore';

let adminApp: any;
let auth: any;
let dbAdmin: any;
let useAdminSDK = false;

// Try to initialize Firebase Admin SDK
try {
  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    const firebaseAdmin = require('firebase-admin');
    
    if (!firebaseAdmin.apps.length) {
      // Fix private key parsing issue
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
      adminApp = firebaseAdmin.initializeApp({
        credential: firebaseAdmin.cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });
    } else {
      adminApp = firebaseAdmin.apps[0];
    }

    auth = firebaseAdmin.auth(adminApp);
    dbAdmin = firebaseAdmin.firestore(adminApp);
    useAdminSDK = true;
  }
} catch (error) {
  console.log('Failed to initialize Firebase Admin SDK, falling back to client SDK:', error);
  useAdminSDK = false;
}

export async function GET() {
  try {
    let userCount = 0;
    
    if (useAdminSDK && dbAdmin) {
      // Use Firebase Admin SDK
      try {
        const usersCollection = dbAdmin.collection('users');
        const snapshot = await usersCollection.limit(1).get();
        userCount = snapshot.size;
        
        return new Response(JSON.stringify({ 
          success: true, 
          isFirstUser: userCount === 0 
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (adminError) {
        console.error('Error with Admin SDK:', adminError);
        // Fall back to client SDK
        useAdminSDK = false;
      }
    }
    
    // Fallback to client SDK
    try {
      const usersCollection = collection(db, 'users');
      const q = query(usersCollection, limit(1));
      const usersSnapshot = await getDocs(q);
      userCount = usersSnapshot.size;
      
      return new Response(JSON.stringify({ 
        success: true, 
        isFirstUser: userCount === 0 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (clientError: any) {
      // If we get a permissions error, it likely means there are no users yet
      // and the security rules are preventing access
      console.log('Client SDK error (might be expected if no users exist yet):', clientError);
      if (clientError.code === 'permission-denied' || clientError.message.includes('permission')) {
        // In this case, we assume this is the first user
        return new Response(JSON.stringify({ 
          success: true, 
          isFirstUser: true 
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        throw clientError;
      }
    }
  } catch (error: any) {
    console.error('Error checking first user:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Failed to check if this is the first user' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}