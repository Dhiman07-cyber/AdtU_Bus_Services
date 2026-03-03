import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth } from '@/lib/security/api-auth';

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
  [key: string]: any;
}

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Require admin or moderator authentication
    const auth = await verifyApiAuth(request, ['admin', 'moderator']);
    if (!auth.authenticated) return auth.response;

    if (!adminDb) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const studentsRef = adminDb.collection('students');
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

    return NextResponse.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 });
  }
}