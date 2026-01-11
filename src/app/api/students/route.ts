import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
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
        const studentsRef = db.collection('students');
        const querySnapshot = await studentsRef.get();
        
        const students: Student[] = [];
        querySnapshot.forEach((doc: any) => {
          const data = doc.data();
          students.push({
            id: doc.id,
            name: data.fullName || '',
            email: data.email || '',
            phone: data.phone || '',
            altPhone: data.altPhone || '',
            enrollmentId: data.enrollmentId || '',
            gender: data.gender || '',
            dob: data.dob || '',
            age: data.age?.toString() || '',
            faculty: data.faculty || '',
            department: data.department || '',
            parentName: data.parentName || '',
            parentPhone: data.parentPhone || '',
            busId: data.busId || '',
            routeId: data.routeId || '',
            profilePhotoUrl: data.profilePhotoUrl || '',
          });
        });
        
        console.log('Returning students from Firestore:', students);
        return NextResponse.json(students);
      } catch (firebaseError) {
        console.error('Error fetching students from Firestore:', firebaseError);
        // Fall back to JSON file if Firebase fails
      }
    }
    
    // Fallback to JSON file
    try {
      const students: Student[] = readJsonFile('Students.json');
      console.log('Returning students from JSON file:', students);
      return NextResponse.json(students);
    } catch (fileError) {
      // If JSON file doesn't exist or is empty, return empty array
      console.log('No students data found, returning empty array');
      return NextResponse.json([]);
    }
  } catch (error) {
    console.error('Error fetching students:', error);
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 });
  }
}