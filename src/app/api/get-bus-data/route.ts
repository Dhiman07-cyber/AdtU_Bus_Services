import { NextResponse } from 'next/server';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
let adminApp: any;
let adminDb: any;

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

    adminDb = getFirestore(adminApp);
  }
} catch (error) {
  console.log('Failed to initialize Firebase Admin SDK:', error);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const busId = searchParams.get('busId');

    if (!busId) {
      return NextResponse.json({ error: 'Bus ID is required' }, { status: 400 });
    }

    if (!adminDb) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    // Fetch bus data directly from Firestore
    const busDoc = await adminDb.collection('buses').doc(busId).get();
    
    if (!busDoc.exists) {
      return NextResponse.json({ error: 'Bus not found' }, { status: 404 });
    }

    const busData = busDoc.data();
    
    return NextResponse.json({ 
      success: true,
      data: {
        busId: busDoc.id,
        ...busData
      }
    });
  } catch (error: any) {
    console.error('Error fetching bus data:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch bus data' }, { status: 500 });
  }
}