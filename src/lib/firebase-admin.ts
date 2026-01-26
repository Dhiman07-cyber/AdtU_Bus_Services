import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let adminApp: any;
let auth: any;
let db: any;

// Try to initialize Firebase Admin SDK
try {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    console.log('🔧 Initializing Firebase Admin SDK...');
  }

  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    if (!getApps().length) {
      // Process the private key - handle both quoted and unquoted keys, and escaped newlines
      let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';

      // Clean the key: remove literal quotes if they wrap the entire string, and fix newlines
      privateKey = privateKey.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');

      adminApp = initializeApp({
        credential: cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
      });

      if (!isProduction) {
        console.log('✅ Firebase Admin SDK initialized');
      }
    } else {
      adminApp = getApps()[0];
    }

    auth = getAuth(adminApp);
    db = getFirestore(adminApp);
  } else if (!isProduction) {
    console.warn('⚠️ Firebase Admin credentials not found');
  }
} catch (error: any) {
  console.error('❌ Firebase Admin SDK initialization failed:', error.message);
}

// Verify token function
export async function verifyToken(token: string) {
  if (!auth) {
    throw new Error('Firebase Admin Auth not initialized');
  }
  return await auth.verifyIdToken(token);
}

// Export with aliases for consistency - only if properly initialized
export const adminAuth = auth || null;
export const adminDb = db || null;
export const admin = adminApp || null;

export { adminApp, auth, db, FieldValue };