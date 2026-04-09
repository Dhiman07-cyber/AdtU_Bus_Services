import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { verifyApiAuth } from '@/lib/security/api-auth';
import { applyRateLimit, createRateLimitId, RateLimits } from '@/lib/security/rate-limiter';
import { handleApiError } from '@/lib/security/safe-error';

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
  [key: string]: any;
}

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Only admin can list all moderators
    const auth = await verifyApiAuth(request, ['admin']);
    if (!auth.authenticated) return auth.response;

    // Rate limit
    const rl = await applyRateLimit(createRateLimitId(auth.uid, 'moderators-list'), RateLimits.ADMIN);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rl.headers });
    }

    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

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

    return NextResponse.json(moderators, { headers: rl.headers });
  } catch (error) {
    console.error('Error fetching moderators:', error);
    return NextResponse.json(handleApiError(error, 'moderators-get', 'Failed to fetch moderators'), { status: 500 });
  }
}