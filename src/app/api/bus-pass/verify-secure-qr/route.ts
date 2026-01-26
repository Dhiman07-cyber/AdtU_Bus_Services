/**
 * API Route: Verify Secure QR Token
 * POST /api/bus-pass/verify-secure-qr
 * 
 * Verifies an encrypted QR token and returns student data.
 * 
 * SECURITY FEATURES:
 * - Decrypts and validates AES-256-GCM encrypted tokens
 * - Verifies HMAC signature to detect tampering
 * - Checks token expiration
 * - Rate limiting for abuse prevention
 * - Driver authentication required
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { decryptQRCodeData, quickValidateQRToken } from '@/lib/security/encryption.service';
import { checkRateLimit, RateLimits, createRateLimitId } from '@/lib/security/rate-limiter';

// Helper to convert validUntil to Date
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
    } catch {
        return null;
    }
}

export async function POST(request: NextRequest) {
    try {
        // Verify driver authentication
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

        const scannerUid = decodedToken.uid;

        // Verify caller role (driver, admin, or moderator)
        const userDoc = await adminDb.collection('users').doc(scannerUid).get();
        const userData = userDoc.data();
        const allowedRoles = ['driver', 'admin', 'moderator'];

        if (!userData || !allowedRoles.includes(userData.role)) {
            // Fallback check for drivers collection
            const driverDoc = await adminDb.collection('drivers').doc(scannerUid).get();
            if (!driverDoc.exists) {
                console.warn(`Unauthorized user attempted to verify secure QR: ${scannerUid}`);
                return NextResponse.json(
                    { status: 'invalid', message: 'Insufficient permissions to verify QR codes' },
                    { status: 403 }
                );
            }
        }

        // Rate limiting
        const rateLimitId = createRateLimitId(scannerUid, 'verify-secure-qr');
        const rateCheck = checkRateLimit(
            rateLimitId,
            RateLimits.BUS_PASS_VERIFY.maxRequests,
            RateLimits.BUS_PASS_VERIFY.windowMs
        );

        if (!rateCheck.allowed) {
            return NextResponse.json(
                {
                    status: 'rate_limited',
                    message: 'Too many scan requests. Please wait.',
                    resetIn: rateCheck.resetIn
                },
                { status: 429 }
            );
        }

        // Parse request
        const body = await request.json();
        const { secureToken, scannerBusId } = body;

        if (!secureToken) {
            return NextResponse.json(
                { status: 'invalid', message: 'QR token is required' },
                { status: 400 }
            );
        }

        // Quick validation (HMAC check only - fast)
        if (!quickValidateQRToken(secureToken)) {
            console.warn(`Invalid QR token signature detected by scanner: ${scannerUid}`);
            return NextResponse.json({
                status: 'invalid',
                message: 'Invalid or tampered QR code',
                suspicious: true
            });
        }

        // Full decryption and validation
        const qrPayload = decryptQRCodeData(secureToken);

        if (!qrPayload) {
            return NextResponse.json({
                status: 'expired',
                message: 'QR code has expired. Please generate a new one.',
                isAssigned: false,
                sessionActive: false
            });
        }

        // Fetch student data using decrypted UID
        const studentDoc = await adminDb.collection('students').doc(qrPayload.uid).get();

        if (!studentDoc.exists) {
            return NextResponse.json({
                status: 'invalid',
                message: 'Student not found. This QR code is not registered.',
                studentData: null,
                isAssigned: false,
                sessionActive: false
            });
        }

        const studentData = studentDoc.data();

        // Check session validity
        const validUntilDate = getValidUntilDate(studentData?.validUntil);
        const now = new Date();

        let sessionActive = true;
        if (validUntilDate && validUntilDate < now) {
            sessionActive = false;
        }

        // Check student status
        const isStudentActive = studentData?.status === 'active';

        // Get assigned bus
        const assignedBusId = studentData?.assignedBus || studentData?.busId || studentData?.currentBusId;

        // Build response
        const responseData = {
            status: sessionActive && isStudentActive ? 'success' : 'session_expired',
            message: sessionActive && isStudentActive ? 'Student verified (Secure)' : 'Student session expired or inactive',
            studentData: {
                uid: qrPayload.uid,
                fullName: studentData?.fullName || studentData?.name,
                enrollmentId: studentData?.enrollmentId || qrPayload.enrollmentId,
                phone: studentData?.phone || studentData?.mobileNumber,
                phoneNumber: studentData?.phoneNumber || studentData?.phone,
                gender: studentData?.gender,
                profilePhotoUrl: studentData?.profilePhotoUrl || studentData?.photoURL,
                assignedBus: assignedBusId,
                busId: assignedBusId,
                assignedShift: studentData?.assignedShift || studentData?.shift,
                shift: studentData?.assignedShift || studentData?.shift,
                validUntil: validUntilDate?.toISOString(),
                status: studentData?.status
            },
            isAssigned: !!assignedBusId,
            sessionActive: sessionActive && isStudentActive,
            tokenInfo: {
                issuedAt: new Date(qrPayload.issuedAt).toISOString(),
                expiresAt: new Date(qrPayload.expiresAt).toISOString(),
                version: qrPayload.version
            },
            verifiedAt: new Date().toISOString(),
            verifiedBy: scannerUid,
            secureVerification: true // Flag indicating this used encrypted QR
        };

        console.log('✅ Secure QR verified:', {
            studentUid: qrPayload.uid,
            scannerUid,
            sessionActive,
            tokenAge: Date.now() - qrPayload.issuedAt
        });

        return NextResponse.json(responseData);

    } catch (error: any) {
        console.error('Error in verify secure QR API:', error);
        return NextResponse.json(
            {
                status: 'invalid',
                message: error.message || 'Verification failed'
            },
            { status: 500 }
        );
    }
}
