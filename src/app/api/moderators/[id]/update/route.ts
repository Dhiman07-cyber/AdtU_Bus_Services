import { NextResponse } from 'next/server';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { createUpdatedByEntry, getUpdaterInfo } from '@/lib/utils/updatedBy';

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
    const updatedModeratorData = await request.json();

    // Log the incoming data for debugging
    console.log(`Updating moderator with ID ${id}:`, updatedModeratorData);

    let firebaseSuccess = false;
    let updatedModerator: any = null;

    // Try to update in Firebase first
    if (db) {
      try {
        // Update in the moderators collection (not users collection)
        const moderatorDocRef = db.doc(`moderators/${id}`);

        // Validate profile photo URL if provided
        if (updatedModeratorData.profilePhotoUrl !== undefined) {
          if (typeof updatedModeratorData.profilePhotoUrl !== 'string') {
            console.error('Invalid profile photo URL type:', typeof updatedModeratorData.profilePhotoUrl);
            delete updatedModeratorData.profilePhotoUrl;
          } else if (updatedModeratorData.profilePhotoUrl.trim() === '') {
            console.log('Empty profile photo URL, setting to null');
            updatedModeratorData.profilePhotoUrl = null;
          }
        }

        // Add audit trail entry
        updatedModeratorData.updatedBy = FieldValue.arrayUnion(createUpdatedByEntry('Admin', 'Admin'));
        updatedModeratorData.updatedAt = new Date().toISOString();

        await moderatorDocRef.update(updatedModeratorData);
        console.log(`Moderator with ID ${id} updated in Firestore (moderators collection)`);

        // Try to get the updated moderator data
        try {
          const moderatorDoc = await moderatorDocRef.get();
          if (moderatorDoc.exists) {
            const data = moderatorDoc.data();
            updatedModerator = {
              id: moderatorDoc.id,
              name: data.fullName || data.name || '',
              email: data.email || '',
              phone: data.phone || '',
              alternatePhone: data.alternatePhone || '',
              faculty: data.faculty || '',
              assignedFaculty: data.assignedFaculty || data.faculty || '',
              joinDate: data.joinDate || '',
              joiningDate: data.joiningDate || '',
              profilePhotoUrl: data.profilePhotoUrl || '',
              dob: data.dob || '',
              aadharNumber: data.aadharNumber || '',
              employeeId: data.employeeId || '',
            };
            firebaseSuccess = true;
          }
        } catch (getDocError) {
          console.error('Error getting updated moderator from Firestore:', getDocError);
        }
      } catch (firebaseError: any) {
        console.error('Error updating moderator in Firestore:', firebaseError);
        // Continue with JSON file update even if Firebase fails
      }
    }

    // Also update in JSON file for backward compatibility
    try {
      const moderators = readJsonFile('Moderators.json');
      const index = moderators.findIndex((moderator: any) => moderator.id === id);

      if (index !== -1) {
        // Moderator found in JSON file, update it
        // Ensure profile photo URL is handled correctly in JSON
        if (updatedModeratorData.profilePhotoUrl !== undefined) {
          if (updatedModeratorData.profilePhotoUrl === null || updatedModeratorData.profilePhotoUrl === '') {
            moderators[index].profilePhotoUrl = null;
          } else if (typeof updatedModeratorData.profilePhotoUrl === 'string') {
            moderators[index].profilePhotoUrl = updatedModeratorData.profilePhotoUrl;
          }
        }

        moderators[index] = { ...moderators[index], ...updatedModeratorData };
        // Add updatedBy for JSON file (as simple string entry since FieldValue doesn't work here)
        if (!moderators[index].updatedBy) {
          moderators[index].updatedBy = [];
        }
        moderators[index].updatedBy.push(createUpdatedByEntry('Admin', 'Admin'));
        writeJsonFile('Moderators.json', moderators);
        console.log(`Moderator with ID ${id} updated in JSON file`);

        // If Firebase update failed, return the JSON file data
        if (!firebaseSuccess) {
          return NextResponse.json(moderators[index]);
        }
      }
    } catch (jsonError) {
      console.error('Error updating moderator in JSON file:', jsonError);
      // Continue even if JSON update fails
    }

    // Return the updated moderator data
    if (firebaseSuccess && updatedModerator) {
      return NextResponse.json(updatedModerator);
    }

    // If we get here, the moderator was not found in either Firebase or JSON
    return NextResponse.json({ error: 'Moderator not found' }, { status: 404 });
  } catch (error: any) {
    console.error('Error updating moderator:', error);
    return NextResponse.json({ error: 'Failed to update moderator' }, { status: 500 });
  }
}