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
    const updatedDriverData = await request.json();

    // Log the incoming data for debugging
    console.log(`Updating driver with ID ${id}:`, updatedDriverData);

    let firebaseSuccess = false;
    let updatedDriver: any = null;

    // Try to update in Firebase first
    if (db) {
      try {
        // Update in the drivers collection (not users collection)
        const driverDocRef = db.doc(`drivers/${id}`);

        // Validate profile photo URL if provided
        if (updatedDriverData.profilePhotoUrl !== undefined) {
          if (typeof updatedDriverData.profilePhotoUrl !== 'string') {
            console.error('Invalid profile photo URL type:', typeof updatedDriverData.profilePhotoUrl);
            delete updatedDriverData.profilePhotoUrl;
          } else if (updatedDriverData.profilePhotoUrl.trim() === '') {
            console.log('Empty profile photo URL, setting to null');
            updatedDriverData.profilePhotoUrl = null;
          }
        }

        // Add audit trail entry
        updatedDriverData.updatedBy = FieldValue.arrayUnion(createUpdatedByEntry('Admin', 'Admin'));
        updatedDriverData.updatedAt = new Date().toISOString();

        await driverDocRef.update(updatedDriverData);
        console.log(`Driver with ID ${id} updated in Firestore (drivers collection)`);

        // Try to get the updated driver data
        try {
          const driverDoc = await driverDocRef.get();
          if (driverDoc.exists) {
            const data = driverDoc.data();
            updatedDriver = {
              id: driverDoc.id,
              name: data.fullName || data.name || '',
              email: data.email || '',
              phone: data.phone || '',
              alternatePhone: data.alternatePhone || '',
              licenseNumber: data.licenseNumber || '',
              busAssigned: data.busAssigned || data.assignedBusId || '',
              routeId: data.routeId || data.assignedRouteId || '',
              profilePhotoUrl: data.profilePhotoUrl || '',
              dob: data.dob || '',
              joiningDate: data.joiningDate || '',
              aadharNumber: data.aadharNumber || '',
              employeeId: data.employeeId || '',
              address: data.address || '',
            };
            firebaseSuccess = true;
          }
        } catch (getDocError) {
          console.error('Error getting updated driver from Firestore:', getDocError);
        }
      } catch (firebaseError: any) {
        console.error('Error updating driver in Firestore:', firebaseError);
        // Continue with JSON file update even if Firebase fails
      }
    }

    // Also update in JSON file for backward compatibility
    try {
      const drivers = readJsonFile('Drivers.json');
      const index = drivers.findIndex((driver: any) => driver.id === id);

      if (index !== -1) {
        // Driver found in JSON file, update it
        // Ensure profile photo URL is handled correctly in JSON
        if (updatedDriverData.profilePhotoUrl !== undefined) {
          if (updatedDriverData.profilePhotoUrl === null || updatedDriverData.profilePhotoUrl === '') {
            drivers[index].profilePhotoUrl = null;
          } else if (typeof updatedDriverData.profilePhotoUrl === 'string') {
            drivers[index].profilePhotoUrl = updatedDriverData.profilePhotoUrl;
          }
        }

        drivers[index] = { ...drivers[index], ...updatedDriverData };
        // Add updatedBy for JSON file
        if (!drivers[index].updatedBy) {
          drivers[index].updatedBy = [];
        }
        drivers[index].updatedBy.push(createUpdatedByEntry('Admin', 'Admin'));
        writeJsonFile('Drivers.json', drivers);
        console.log(`Driver with ID ${id} updated in JSON file`);

        // If Firebase update failed, return the JSON file data
        if (!firebaseSuccess) {
          return NextResponse.json(drivers[index]);
        }
      }
    } catch (jsonError) {
      console.error('Error updating driver in JSON file:', jsonError);
      // Continue even if JSON update fails
    }

    // Return the updated driver data
    if (firebaseSuccess && updatedDriver) {
      return NextResponse.json(updatedDriver);
    }

    // If we get here, the driver was not found in either Firebase or JSON
    return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
  } catch (error: any) {
    console.error('Error updating driver:', error);
    return NextResponse.json({ error: 'Failed to update driver' }, { status: 500 });
  }
}