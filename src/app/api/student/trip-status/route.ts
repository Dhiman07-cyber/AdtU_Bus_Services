/**
 * GET /api/student/trip-status
 * 
 * Check if there's an active trip for a given bus.
 * Uses service role key to bypass RLS policies.
 * 
 * Query Params: busId (required)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Helper to create a consistent JSON response
function createJsonResponse(data: object, status: number = 200): NextResponse {
    return new NextResponse(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
        },
    });
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const busId = searchParams.get('busId');

        if (!busId) {
            return createJsonResponse(
                { tripActive: false, error: 'Missing required parameter: busId' },
                400
            );
        }

        // Initialize Supabase with service role key (bypasses RLS)
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.error('❌ Missing Supabase credentials');
            return createJsonResponse(
                { tripActive: false, error: 'Server configuration error' },
                500
            );
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Query driver_status for active trips
        const { data, error } = await supabase
            .from('driver_status')
            .select('id, status, bus_id, driver_uid, started_at, last_updated_at')
            .eq('bus_id', busId)
            .in('status', ['on_trip', 'enroute'])
            .maybeSingle();

        if (error) {
            console.error('❌ Error querying driver_status:', error);
            return createJsonResponse(
                { tripActive: false, error: error.message, tripData: null },
                200 // Return 200 with error info for graceful degradation
            );
        }

        if (data) {
            console.log(`✅ Active trip found for bus ${busId}:`, {
                status: data.status,
                startedAt: data.started_at
            });

            return createJsonResponse({
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
        return createJsonResponse({
            tripActive: false,
            tripData: null
        });

    } catch (error: any) {
        console.error('❌ Error in trip-status API:', error);
        return createJsonResponse(
            { tripActive: false, error: error?.message || 'Unknown error', tripData: null },
            200 // Graceful degradation
        );
    }
}
