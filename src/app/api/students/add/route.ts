import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth } from '@/lib/security/api-auth';
import { checkRateLimit, RateLimits, createRateLimitId } from '@/lib/security/rate-limiter';
import { calculateRenewalDate } from '@/lib/utils/renewal-utils';
import { getDeadlineConfig } from '@/lib/deadline-config-service';

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
    
    // CRITICAL: Extract session information from application data
    // Students can apply for current year or next year, so we use the sessionInfo from application
    let sessionEndYear: number;
    let sessionStartYear: number;
    let validUntil: string;
    
    if (newStudentData.sessionInfo) {
      // Application data contains proper session information
      sessionStartYear = newStudentData.sessionInfo.sessionStartYear;
      sessionEndYear = newStudentData.sessionInfo.sessionEndYear;
      validUntil = newStudentData.sessionInfo.validUntil;
      
      console.log(`📅 Creating student with session: ${sessionStartYear}-${sessionEndYear}, validUntil: ${validUntil}`);
    } else {
      // Fallback: Only if no sessionInfo is provided (shouldn't happen with proper applications)
      console.warn('⚠️ No sessionInfo provided in student data - using current year fallback');
      const currentYear = new Date().getFullYear();
      sessionStartYear = currentYear;
      sessionEndYear = currentYear;
      
      try {
        const config = await getDeadlineConfig();
        const renewalResult = calculateRenewalDate(null, 1, config);
        validUntil = renewalResult.newValidUntil;
      } catch (configError) {
        console.warn('Could not fetch deadline config, using default validity');
        const fallbackDate = new Date(currentYear, 11, 31, 23, 59, 59, 999);
        validUntil = fallbackDate.toISOString();
      }
    }
    
    const newStudent = {
      ...newStudentData,
      id: studentId,
      sessionStartYear,
      sessionEndYear,
      validUntil
    };

    // Save to Firestore with the role field (server-controlled)
    const studentDocRef = adminDb.doc(`users/${studentId}`);
    await studentDocRef.set({
      ...newStudent,
      uid: studentId,
      role: 'student',
      createdAt: new Date().toISOString(),
      createdBy: auth.uid,
      status: 'active' // Ensure new students start as active
    });
    
    // Also save to students collection for consistency
    const studentsCollectionRef = adminDb.doc(`students/${studentId}`);
    await studentsCollectionRef.set({
      ...newStudent,
      uid: studentId,
      role: 'student',
      createdAt: new Date().toISOString(),
      createdBy: auth.uid,
      status: 'active',
      fullName: newStudentData.name || newStudentData.fullName,
      // Ensure session fields are properly stored
      sessionStartYear,
      sessionEndYear,
      validUntil
    });

    return NextResponse.json(newStudent, { status: 201 });
  } catch (error) {
    console.error('Error adding student:', error);
    return NextResponse.json({ error: 'Failed to add student' }, { status: 500 });
  }
}
