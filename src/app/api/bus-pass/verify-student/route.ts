/**
 * API Route: Verify Student by UID
 * POST /api/bus-pass/verify-student
 * 
 * Simplified verification using student's Firestore UID directly.
 * No temporary tokens - the student UID is the single source of truth.
 * 
 * SECURITY: 
 * - Requires driver authentication
 * - Rate limiting applied
 * - Server-side validation only (no client-side trust)
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { checkRateLimit, RateLimits, createRateLimitId } from '@/lib/security/rate-limiter';

// Helper function to safely convert validUntil to Date
function getValidUntilDate(validUntil: any): Date | null {
    if (!validUntil) return null;

    try {
        if (validUntil.toDate && typeof validUntil.toDate === 'function') {
            return validUntil.toDate();
        }
        if (validUntil instanceof Date) {
            return validUntil;
        }
        return new Date(validUntil);
    } catch (error) {
        console.warn('Error converting validUntil to Date:', error);
        return null;
    }
}

export async function POST(request: NextRequest) {
    try {
        // SECURITY: Verify driver authentication
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return NextResponse.json(
                { status: 'invalid', message: 'Authentication required' },
                { status: 401 }
            );
        }

        let decodedToken;
        try {
            decodedToken = await adminAuth.verifyIdToken(token);
        } catch (authError) {
            console.error('Auth verification failed:', authError);
            return NextResponse.json(
                { status: 'invalid', message: 'Invalid or expired authentication' },
                { status: 401 }
            );
        }

        const driverUid = decodedToken.uid;

        // SECURITY: Verify caller is a driver, admin, or moderator
        const userDoc = await adminDb.collection('users').doc(driverUid).get();
        const userData = userDoc.data();
        const allowedRoles = ['driver', 'admin', 'moderator'];

        if (!userData || !allowedRoles.includes(userData.role)) {
            // Check legacy drivers collection if not found in users or role mismatch
            const driverDoc = await adminDb.collection('drivers').doc(driverUid).get();
            if (!driverDoc.exists) {
                console.warn(`Unauthorized user attempted to verify student: ${driverUid}`);
                return NextResponse.json(
                    { status: 'invalid', message: 'Only authorized personnel can verify students' },
                    { status: 403 }
                );
            }
        }

        // SECURITY: Rate limiting (60 scans per minute - high volume for bus operations)
        const rateLimitId = createRateLimitId(driverUid, 'student-verify');
        const rateCheck = checkRateLimit(rateLimitId, RateLimits.BUS_PASS_VERIFY.maxRequests, RateLimits.BUS_PASS_VERIFY.windowMs);
        if (!rateCheck.allowed) {
            console.warn(`Rate limit exceeded for student verification: ${driverUid}`);
            return NextResponse.json(
                { status: 'rate_limited', message: 'Too many scan requests. Please wait.' },
                { status: 429 }
            );
        }

        const body = await request.json();
        const { studentUid, scannerBusId } = body;

        if (!studentUid) {
            return NextResponse.json(
                { status: 'invalid', message: 'Student ID is required' },
                { status: 400 }
            );
        }

        // Fetch student data - this is the ONLY Firestore read for verification
        let studentData: any = null;
        let studentDoc;

        try {
            studentDoc = await adminDb.collection('students').doc(studentUid).get();

            if (studentDoc.exists) {
                studentData = studentDoc.data();
            } else {
                // Try users collection as fallback
                studentDoc = await adminDb.collection('users').doc(studentUid).get();
                if (studentDoc.exists && studentDoc.data()?.role === 'student') {
                    studentData = studentDoc.data();
                }
            }
        } catch (dbError: any) {
            console.error('Database access error (likely invalid student ID):', dbError);
            return NextResponse.json({
                status: 'invalid',
                message: 'Invalid Student ID format',
                studentData: null,
                isAssigned: false,
                sessionActive: false
            }, { status: 400 });
        }

        if (!studentData) {
            return NextResponse.json({
                status: 'invalid',
                message: 'Student not found. This QR code is not registered.',
                studentData: null,
                isAssigned: false,
                sessionActive: false
            });
        }

        // Check session validity (validUntil date)
        const validUntil = studentData.validUntil;
        const validUntilDate = getValidUntilDate(validUntil);
        const now = new Date();

        let sessionActive = true;
        if (validUntilDate && validUntilDate < now) {
            sessionActive = false;
        }

        // Check student status
        const isStudentActive = studentData.status === 'active';

        // Check bus assignment (optional - any driver can verify any student)
        const assignedBusId = studentData.assignedBus || studentData.busId || studentData.currentBusId;

        // Build response with student data for driver display
        const responseData = {
            status: sessionActive && isStudentActive ? 'success' : 'session_expired',
            message: sessionActive && isStudentActive ? 'Student verified' : 'Student session expired or inactive',
            studentData: {
                uid: studentUid,
                fullName: studentData.fullName || studentData.name,
                enrollmentId: studentData.enrollmentId || studentData.enrollmentNo,
                phone: studentData.phone || studentData.mobileNumber || studentData.contactNumber,
                phoneNumber: studentData.phoneNumber || studentData.phone || studentData.mobileNumber,
                mobileNumber: studentData.mobileNumber || studentData.phone,
                gender: studentData.gender,
                profilePhotoUrl: studentData.profilePhotoUrl || studentData.photoURL || studentData.avatar,
                assignedBus: assignedBusId,
                busId: assignedBusId,
                assignedShift: studentData.assignedShift || studentData.shift,
                shift: studentData.assignedShift || studentData.shift,
                validUntil: validUntilDate ? validUntilDate.toISOString() : undefined,
                status: studentData.status
            },
            isAssigned: !!assignedBusId,
            sessionActive: sessionActive && isStudentActive,
            verifiedAt: new Date().toISOString(),
            verifiedBy: driverUid
        };

        console.log('✅ Student verified:', {
            studentUid,
            driverUid,
            sessionActive,
            isStudentActive,
            assignedBusId
        });

        return NextResponse.json(responseData);

    } catch (error: any) {
        console.error('Error in verify student API:', error);
        return NextResponse.json(
            {
                status: 'invalid',
                message: error.message || 'Internal server error'
            },
            { status: 500 }
        );
    }
}
