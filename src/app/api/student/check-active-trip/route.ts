import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { createClient } from '@supabase/supabase-js';
import { withSecurity } from '@/lib/security/api-security';
import { BusIdSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * POST /api/student/check-active-trip
 * 
 * Checks if there's an active trip for the student's assigned bus.
 * USES SUPABASE AS AUTHORITATIVE SOURCE for live trips.
 */
export const POST = withSecurity(
  async (request, { body, requestId }) => {
    const { busId } = body as any;

    try {
      console.log(`🔍 [${requestId}] Querying for active trip for bus: ${busId}`);

      // Query Supabase for active trips
      const { data: activeTrip, error } = await supabase
        .from('active_trips')
        .select('*')
        .eq('bus_id', busId)
        .eq('status', 'active')
        .maybeSingle();

      if (error) {
        console.error(`[${requestId}] Supabase query error:`, error);
        return NextResponse.json({ success: false, error: 'Failed to verify trip status', requestId }, { status: 500 });
      }

      if (activeTrip) {
        // Also check bus status from Firestore (primary bus metadata source)
        const busDoc = await adminDb.collection('buses').doc(busId).get();
        let busStatus = null;
        if (busDoc.exists) {
          busStatus = busDoc.data()?.status;
        }

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

