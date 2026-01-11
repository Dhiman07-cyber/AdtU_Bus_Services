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
  altPhone?: string;
  enrollmentId?: string;
  gender?: string;
  dob?: string;
  age?: string;
  faculty: string;
  department: string;
  parentName?: string;
  parentPhone?: string;
  busId?: string;
  routeId?: string;
  profilePhotoUrl?: string;
  createdAt?: string;
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

// Initialize Firebase Admin SDK
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

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    // Try to fetch from Firebase first
    if (db) {
      try {
        const studentDocRef = db.doc(`students/${id}`);
        const studentDoc = await studentDocRef.get();
        
        if (studentDoc.exists) {
          const data = studentDoc.data();
          
          // Format the date of birth to ensure it's in YYYY-MM-DD format
          let formattedDob = '';
          if (data.dob) {
            if (typeof data.dob === 'string') {
              // If it's already a string, use it as is
              formattedDob = data.dob;
            } else if (data.dob.toDate) {
              // If it's a Firestore Timestamp, convert it to YYYY-MM-DD
              formattedDob = data.dob.toDate().toISOString().split('T')[0];
            } else {
              // If it's a Date object, convert it to YYYY-MM-DD
              formattedDob = new Date(data.dob).toISOString().split('T')[0];
            }
          }
          
          const student: Student = {
            id: studentDoc.id,
            name: data.fullName || '',
            email: data.email || '',
            phone: data.phone || '',
            altPhone: data.altPhone || '',
            enrollmentId: data.enrollmentId || '',
            gender: data.gender || '',
            dob: formattedDob,
            age: data.age?.toString() || '',
            faculty: data.faculty || '',
            department: data.department || '',
            parentName: data.parentName || '',
            parentPhone: data.parentPhone || '',
            busId: data.busId || '',
            routeId: data.routeId || '',
            profilePhotoUrl: data.profilePhotoUrl || '',
            createdAt: data.createdAt || '',
          };
          
          console.log('Returning student from Firestore:', student);
          return NextResponse.json(student);
        }
      } catch (firebaseError) {
        console.error('Error fetching student from Firestore:', firebaseError);
        // Fall back to JSON file if Firebase fails
      }
    }
    
    // Fallback to JSON file
    const students: Student[] = readJsonFile('Students.json');
    const student = students.find(s => s.id === id);
    
    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    
    console.log('Returning student from JSON file:', student);
    return NextResponse.json(student);
  } catch (error) {
    console.error('Error fetching student:', error);
    return NextResponse.json({ error: 'Failed to fetch student' }, { status: 500 });
  }
}