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
  licenseNumber: string;
  assignedBusId?: string;
  assignedRouteId?: string;
  profilePhotoUrl?: string;
  joiningDate?: string;
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

export async function GET() {
  try {
    console.log('Fetching drivers data...');
    console.log('Firebase Admin DB available:', !!db);
    
    // Try to fetch from Firebase first
    if (db) {
      try {
        console.log('Attempting to fetch from Firestore...');
        const driversRef = db.collection('drivers');
        const querySnapshot = await driversRef.get();
        
        console.log('Query snapshot size:', querySnapshot.size);
        
        const drivers: Driver[] = [];
        querySnapshot.forEach((doc: any) => {
          const data = doc.data();
          console.log(`Document ID: ${doc.id}, Data:`, data);
          drivers.push({
            id: doc.id,
            name: data.fullName || data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            alternatePhone: data.alternatePhone || data.phone2 || '',
            licenseNumber: data.licenseNumber || '',
            assignedBusId: data.assignedBusId || data.busAssigned || '',
            assignedRouteId: data.assignedRouteId || data.routeId || '',
            profilePhotoUrl: data.profilePhotoUrl || '',
            joiningDate: data.joiningDate || '',
            createdAt: data.createdAt || ''
          });
        });
        
        console.log('Returning drivers from Firestore:', drivers);
        return NextResponse.json(drivers);
      } catch (firebaseError) {
        console.error('Error fetching drivers from Firestore:', firebaseError);
        // Fall back to JSON file if Firebase fails
      }
    }
    
    // Fallback to JSON file
    try {
      const drivers: Driver[] = readJsonFile('Drivers.json');
      console.log('Returning drivers from JSON file:', drivers);
      return NextResponse.json(drivers);
    } catch (fileError) {
      // If JSON file doesn't exist or is empty, return empty array
      console.log('No drivers data found, returning empty array');
      return NextResponse.json([]);
    }
  } catch (error) {
    console.error('Error fetching drivers:', error);
    return NextResponse.json({ error: 'Failed to fetch drivers' }, { status: 500 });
  }
}