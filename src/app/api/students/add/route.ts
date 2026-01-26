import { NextResponse } from 'next/server';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';


// Define types for our data
interface Student {
  id: string;
  name: string;
  email: string;
  phone?: string;
  alternatePhone?: string;
  enrollmentId?: string;
  gender?: string;
  dob?: string;
  age?: string;
  faculty: string;
  department: string;
  parentName?: string;
  parentPhone?: string;
  busAssigned: string;
  routeId?: string;
  profilePhotoUrl?: string;
  [key: string]: any; // Allow additional properties
}



let db: any = null;

// Try to initialize Firebase Admin SDK
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

export async function POST(request: Request) {
  try {
    const newStudentData = await request.json();
    console.log('Received student data:', newStudentData);

    // Generate a unique ID
    const studentId = Date.now().toString();
    const newStudent = {
      ...newStudentData,
      id: studentId
    };

    // Save to Firebase (Critical Path)
    if (!db) {
      console.error('Firebase Admin SDK not initialized');
      return NextResponse.json({ error: 'Database service unavailable' }, { status: 503 });
    }

    try {
      // Save to Firestore with the role field
      const studentDocRef = db.doc(`users/${studentId}`);
      await studentDocRef.set({
        ...newStudent,
        uid: studentId,
        role: 'student',
        createdAt: new Date().toISOString()
      });
      console.log('Student saved to Firestore:', newStudent);

      return NextResponse.json(newStudent, { status: 201 });
    } catch (firebaseError: any) {
      console.error('Error saving student to Firestore:', firebaseError);
      return NextResponse.json({ error: 'Failed to save student data: ' + firebaseError.message }, { status: 500 });
    }
  } catch (error) {
    console.error('Error adding student:', error);
    return NextResponse.json({ error: 'Failed to add student' }, { status: 500 });
  }
}