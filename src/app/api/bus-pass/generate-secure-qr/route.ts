/**
 * API Route: Generate Secure QR Token
 * POST /api/bus-pass/generate-secure-qr
 * 
 * Generates an encrypted, time-limited QR token for student verification.
 * 
 * SECURITY FEATURES:
 * - AES-256-GCM encrypted payload
 * - HMAC signature for integrity
 * - Time-limited tokens (24 hours)
 * - Rate limiting
 * - Authentication required
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { encryptQRCodeData } from '@/lib/security/encryption.service';
import { checkRateLimit, RateLimits, createRateLimitId } from '@/lib/security/rate-limiter';

export async function POST(request: NextRequest) {
    try {
        // Verify authentication
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return NextResponse.json(
                { success: false, error: 'Authentication required' },
                { status: 401 }
            );
        }

        let decodedToken;
        try {
            decodedToken = await adminAuth.verifyIdToken(token);
        } catch (authError) {
            console.error('Auth verification failed:', authError);
            return NextResponse.json(
                { success: false, error: 'Invalid or expired authentication' },
                { status: 401 }
            );
        }

        const userUid = decodedToken.uid;

        // Rate limiting
        const rateLimitId = createRateLimitId(userUid, 'generate-qr');
        const rateCheck = checkRateLimit(
            rateLimitId,
            RateLimits.BUS_PASS_GENERATE.maxRequests,
            RateLimits.BUS_PASS_GENERATE.windowMs
        );

        if (!rateCheck.allowed) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Too many QR generation requests. Please wait.',
                    resetIn: rateCheck.resetIn
                },
                { status: 429 }
            );
        }

        // Parse request body
        const body = await request.json();
        const { studentUid } = body;

        // Security: Only allow generating QR for self or if admin/moderator
        const targetUid = studentUid || userUid;

        if (targetUid !== userUid) {
            // Check if user is admin/moderator
            const userDoc = await adminDb.collection('users').doc(userUid).get();
            const userData = userDoc.data();

            if (!userData || !['admin', 'moderator'].includes(userData.role)) {
                return NextResponse.json(
                    { success: false, error: 'Unauthorized to generate QR for other users' },
                    { status: 403 }
                );
            }
        }

        // Fetch student data
        const studentDoc = await adminDb.collection('students').doc(targetUid).get();

        if (!studentDoc.exists) {
            return NextResponse.json(
                { success: false, error: 'Student not found' },
                { status: 404 }
            );
        }

        const studentData = studentDoc.data();

        // Check if student is active
        if (studentData?.status !== 'active') {
            return NextResponse.json(
                { success: false, error: 'Student account is not active' },
                { status: 403 }
            );
        }

        // Check validity
        const validUntil = studentData?.validUntil;
        let validUntilDate: Date | null = null;

        if (validUntil) {
            validUntilDate = validUntil.toDate ? validUntil.toDate() : new Date(validUntil);

            if (validUntilDate && validUntilDate < new Date()) {
                return NextResponse.json(
                    {
                        success: false,
                        error: 'Bus pass has expired. Please renew your service.',
                        expiredAt: validUntilDate.toISOString()
                    },
                    { status: 403 }
                );
            }
        }

        // Generate encrypted QR token
        const secureToken = encryptQRCodeData(targetUid, {
            enrollmentId: studentData?.enrollmentId,
            name: studentData?.fullName || studentData?.name,
            busId: studentData?.busId || studentData?.assignedBusId
        });

        console.log(`✅ Secure QR token generated for student: ${targetUid}`);

        return NextResponse.json({
            success: true,
            token: secureToken,
            expiresIn: 24 * 60 * 60 * 1000, // 24 hours in ms
            studentInfo: {
                name: studentData?.fullName || studentData?.name,
                enrollmentId: studentData?.enrollmentId,
                validUntil: validUntilDate?.toISOString()
            }
        });

    } catch (error: any) {
        console.error('Error generating secure QR:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to generate QR code' },
            { status: 500 }
        );
    }
}
