import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { saveToken, isValidTokenFormat } from '@/lib/services/fcm-token-service';
import { withSecurity } from '@/lib/security/api-security';
import { SaveFCMTokenSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

/**
 * POST /api/save-fcm-token
 * 
 * Saves FCM tokens into a subcollection model:
 *   {collection}/{userId}/tokens/{sha256(token)}
 * 
 * Security:
 * - JWT-authenticated (via withSecurity)
 * - UID must match authenticated user (prevents saving tokens for other users)
 * - Role-based collection mapping (no fallback search)
 * - Token format validation
 * - Rate limited
 */
export const POST = withSecurity(
  async (request, { auth, body, requestId }) => {
    const { userUid, token, platform } = body;
    const uid = auth.uid;

    // 1. Authorization: Only allow saving tokens for the authenticated user
    if (userUid !== uid) {
      console.warn(`[${requestId}] UID mismatch: auth=${uid}, body=${userUid}`);
      return NextResponse.json(
        { success: false, error: 'Unauthorized: UID mismatch', requestId },
        { status: 403 }
      );
    }

    // 2. Validate token format
    if (!isValidTokenFormat(token)) {
      return NextResponse.json(
        { success: false, error: 'Invalid FCM token format', requestId },
        { status: 400 }
      );
    }

    // 3. Map role → Firestore collection (no fallback search for security)
    const roleCollectionMap: Record<string, string> = {
      student: 'students',
      driver: 'drivers',
      moderator: 'moderators',
      admin: 'admins',
    };

    const targetCollection = roleCollectionMap[auth.role];
    if (!targetCollection) {
      console.warn(`[${requestId}] Unknown role '${auth.role}' for user ${uid}`);
      return NextResponse.json({
        success: false,
        error: 'Invalid user role. Please contact support.',
        requestId,
      }, { status: 403 });
    }

    // 4. Save token to subcollection (multi-device support)
    const result = await saveToken(uid, targetCollection, token, platform || 'web');

    if (!result.success) {
      console.error(`[${requestId}] FCM Token Service error:`, result.error);
      return NextResponse.json(
        { success: false, error: 'Failed to record device token', requestId },
        { status: 500 }
      );
    }

    // 5. Legacy field sync (backward compatibility with older notification queries)
    try {
      await adminDb.collection(targetCollection).doc(uid).set({
        fcmToken: token,
        fcmPlatform: platform || 'web',
        fcmUpdatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (err) {
      // Non-critical: subcollection is the source of truth
      console.warn(`[${requestId}] Legacy FCM sync failed (non-critical):`, err);
    }

    return NextResponse.json({
      success: true,
      collection: targetCollection,
      requestId,
    });
  },
  {
    requiredRoles: [], // Allow any authenticated user
    schema: SaveFCMTokenSchema,
    rateLimit: RateLimits.CREATE,
  }
);