import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth } from '@/lib/security/api-auth';
import { checkRateLimit, RateLimits, createRateLimitId } from '@/lib/security/rate-limiter';

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Require admin or moderator authentication
    const auth = await verifyApiAuth(request, ['admin', 'moderator']);
    if (!auth.authenticated) return auth.response;

    // SECURITY: Rate limit
    const rateLimitId = createRateLimitId(auth.uid, 'students-add');
    const rateCheck = checkRateLimit(rateLimitId, RateLimits.CREATE.maxRequests, RateLimits.CREATE.windowMs);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait.' },
        { status: 429 }
      );
    }

    const newStudentData = await request.json();

    // SECURITY: Validate required fields
    if (!newStudentData.name || !newStudentData.email) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      );
    }

    // SECURITY: Sanitize - prevent role injection
    delete newStudentData.role;
    delete newStudentData.uid;

    if (!adminDb) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    // Generate a unique ID
    const studentId = Date.now().toString();
    const newStudent = {
      ...newStudentData,
      id: studentId
    };

    // Save to Firestore with the role field (server-controlled)
    const studentDocRef = adminDb.doc(`users/${studentId}`);
    await studentDocRef.set({
      ...newStudent,
      uid: studentId,
      role: 'student',
      createdAt: new Date().toISOString(),
      createdBy: auth.uid,
    });

    return NextResponse.json(newStudent, { status: 201 });
  } catch (error) {
    console.error('Error adding student:', error);
    return NextResponse.json({ error: 'Failed to add student' }, { status: 500 });
  }
}
