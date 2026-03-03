import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth } from '@/lib/security/api-auth';
import { checkRateLimit, RateLimits, createRateLimitId } from '@/lib/security/rate-limiter';
import { handleApiError } from '@/lib/security/safe-error';

/**
 * SECURITY: Fields that are NEVER allowed to be updated by this endpoint.
 * These can only be changed through dedicated, secured workflows.
 */
const BLOCKED_FIELDS = [
  'role',           // Privilege escalation prevention
  'uid',            // Identity change prevention
  'firstAdmin',     // Admin flag protection
  'createdAt',      // Audit trail preservation
  'email',          // Email changes go through Firebase Auth
  'busFeeVersion',  // Internal field
];

/**
 * POST /api/update-user
 * 
 * SECURITY: Requires admin or moderator authentication.
 * Blocks dangerous field updates to prevent privilege escalation.
 */
export async function POST(request: NextRequest) {
  try {
    // SECURITY: Verify authentication and required role
    const auth = await verifyApiAuth(request, ['admin', 'moderator']);
    if (!auth.authenticated) return auth.response;

    // SECURITY: Rate limit by user
    const rateLimitId = createRateLimitId(auth.uid, 'update-user');
    const rateCheck = checkRateLimit(rateLimitId, RateLimits.UPDATE.maxRequests, RateLimits.UPDATE.windowMs);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please wait.' },
        { status: 429 }
      );
    }

    const userData = await request.json();
    const { uid, ...updateData } = userData;

    // Validate required input
    if (!uid || typeof uid !== 'string' || uid.length > 128) {
      return NextResponse.json(
        { success: false, error: 'Valid User ID is required' },
        { status: 400 }
      );
    }

    // SECURITY: Strip blocked fields to prevent privilege escalation
    const sanitizedData: Record<string, any> = {};
    for (const [key, value] of Object.entries(updateData)) {
      if (BLOCKED_FIELDS.includes(key)) {
        console.warn(`⚠️ [SECURITY] Blocked field "${key}" stripped from update request by ${auth.uid}`);
        continue;
      }
      sanitizedData[key] = value;
    }

    if (Object.keys(sanitizedData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    if (!adminDb) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Add audit metadata
    sanitizedData.updatedAt = new Date().toISOString();
    sanitizedData.lastUpdatedBy = auth.uid;

    // Update user document in Firestore
    await adminDb.collection('users').doc(uid).update(sanitizedData);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    return NextResponse.json(
      handleApiError(error, 'update-user', 'Failed to update user'),
      { status: 500 }
    );
  }
}