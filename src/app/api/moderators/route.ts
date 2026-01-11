import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
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
    // Try to fetch from Firebase first
    if (db) {
      try {
        const moderatorsRef = db.collection('moderators');
        const querySnapshot = await moderatorsRef.get();
        
        const moderators: Moderator[] = [];
        querySnapshot.forEach((doc: any) => {
          const data = doc.data();
          moderators.push({
            id: doc.id,
            name: data.fullName || data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            alternatePhone: data.alternatePhone || '',
            faculty: data.faculty || '',
            assignedFaculty: data.assignedFaculty || data.faculty || '',
            joinDate: data.joinDate || data.joiningDate || '',
            joiningDate: data.joiningDate || data.joinDate || '',
            profilePhotoUrl: data.profilePhotoUrl || '',
            dob: data.dob || '',
            aadharNumber: data.aadharNumber || '',
            employeeId: data.employeeId || '',
          });
        });
        
        console.log('Returning moderators from Firestore:', moderators);
        return NextResponse.json(moderators);
      } catch (firebaseError) {
        console.error('Error fetching moderators from Firestore:', firebaseError);
        // Fall back to JSON file if Firebase fails
      }
    }
    
    // Fallback to JSON file
    try {
      const moderators: Moderator[] = readJsonFile('Moderators.json');
      console.log('Returning moderators from JSON file:', moderators);
      return NextResponse.json(moderators);
    } catch (fileError) {
      // If JSON file doesn't exist or is empty, return empty array
      console.log('No moderators data found, returning empty array');
      return NextResponse.json([]);
    }
  } catch (error) {
    console.error('Error fetching moderators:', error);
    return NextResponse.json({ error: 'Failed to fetch moderators' }, { status: 500 });
  }
}