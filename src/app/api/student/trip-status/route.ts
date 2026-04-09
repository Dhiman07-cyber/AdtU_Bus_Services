import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { withSecurity } from '@/lib/security/api-security';
import { TripStatusQuerySchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

/**
 * GET /api/student/trip-status
 * 
 * Check if there's an active trip for a given bus.
 * Uses service role key to bypass RLS policies.
 */
export const GET = withSecurity(
    async (request, context /* use context if needed */) => {
        // Extract busId from URL parameters for GET request
        const url = new URL(request.url);
        const busId = url.searchParams.get('busId');

        if (!busId) {
            return NextResponse.json({
                tripActive: false,
                error: 'busId is required',
                tripData: null
            }, { status: 400 });
        }

        // PERF: Use singleton Supabase client instead of creating one per request
        const supabase = getSupabaseServer();

        // Query driver_status for active trips
        const { data, error } = await supabase
            .from('driver_status')
            .select('id, status, bus_id, driver_uid, started_at, last_updated_at')
            .eq('bus_id', busId)
            .in('status', ['on_trip', 'enroute'])
            .maybeSingle();

        if (error) {
            console.error('❌ Error querying driver_status:', error);
            return NextResponse.json({
                tripActive: false,
                error: 'An unexpected error occurred',
                tripData: null
            });
        }

        if (data) {
            console.log(`✅ Active trip found for bus ${busId}:`, {
                status: data.status,
                startedAt: data.started_at
            });

            return NextResponse.json({
                tripActive: true,
                tripData: {
                    status: data.status,
                    driverUid: data.driver_uid,
                    startedAt: data.started_at,
                    lastUpdated: data.last_updated_at
                }
            });
        }

        console.log(`ℹ️ No active trip found for bus ${busId}`);
        return NextResponse.json({
            tripActive: false,
            tripData: null
        });
    },
    {
        requiredRoles: ['student', 'driver', 'admin', 'moderator'],
        schema: TripStatusQuerySchema,
        rateLimit: RateLimits.READ
    }
);
