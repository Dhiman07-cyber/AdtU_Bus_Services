/**
 * POST /api/update-profile-photo — Update User Profile Photo
 * ───────────────────────────────────────────────────────────
 * Updates the profilePhotoUrl in Firestore and deletes the old Cloudinary
 * image via the SDK.
 *
 * SECURITY HARDENING (March 2026):
 *  - Uses centralised cloudinary-server module (no more duplicate config)
 *  - Deletes old images via SDK (no api_secret in form data)
 *  - Rate-limited
 *  - Input validation on targetType
 */

import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { extractPublicId, deleteAsset } from '@/lib/cloudinary-server';
import { checkRateLimit, createRateLimitId } from '@/lib/security/rate-limiter';

export async function POST(request: Request) {
    try {
        const { idToken, targetType, targetId, newImageUrl, oldImageUrl } =
            await request.json();

        // Validate required input
        if (!idToken || !targetType || !targetId || !newImageUrl) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        'Missing required fields: idToken, targetType, targetId, newImageUrl',
                },
                { status: 400 }
            );
        }

        // Validate target type
        if (!['student', 'driver', 'moderator'].includes(targetType)) {
            return NextResponse.json(
                { success: false, error: 'Invalid target type' },
                { status: 400 }
            );
        }

        if (!adminAuth || !adminDb) {
            return NextResponse.json(
                { success: false, error: 'Server SDK not available' },
                { status: 500 }
            );
        }

        // ── 1. Verify Firebase token ──────────────────────────────────────────
        let decodedToken;
        try {
            decodedToken = await adminAuth.verifyIdToken(idToken);
        } catch {
            return NextResponse.json(
                { success: false, error: 'Invalid or expired token' },
                { status: 401 }
            );
        }

        const requesterUid = decodedToken.uid;

        // ── 2. Rate limiting ──────────────────────────────────────────────────
        const rlId = createRateLimitId(requesterUid, 'update-profile-photo');
        const rl = checkRateLimit(rlId, 5, 60_000);
        if (!rl.allowed) {
            return NextResponse.json(
                { success: false, error: 'Too many requests. Please wait.' },
                { status: 429 }
            );
        }

        // ── 3. Authorization check ────────────────────────────────────────────
        const userDoc = await adminDb.collection('users').doc(requesterUid).get();
        if (!userDoc.exists) {
            return NextResponse.json(
                { success: false, error: 'User not found' },
                { status: 404 }
            );
        }

        const requesterRole = userDoc.data()?.role;
        let isAuthorized = false;

        if (requesterRole === 'admin') {
            isAuthorized = true;
        } else if (requesterRole === 'moderator') {
            isAuthorized =
                ['student', 'driver'].includes(targetType) ||
                (targetType === 'moderator' && targetId === requesterUid);
        } else if (
            requesterRole === 'driver' &&
            targetType === 'driver' &&
            targetId === requesterUid
        ) {
            isAuthorized = true;
        }

        if (!isAuthorized) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized to update this profile' },
                { status: 403 }
            );
        }

        // ── 4. Get existing document ──────────────────────────────────────────
        const collectionName =
            targetType === 'student'
                ? 'students'
                : targetType === 'driver'
                    ? 'drivers'
                    : 'moderators';

        const targetDoc = await adminDb
            .collection(collectionName)
            .doc(targetId)
            .get();
        if (!targetDoc.exists) {
            return NextResponse.json(
                { success: false, error: `${targetType} not found` },
                { status: 404 }
            );
        }

        const currentData = targetDoc.data();
        const currentImageUrl = oldImageUrl || currentData?.profilePhotoUrl;

        // ── 5. Delete old Cloudinary image via SDK ────────────────────────────
        // SECURITY: Uses SDK instead of sending api_secret in a form.
        if (currentImageUrl && currentImageUrl !== newImageUrl) {
            const publicId = extractPublicId(currentImageUrl);
            if (publicId) {
                await deleteAsset(publicId);
                console.log(`✅ Deleted old profile photo: ${publicId}`);
            }
        }

        // ── 6. Update Firestore ───────────────────────────────────────────────
        await adminDb.collection(collectionName).doc(targetId).update({
            profilePhotoUrl: newImageUrl,
            updatedAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({
            success: true,
            message: 'Profile photo updated successfully',
        });
    } catch (error: any) {
        console.error('Error updating profile photo:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to update profile photo' },
            { status: 500 }
        );
    }
}
