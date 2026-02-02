import { NextResponse } from 'next/server';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { createUpdatedByEntry } from '@/lib/utils/updatedBy';

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

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const updatedStudentData = await request.json();

    // Log the incoming data for debugging
    console.log(`Updating student with ID ${id}:`, updatedStudentData);

    let firebaseSuccess = false;
    let updatedStudent: any = null;

    // Try to update in Firebase first
    if (db) {
      try {
        // Update in the students collection (not users collection)
        const studentDocRef = db.doc(`students/${id}`);

        // Validate profile photo URL if provided
        if (updatedStudentData.profilePhotoUrl !== undefined) {
          if (typeof updatedStudentData.profilePhotoUrl !== 'string') {
            console.error('Invalid profile photo URL type:', typeof updatedStudentData.profilePhotoUrl);
            delete updatedStudentData.profilePhotoUrl;
          } else if (updatedStudentData.profilePhotoUrl.trim() === '') {
            console.log('Empty profile photo URL, setting to null');
            updatedStudentData.profilePhotoUrl = null;
          }
        }

        // Add unified field structure for consistency
        const unifiedUpdateData = {
          ...updatedStudentData,
          // Ensure both field names exist for consistency
          assignedBusId: updatedStudentData.busId || updatedStudentData.assignedBusId,
          assignedRouteId: updatedStudentData.routeId || updatedStudentData.assignedRouteId,
          updatedAt: new Date().toISOString(),
          // Append to audit trail
          updatedBy: FieldValue.arrayUnion(createUpdatedByEntry('Admin', 'Admin'))
        };

        await studentDocRef.update(unifiedUpdateData);
        console.log(`Student with ID ${id} updated in Firestore (students collection)`);

        // Try to get the updated student data
        try {
          const studentDoc = await studentDocRef.get();
          if (studentDoc.exists) {
            const data = studentDoc.data();
            updatedStudent = {
              id: studentDoc.id,
              name: data.fullName || data.name || '',
              email: data.email || '',
              phone: data.phone || '',
              alternatePhone: data.alternatePhone || '',
              enrollmentId: data.enrollmentId || '',
              gender: data.gender || '',
              dob: data.dob || '',
              age: data.age?.toString() || '',
              faculty: data.faculty || '',
              department: data.department || '',
              parentName: data.parentName || '',
              parentPhone: data.parentPhone || '',
              busAssigned: data.busAssigned || data.busId || '',
              routeId: data.routeId || '',
              profilePhotoUrl: data.profilePhotoUrl || '',
              address: data.address || '',
              bloodGroup: data.bloodGroup || '',
            };
            firebaseSuccess = true;
          }
        } catch (getDocError) {
          console.error('Error getting updated student from Firestore:', getDocError);
        }
      } catch (firebaseError: any) {
        console.error('Error updating student in Firestore:', firebaseError);
        // Continue with JSON file update even if Firebase fails
      }
    }

    // Also update in JSON file for backward compatibility
    try {
      const students = readJsonFile('Students.json');
      const index = students.findIndex((student: any) => student.id === id);

      if (index !== -1) {
        // Student found in JSON file, update it
        // Ensure profile photo URL is handled correctly in JSON
        if (updatedStudentData.profilePhotoUrl !== undefined) {
          if (updatedStudentData.profilePhotoUrl === null || updatedStudentData.profilePhotoUrl === '') {
            students[index].profilePhotoUrl = null;
          } else if (typeof updatedStudentData.profilePhotoUrl === 'string') {
            students[index].profilePhotoUrl = updatedStudentData.profilePhotoUrl;
          }
        }

        students[index] = { ...students[index], ...updatedStudentData };
        // Add updatedBy for JSON file
        if (!students[index].updatedBy) {
          students[index].updatedBy = [];
        }
        students[index].updatedBy.push(createUpdatedByEntry('Admin', 'Admin'));
        writeJsonFile('Students.json', students);
        console.log(`Student with ID ${id} updated in JSON file`);

        // If Firebase update failed, return the JSON file data
        if (!firebaseSuccess) {
          return NextResponse.json(students[index]);
        }
      }
    } catch (jsonError) {
      console.error('Error updating student in JSON file:', jsonError);
      // Continue even if JSON update fails
    }

    // Return the updated student data
    if (firebaseSuccess && updatedStudent) {
      return NextResponse.json(updatedStudent);
    }

    // If we get here, the student was not found in either Firebase or JSON
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  } catch (error: any) {
    console.error('Error updating student:', error);
    return NextResponse.json({ error: 'Failed to update student' }, { status: 500 });
  }
}