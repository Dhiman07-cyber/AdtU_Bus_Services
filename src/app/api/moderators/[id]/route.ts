import { NextResponse } from 'next/server';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

// Define types for our data
interface Moderator {
  id: string;
  name: string;
  email: string;
  phone?: string;
  alternatePhone?: string;
  faculty?: string;
  assignedFaculty?: string;
  joinDate?: string;
  joiningDate?: string;
  profilePhotoUrl?: string;
  dob?: string;
  aadharNumber?: string;
  employeeId?: string;
  createdAt?: string;
  [key: string]: any; // Allow additional properties
}

// Get the data directory path
const dataDirectory = path.join(process.cwd(), 'src', 'data');

// Helper function to read JSON files
const readJsonFile = (filename: string) => {
  const filePath = path.join(dataDirectory, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return [];
  }
  try {
    const fileContents = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContents);
  } catch (err) {
    console.error(`Error reading/parsing ${filename}:`, err);
    return [];
  }
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
        // Fetch from moderators collection (not users collection)
        const moderatorDocRef = db.doc(`moderators/${id}`);
        const moderatorDoc = await moderatorDocRef.get();

        if (moderatorDoc.exists) {
          const data = moderatorDoc.data();

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

          // Format the joining date to ensure it's in YYYY-MM-DD format
          let formattedJoiningDate = '';
          if (data.joiningDate) {
            if (typeof data.joiningDate === 'string') {
              // If it's already a string, use it as is
              formattedJoiningDate = data.joiningDate;
            } else if (data.joiningDate.toDate) {
              // If it's a Firestore Timestamp, convert it to YYYY-MM-DD
              formattedJoiningDate = data.joiningDate.toDate().toISOString().split('T')[0];
            } else {
              // If it's a Date object, convert it to YYYY-MM-DD
              formattedJoiningDate = new Date(data.joiningDate).toISOString().split('T')[0];
            }
          }

          // Also check for joinDate if joiningDate is not available
          if (!formattedJoiningDate && data.joinDate) {
            if (typeof data.joinDate === 'string') {
              formattedJoiningDate = data.joinDate;
            } else if (data.joinDate.toDate) {
              formattedJoiningDate = data.joinDate.toDate().toISOString().split('T')[0];
            } else {
              formattedJoiningDate = new Date(data.joinDate).toISOString().split('T')[0];
            }
          }

          const moderator: Moderator = {
            id: moderatorDoc.id,
            name: data.fullName || data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            alternatePhone: data.alternatePhone || '',
            faculty: data.faculty || '',
            assignedFaculty: data.assignedFaculty || data.faculty || '',
            joinDate: formattedJoiningDate,
            joiningDate: formattedJoiningDate,
            profilePhotoUrl: data.profilePhotoUrl || '',
            dob: formattedDob,
            aadharNumber: data.aadharNumber || '',
            employeeId: data.employeeId || '',
            createdAt: data.createdAt || '',
          };

          console.log('Returning moderator from Firestore (moderators collection):', moderator);
          return NextResponse.json(moderator);
        }

        // If not found in moderators collection, try the users collection as fallback
        console.log('Moderator not found in moderators collection, checking users collection');
        const userDocRef = db.doc(`users/${id}`);
        const userDoc = await userDocRef.get();

        if (userDoc.exists) {
          const data = userDoc.data();

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

          // Format the joining date to ensure it's in YYYY-MM-DD format
          let formattedJoiningDate = '';
          if (data.joiningDate) {
            if (typeof data.joiningDate === 'string') {
              // If it's already a string, use it as is
              formattedJoiningDate = data.joiningDate;
            } else if (data.joiningDate.toDate) {
              // If it's a Firestore Timestamp, convert it to YYYY-MM-DD
              formattedJoiningDate = data.joiningDate.toDate().toISOString().split('T')[0];
            } else {
              // If it's a Date object, convert it to YYYY-MM-DD
              formattedJoiningDate = new Date(data.joiningDate).toISOString().split('T')[0];
            }
          }

          // Also check for joinDate if joiningDate is not available
          if (!formattedJoiningDate && data.joinDate) {
            if (typeof data.joinDate === 'string') {
              formattedJoiningDate = data.joinDate;
            } else if (data.joinDate.toDate) {
              formattedJoiningDate = data.joinDate.toDate().toISOString().split('T')[0];
            } else {
              formattedJoiningDate = new Date(data.joinDate).toISOString().split('T')[0];
            }
          }

          const moderator: Moderator = {
            id: userDoc.id,
            name: data.fullName || data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            alternatePhone: data.alternatePhone || '',
            faculty: data.faculty || '',
            assignedFaculty: data.assignedFaculty || data.faculty || '',
            joinDate: formattedJoiningDate,
            joiningDate: formattedJoiningDate,
            profilePhotoUrl: data.profilePhotoUrl || '',
            dob: formattedDob,
            aadharNumber: data.aadharNumber || '',
            createdAt: data.createdAt || '',
          };

          console.log('Returning moderator from Firestore (users collection):', moderator);
          return NextResponse.json(moderator);
        }
      } catch (firebaseError) {
        console.error('Error fetching moderator from Firestore:', firebaseError);
        // Fall back to JSON file if Firebase fails
      }
    }

    // Fallback to JSON file
    const moderators: Moderator[] = readJsonFile('Moderators.json');
    const moderator = moderators.find(m => m.id === id);

    if (!moderator) {
      return NextResponse.json({ error: 'Moderator not found' }, { status: 404 });
    }

    console.log('Returning moderator from JSON file:', moderator);
    return NextResponse.json(moderator);
  } catch (error) {
    console.error('Error fetching moderator:', error);
    return NextResponse.json({ error: 'Failed to fetch moderator' }, { status: 500 });
  }
}