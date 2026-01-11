import { NextResponse } from 'next/server';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

// Get the data directory path
const dataDirectory = path.join(process.cwd(), 'src', 'data');

let db: any = null;

// Try to initialize Firebase Admin SDK
const initializeFirebase = async () => {
  try {
    if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      let adminApp;
      if (!getApps().length) {
        const admin = await import('firebase-admin');
        // Fix private key parsing issue
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
        adminApp = initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
          }),
        });
      } else {
        adminApp = getApps()[0];
      }
      db = getFirestore(adminApp);
    }
  } catch (error) {
    console.log('Failed to initialize Firebase Admin SDK:', error);
    db = null;
  }
};

// Initialize Firebase when the module loads
initializeFirebase();

export async function GET() {
  try {
    // Try to fetch from Firebase first
    if (db) {
      try {
        const moderatorsRef = db.collection('moderators');
        const querySnapshot = await moderatorsRef.get();
        
        const moderators: any[] = [];
        querySnapshot.forEach((doc: any) => {
          const data = doc.data();
          moderators.push({
            id: doc.id,
            name: data.fullName || data.name || '',
          });
        });
        
        console.log('Returning moderators list from Firestore:', moderators);
        return NextResponse.json(moderators);
      } catch (firebaseError) {
        console.error('Error fetching moderators from Firestore:', firebaseError);
        // Fall back to JSON file if Firebase fails
      }
    }
    
    // Fallback to JSON file
    try {
      // Since we're in an API route, we need to handle file reading differently
      // For now, we'll return an empty array if Firebase is not available
      console.log('No moderators data available, returning empty array');
      return NextResponse.json([]);
    } catch (fileError) {
      // If JSON file doesn't exist or is empty, return empty array
      console.log('No moderators data found, returning empty array');
      return NextResponse.json([]);
    }
  } catch (error) {
    console.error('Error fetching moderators:', error);
    return NextResponse.json({ error: 'Failed to fetch moderators' }, { status: 500 });
  }
}