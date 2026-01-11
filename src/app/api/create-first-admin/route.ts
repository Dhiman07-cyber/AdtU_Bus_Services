import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp, collection, getDocs, query, limit } from 'firebase/firestore';

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

export async function POST(request: Request) {
  try {
    const { uid, email, name } = await request.json();
    
    // Validate input
    if (!uid || !email || !name) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'UID, email, and name are required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    // Check if any user already exists
    let userExists = false;
    try {
      if (useAdminSDK && dbAdmin) {
        const usersCollection = dbAdmin.collection('users');
        const snapshot = await usersCollection.limit(1).get();
        userExists = !snapshot.empty;
      } else {
        const usersCollection = collection(db, 'users');
        const q = query(usersCollection, limit(1));
        const usersSnapshot = await getDocs(q);
        userExists = !usersSnapshot.empty;
      }
      
      if (userExists) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'First admin already exists' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch (error) {
      // If we get a permissions error, it might mean no users exist yet
      // which is what we want for first admin creation
      console.log('Error checking existing users (might be expected):', error);
    }
    
    // Create user document in Firestore with admin role
    const userData = {
      uid,
      email,
      name,
      role: 'admin' as const,
      firstAdmin: true, // Special field to identify first admin
      createdAt: serverTimestamp(), // Use serverTimestamp() instead of Timestamp.now()
      // Initialize bus fee fields
      busFee: 0, // Default to 0 for first admin
      busFeeUpdatedAt: new Date().toISOString(),
      busFeeVersion: 1
    };
    
    if (useAdminSDK && dbAdmin) {
      // Use Firebase Admin SDK
      try {
        await dbAdmin.collection('users').doc(uid).set(userData);
        
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'First admin created successfully' 
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (adminError: any) {
        console.error('Error with Admin SDK:', adminError);
        // Fall back to client SDK
        useAdminSDK = false;
      }
    }
    
    // Fallback to client SDK
    try {
      const userDocRef = doc(db, 'users', uid);
      await setDoc(userDocRef, userData);
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'First admin created successfully' 
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (clientError: any) {
      // If we get a permissions error, it's likely because the security rules
      // don't allow creating the first user. In this case, we need to provide
      // instructions to update the Firestore rules
      console.error('Client SDK error:', clientError);
      
      if (clientError.code === 'permission-denied' || clientError.message.includes('permission')) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Permission denied. You need to deploy the updated Firestore security rules. Please follow these steps:\n\n1. Go to the Firebase Console\n2. Navigate to Firestore Database → Rules\n3. Replace the existing rules with the content from your firestore.rules file\n4. Click "Publish"\n5. Try again',
          instructions: {
            step1: 'Go to the Firebase Console',
            step2: 'Navigate to Firestore Database → Rules',
            step3: 'Replace the existing rules with the content from your firestore.rules file',
            step4: 'Click "Publish"',
            step5: 'Try again'
          }
        }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        throw clientError;
      }
    }
  } catch (error: any) {
    console.error('Error creating first admin user:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Failed to create first admin user' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}