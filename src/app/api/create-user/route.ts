/**
 * POST /api/create-user — Create a new user (Admin/Moderator only)
 * 
 * SECURITY HARDENING (March 2026):
 *  - Added Firebase token authentication (admin/moderator only)
 *  - Removed insecure client SDK fallback with placeholder UIDs
 *  - Removed JSON file read/write fallback (Firestore-only)
 *  - Removed console.log of full user data
 *  - Added input validation and sanitization
 *  - Uses centralized firebase-admin module
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth } from '@/lib/security/api-auth';
import { applyRateLimit, createRateLimitId, RateLimits } from '@/lib/security/rate-limiter';
import { handleApiError } from '@/lib/security/safe-error';

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Only admin or moderator can create users
    const auth = await verifyApiAuth(request, ['admin', 'moderator']);
    if (!auth.authenticated) return auth.response;

    // Rate limit
    const rl = applyRateLimit(createRateLimitId(auth.uid, 'create-user'), RateLimits.CREATE);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rl.headers });
    }

    if (!adminAuth || !adminDb) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const userData = await request.json();

    const {
      email,
      name,
      role,
      phone,
      alternatePhone,
      profilePhotoUrl,
      enrollmentId,
      gender,
      age,
      faculty,
      department,
      parentName,
      parentPhone,
      dob,
      licenseNumber,
      joiningDate,
      assignedFaculty,
      permissions,
      aadharNumber,
      routeId,
      busAssigned
    } = userData;

    // Input validation
    if (!email || typeof email !== 'string' || email.length > 254) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (!name || typeof name !== 'string' || name.length > 200) {
      return NextResponse.json({ error: 'Valid name is required (max 200 chars)' }, { status: 400 });
    }
    if (!role || !['student', 'driver', 'moderator'].includes(role)) {
      return NextResponse.json({ error: 'Valid role is required (student, driver, or moderator)' }, { status: 400 });
    }
    if (profilePhotoUrl && typeof profilePhotoUrl !== 'string') {
      return NextResponse.json({ error: 'Profile photo URL must be a string' }, { status: 400 });
    }

    // SECURITY: Moderators can only create students and drivers
    if (auth.role === 'moderator' && role === 'moderator') {
      return NextResponse.json({ error: 'Moderators cannot create other moderators' }, { status: 403 });
    }

    // Look up the user in Firebase Auth (they must have signed in via Google first)
    let uid: string;
    try {
      const userRecord = await adminAuth.getUserByEmail(email);
      uid = userRecord.uid;
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        return NextResponse.json({
          error: 'User must sign in with Google first before being added to the system'
        }, { status: 400 });
      }
      throw error;
    }

    // Prepare user data for Firestore based on role
    const baseUserData: Record<string, any> = {
      uid,
      email: email.trim(),
      name: name.trim().substring(0, 200),
      role,
      phone: phone ? String(phone).substring(0, 20) : null,
      alternatePhone: alternatePhone ? String(alternatePhone).substring(0, 20) : null,
      profilePhotoUrl: profilePhotoUrl || null,
      createdAt: new Date().toISOString(),
      routeId: routeId || null,
    };

    let firestoreUserData: Record<string, any> = { ...baseUserData };

    // Add role-specific fields with sanitization
    if (role === 'student') {
      firestoreUserData = {
        ...firestoreUserData,
        enrollmentId: enrollmentId ? String(enrollmentId).substring(0, 50) : null,
        gender: gender ? String(gender).substring(0, 20) : null,
        age: age ? parseInt(age) : null,
        faculty: faculty ? String(faculty).substring(0, 100) : null,
        department: department ? String(department).substring(0, 100) : null,
        parentName: parentName ? String(parentName).substring(0, 200) : null,
        parentPhone: parentPhone ? String(parentPhone).substring(0, 20) : null,
        waitingFlag: false,
        busAssigned: busAssigned || null,
      };
    } else if (role === 'driver') {
      firestoreUserData = {
        ...firestoreUserData,
        dob: dob || null,
        licenseNumber: licenseNumber ? String(licenseNumber).substring(0, 50) : null,
        joiningDate: joiningDate || null,
        assignedBus: busAssigned || null,
      };
    } else if (role === 'moderator') {
      firestoreUserData = {
        ...firestoreUserData,
        dob: dob || null,
        assignedFaculty: assignedFaculty ? String(assignedFaculty).substring(0, 100) : null,
        permissions: permissions ? String(permissions).split(',').map((p: string) => p.trim()).filter(Boolean) : [],
        joiningDate: joiningDate || null,
        aadharNumber: aadharNumber ? String(aadharNumber).substring(0, 20) : null,
      };
    }

    // Create user document in Firestore
    await adminDb.collection('users').doc(uid).set(firestoreUserData);

    console.log(`[create-user] User created: role=${role}, uid=${uid}`);

    return NextResponse.json({ success: true, uid }, { headers: rl.headers });
  } catch (error: any) {
    console.error('[create-user] Error:', error?.message);
    return NextResponse.json(
      handleApiError(error, 'create-user', 'Failed to create user'),
      { status: 500 }
    );
  }
}