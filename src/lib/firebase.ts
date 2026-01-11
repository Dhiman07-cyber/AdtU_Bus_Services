// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getMessaging, Messaging } from 'firebase/messaging';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
let app: ReturnType<typeof getApp>;
let auth: ReturnType<typeof getAuth>;
let db: Firestore;
let storage: ReturnType<typeof getStorage>;
let messaging: Messaging;

try {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

  // Initialize Auth with configuration to prevent experiments.js loading
  auth = getAuth(app);

  // Disable automatic experiment loading to avoid 500 errors
  if (typeof window !== 'undefined') {
    // Configure auth for redirect-based sign-in
    auth.useDeviceLanguage();
  }

  db = getFirestore(app);
  storage = getStorage(app);

  // Connect to emulators in development if enabled
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
    try {
      connectFirestoreEmulator(db, 'localhost', 8080);
      connectAuthEmulator(auth, 'http://localhost:9099');
      connectStorageEmulator(storage, 'localhost', 9199);
      console.log('🔧 Connected to Firebase emulators (Auth, Firestore, Storage)');
    } catch (error) {
      // Emulator might already be connected
      console.log('Firebase emulators already connected or not available');
    }
  }

  // Initialize messaging only in browser environment  
  if (typeof window !== 'undefined') {
    try {
      messaging = getMessaging(app);
    } catch (error: any) {
      // Handle gracefully - browser might not support FCM (e.g., Brave browser)
      if (error?.code === 'messaging/unsupported-browser') {
        console.warn('⚠️ Firebase Messaging not supported in this browser. Push notifications will be disabled.');
      } else {
        console.error('❌ Failed to initialize Firebase Messaging:', error);
      }
      // Don't throw - messaging is optional for core functionality
      messaging = null as any;
    }
  } else {
    // Server-side - messaging not available
    messaging = null as any;
  }
} catch (error: any) {
  console.error('Firebase initialization error:', error);
  throw error;
}

export { app, auth, db, storage, messaging };