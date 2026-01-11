import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import fs from 'fs';
import path from 'path';

// Define types for our data
interface Driver {
  id: string;
  name: string;
  email: string;
  phone?: string;
  alternatePhone?: string;
  licenseNumber?: string;
  busAssigned: string;
  routeId?: string;
  profilePhotoUrl?: string;
  dob?: string;
  joiningDate?: string;
  aadharNumber?: string;
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

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    // Try to fetch from Firebase first
    if (db) {
      try {
        // First try to get driver data from the drivers collection by document ID
        console.log(`🔍 Looking up driver by document ID: ${id}`);
        const driverDocRef = db.doc(`drivers/${id}`);
        const driverDoc = await driverDocRef.get();
        console.log(`📄 Driver document exists: ${driverDoc.exists}`);
        
        // If not found by document ID, try to query by uid field
        if (!driverDoc.exists) {
          console.log(`⚠️ Driver not found by doc ID ${id}, trying uid field...`);
          const driverQuery = db.collection('drivers').where('uid', '==', id).limit(1).get();
          const querySnapshot = await driverQuery;
          
          if (!querySnapshot.empty) {
            const foundDriverDoc = querySnapshot.docs[0];
            const data = foundDriverDoc.data();
            console.log('Raw driver data from Firestore (drivers collection by uid):', JSON.stringify(data, null, 2));
            
            // Use the same formatting logic as below
            let formattedDob = '';
            if (data.dob) {
              if (typeof data.dob === 'string') {
                formattedDob = data.dob;
              } else if (data.dob.toDate) {
                formattedDob = data.dob.toDate().toISOString().split('T')[0];
              } else {
                formattedDob = new Date(data.dob).toISOString().split('T')[0];
              }
            }
            
            let formattedJoiningDate = '';
            if (data.joiningDate) {
              if (typeof data.joiningDate === 'string') {
                formattedJoiningDate = data.joiningDate;
              } else if (data.joiningDate.toDate) {
                formattedJoiningDate = data.joiningDate.toDate().toISOString().split('T')[0];
              } else {
                formattedJoiningDate = new Date(data.joiningDate).toISOString().split('T')[0];
              }
            }
            
            const driver: Driver = {
              id: foundDriverDoc.id,
              name: data.fullName || data.name || '',
              email: data.email || '',
              phone: data.phone || '',
              alternatePhone: data.alternatePhone || '',
              licenseNumber: data.licenseNumber || '',
              busAssigned: data.busAssigned || data.assignedBusId || data.busId || '',
              routeId: data.routeId || data.assignedRouteId || '',
              profilePhotoUrl: data.profilePhotoUrl || '',
              dob: formattedDob || data.dob || '',
              joiningDate: formattedJoiningDate || data.joiningDate || '',
              aadharNumber: data.aadharNumber || '',
              createdAt: data.createdAt || '',
            };
            
            console.log('✅ Returning driver from Firestore (drivers collection by uid):', JSON.stringify(driver, null, 2));
            return NextResponse.json({ driver });
          }
        }
        
        if (driverDoc.exists) {
          const data = driverDoc.data();
          console.log('✅ Raw driver data from Firestore (drivers collection by doc ID):', JSON.stringify(data, null, 2));
          
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
          
          const driver: Driver = {
            id: driverDoc.id,
            name: data.fullName || data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            alternatePhone: data.alternatePhone || '',
            licenseNumber: data.licenseNumber || '',
            busAssigned: data.busAssigned || data.assignedBusId || '',
            routeId: data.routeId || data.assignedRouteId || '',
            profilePhotoUrl: data.profilePhotoUrl || '',
            dob: formattedDob || data.dob || '',
            joiningDate: formattedJoiningDate || data.joiningDate || '',
            aadharNumber: data.aadharNumber || '',
            createdAt: data.createdAt || '',
          };
          
          console.log('✅ Returning driver from Firestore (drivers collection by doc ID):', JSON.stringify(driver, null, 2));
          return NextResponse.json({ driver });
        }
        
        // If not found in drivers collection, try the users collection as fallback
        console.log('Driver not found in drivers collection, checking users collection');
        const userDocRef = db.doc(`users/${id}`);
        const userDoc = await userDocRef.get();
        
        if (userDoc.exists) {
          const data = userDoc.data();
          console.log('Raw user data from Firestore (users collection):', JSON.stringify(data, null, 2));
          
          const driver: Driver = {
            id: userDoc.id,
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
            createdAt: data.createdAt || '',
          };
          
          console.log('Returning driver from Firestore (users collection):', driver);
          return NextResponse.json({ driver });
        }
      } catch (firebaseError) {
        console.error('Error fetching driver from Firestore:', firebaseError);
        // Fall back to JSON file if Firebase fails
      }
    }
    
    // Fallback to JSON file
    const drivers: Driver[] = readJsonFile('Drivers.json');
    const driver = drivers.find(d => d.id === id);
    
    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }
    
    console.log('Returning driver from JSON file:', driver);
    return NextResponse.json({ driver });
  } catch (error) {
    console.error('Error fetching driver:', error);
    return NextResponse.json({ error: 'Failed to fetch driver' }, { status: 500 });
  }
}