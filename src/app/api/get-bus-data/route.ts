import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth } from '@/lib/security/api-auth';
import { applyRateLimit, createRateLimitId, RateLimits } from '@/lib/security/rate-limiter';
import { handleApiError } from '@/lib/security/safe-error';

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Require authentication
    const auth = await verifyApiAuth(request, ['admin', 'moderator', 'driver', 'student']);
    if (!auth.authenticated) return auth.response;

    // Rate limit
    const rl = applyRateLimit(createRateLimitId(auth.uid, 'get-bus-data'), RateLimits.READ);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rl.headers });
    }

    const { searchParams } = new URL(request.url);
    const busId = searchParams.get('busId');

    if (!busId || typeof busId !== 'string' || busId.length > 100) {
      return NextResponse.json({ error: 'Valid Bus ID is required' }, { status: 400 });
    }

    if (!adminDb) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const busDoc = await adminDb.collection('buses').doc(busId).get();

    if (!busDoc.exists) {
      return NextResponse.json({ error: 'Bus not found' }, { status: 404 });
    }

    const busData = busDoc.data();

    return NextResponse.json({
      success: true,
      data: { busId: busDoc.id, ...busData }
    }, { headers: rl.headers });
  } catch (error: any) {
    console.error('Error fetching bus data:', error);
    return NextResponse.json(handleApiError(error, 'get-bus-data', 'Failed to fetch bus data'), { status: 500 });
  }
}