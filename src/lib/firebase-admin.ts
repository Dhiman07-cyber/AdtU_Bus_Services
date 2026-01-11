import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let adminApp: any;
let auth: any;
let db: any;

// Try to initialize Firebase Admin SDK
try {
  console.log('Attempting to initialize Firebase Admin SDK...');
  console.log('Environment check:', {
    hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
    hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    hasProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL ? 'present' : 'missing',
    privateKey: process.env.FIREBASE_PRIVATE_KEY ? 'present' : 'missing',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'missing'
  });

  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    console.log('Firebase credentials found in environment variables');

    if (!getApps().length) {
      console.log('No existing Firebase apps, initializing new app');

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

      console.log('Firebase Admin app initialized successfully');
    } else {
      const existingApp = getApps()[0];
      const projectId = (existingApp.options as any).credential?.projectId || existingApp.options.projectId;
      console.log(`Using existing Firebase app for project: ${projectId}`);
      adminApp = existingApp;
    }

    auth = getAuth(adminApp);
    db = getFirestore(adminApp);

    console.log('Firebase Auth and Firestore initialized successfully');
  } else {
    console.warn('Firebase Admin credentials not found in environment variables');
  }
} catch (error: any) {
  console.error('Failed to initialize Firebase Admin SDK:', error);
  console.error('Error name:', error.name);
  console.error('Error message:', error.message);
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