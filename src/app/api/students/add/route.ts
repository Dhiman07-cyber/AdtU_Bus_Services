import { NextResponse } from 'next/server';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

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

// Get the data directory path
const dataDirectory = path.join(process.cwd(), 'src', 'data');

// Helper function to read JSON files
const readJsonFile = (filename: string) => {
  const filePath = path.join(dataDirectory, filename);
  const fileContents = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(fileContents);
};

// Helper function to write JSON files
const writeJsonFile = (filename: string, data: any) => {
  const filePath = path.join(dataDirectory, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

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
    
    // Try to save to Firebase first
    if (db) {
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
      } catch (firebaseError) {
        console.error('Error saving student to Firestore:', firebaseError);
        // Continue with JSON file save even if Firebase fails
      }
    }
    
    // Also save to JSON file for backward compatibility
    const students: Student[] = readJsonFile('Students.json');
    students.push(newStudent);
    writeJsonFile('Students.json', students);
    
    console.log('Student saved to JSON file:', newStudent);
    
    return NextResponse.json(newStudent, { status: 201 });
  } catch (error) {
    console.error('Error adding student:', error);
    return NextResponse.json({ error: 'Failed to add student' }, { status: 500 });
  }
}