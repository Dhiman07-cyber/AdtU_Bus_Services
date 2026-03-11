/**
 * POST /api/driver/end-trip
 * 
 * End a trip cleanly, releasing the lock.
 * 
 * Request body:
 * - tripId?: string
 * - busId: string
 * 
 * Response:
 * - success: boolean
 * - reason?: string (on failure)
 */

import { NextResponse } from 'next/server';
import { tripLockService } from '@/lib/services/trip-lock-service';
import { createClient } from '@supabase/supabase-js';
import { withSecurity } from '@/lib/security/api-security';
import { EndTripSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

export const POST = withSecurity(
    async (request, { auth, body }) => {
        const startTime = Date.now();
        const { tripId, busId } = body as any;
        const driverId = auth.uid;

        console.log(`🏁 Ending trip for driver ${driverId}, bus ${busId}...`);

        // Get trip ID if not provided
        let activeTripId = tripId;
        if (!activeTripId) {
            const activeTrip = await tripLockService.getActiveTrip(busId);
            if (activeTrip) {
                activeTripId = activeTrip.trip_id;
            } else {
                console.warn('No active trip found for bus:', busId);
            }
        }

        // End trip using TripLock सर्विस
        if (activeTripId) {
            const result = await tripLockService.endTrip(
                activeTripId,
                driverId,
                busId
            );

            if (!result.success) {
                console.error('Error ending trip:', result.reason);
            }
        }

        // Initialize Supabase for cleanup
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (supabaseUrl && supabaseKey) {
            const supabase = createClient(supabaseUrl, supabaseKey);

            // Delete driver_status row completely
            await supabase
                .from('driver_status')
                .delete()
                .eq('bus_id', busId);

            // Delete bus_locations for this bus
            await supabase
                .from('bus_locations')
                .delete()
                .eq('bus_id', busId);

            // Delete all waiting flags for this bus
            await supabase
                .from('waiting_flags')
                .delete()
                .eq('bus_id', busId);

            // Delete driver location updates for this driver & bus
            await supabase
                .from('driver_location_updates')
                .delete()
                .eq('driver_uid', driverId)
                .eq('bus_id', busId);

            // Broadcast trip end
            const channels = [
                `trip-status-${busId}`,
                `bus_${busId}_students`,
                `bus_location_${busId}`
            ];

            const payload = {
                busId,
                tripId: activeTripId,
                event: 'trip_ended',
                timestamp: new Date().toISOString()
            };

            for (const channelName of channels) {
                const channel = supabase.channel(channelName);
                await channel.send({
                    type: 'broadcast',
                    event: 'trip_ended',
                    payload
                });
            }
        }

        const elapsed = Date.now() - startTime;
        console.log(`✅ Trip ended successfully in ${elapsed}ms`);

        return NextResponse.json({
            success: true,
            tripId: activeTripId,
            busId,
            timestamp: new Date().toISOString(),
            processingTimeMs: elapsed
        });
    },
    {
        requiredRoles: ['driver', 'admin'],
        schema: EndTripSchema,
        rateLimit: RateLimits.CREATE, // Prevent spam
        allowBodyToken: true
    }
);
