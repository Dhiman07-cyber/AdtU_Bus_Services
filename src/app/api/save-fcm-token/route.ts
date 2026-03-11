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
 */
export const POST = withSecurity(
  async (request, { auth, body, requestId }) => {
    try {
      const { userUid, token, platform } = body;
      const uid = auth.uid;

      // 1. Authorization: Only allow saving tokens for the authenticated user
      if (userUid !== uid) {
        console.warn(`[${requestId}] Security breach attempt: ${uid} tried to save token for ${userUid}`);
        return NextResponse.json(
          { success: false, error: 'Unauthorized: UID mismatch', requestId },
          { status: 403 }
        );
      }

      // 2. Validate token format (additional check beyond Zod if needed)
      if (!isValidTokenFormat(token)) {
        return NextResponse.json(
          { success: false, error: 'Invalid FCM token format', requestId },
          { status: 400 }
        );
      }

      // 3. Resolve user collection (needed for the hierarchical storage pattern)
      // The withSecurity wrapper provides auth.role, which we can map to collections
      let targetCollection: string | null = null;
      const role = auth.role;

      if (role === 'student') targetCollection = 'students';
      else if (role === 'driver') targetCollection = 'drivers';
      else if (role === 'moderator') targetCollection = 'moderators';
      else if (role === 'admin') targetCollection = 'admins';

      // Fallback: search if role is missing/unknown
      if (!targetCollection) {
        const collectionsToCheck = ['students', 'drivers', 'moderators', 'admins'];
        for (const col of collectionsToCheck) {
          const doc = await adminDb.collection(col).doc(uid).get();
          if (doc.exists) {
            targetCollection = col;
            break;
          }
        }
      }

      if (!targetCollection) {
        console.warn(`[${requestId}] User ${uid} not found in any valid collection`);
        return NextResponse.json({
          success: false,
          error: 'User profile not found. Please complete registration.',
          requestId
        }, { status: 404 });
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

      // 5. Legacy Sync (Backend compatibility)
      // Keeps the top-level field updated for older notification logic
      try {
        await adminDb.collection(targetCollection).doc(uid).set({
          fcmToken: token,
          fcmPlatform: platform || 'web',
          fcmUpdatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (err) {
        console.warn(`[${requestId}] Legacy FCM sync failed (non-critical):`, err);
      }

      console.log(`✅ [${requestId}] FCM token registered for ${uid} in ${targetCollection}`);
      
      return NextResponse.json({ 
        success: true, 
        collection: targetCollection,
        requestId 
      });

    } catch (error: any) {
      console.error(`[${requestId}] Unexpected error in save-fcm-token:`, error);
      return NextResponse.json(
        { success: false, error: 'Internal server error', requestId },
        { status: 500 }
      );
    }
  },
  {
    requiredRoles: [], // Allow any authenticated user
    schema: SaveFCMTokenSchema,
    rateLimit: RateLimits.CREATE // Significant changes to user state
  }
);