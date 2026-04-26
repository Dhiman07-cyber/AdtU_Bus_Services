import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getSupabaseServer } from '@/lib/supabase-server';
import { withSecurity } from '@/lib/security/api-security';
import { BusIdSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

// Initialize Supabase client
const supabase = getSupabaseServer();

/**
 * POST /api/student/check-active-trip
 * 
 * Checks if there's an active trip for the student's assigned bus.
 * Parallelizes Supabase (live trip) and Firestore (bus metadata) checks.
 */
export const POST = withSecurity(
  async (request, { body, requestId }) => {
    const { busId } = body as any;

    try {
      console.log(`🔍 [${requestId}] Querying for active trip and bus status for bus: ${busId}`);

      // 1. Parallelize Supabase active trip check and Firestore bus metadata fetch
      const [tripRes, busDoc] = await Promise.all([
        supabase.from('active_trips').select('*').eq('bus_id', busId).eq('status', 'active').maybeSingle(),
        adminDb.collection('buses').doc(busId).get()
      ]);

      if (tripRes.error) {
        console.error(`[${requestId}] Supabase query error:`, tripRes.error);
        return NextResponse.json({ success: false, error: 'Failed to verify trip status', requestId }, { status: 500 });
      }

      const activeTrip = tripRes.data;
      const busStatus = busDoc.exists ? busDoc.data()?.status : null;

      if (activeTrip) {
        return NextResponse.json({
          success: true,
          hasActiveTrip: true,
          tripData: {
            tripId: activeTrip.trip_id,
            ...activeTrip,
            busStatus
          },
          requestId
        });
      }

      return NextResponse.json({
        success: true,
        hasActiveTrip: false,
        tripData: null,
        requestId
      });

    } catch (err) {
      console.error(`[${requestId}] Unexpected error:`, err);
      return NextResponse.json({ success: false, error: 'Internal server error', requestId }, { status: 500 });
    }
  },
  {
    requiredRoles: ['student'],
    schema: BusIdSchema,
    rateLimit: RateLimits.READ,
    allowBodyToken: true
  }
);
