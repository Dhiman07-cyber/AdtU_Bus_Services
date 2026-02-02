/**
 * POST /api/driver/end-trip
 * 
 * End a trip cleanly, releasing the lock.
 * 
 * Request body:
 * - idToken: string (Firebase ID token)
 * - tripId: string
 * - busId: string
 * 
 * Response:
 * - success: boolean
 * - reason?: string (on failure)
 */

import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';
import { tripLockService } from '@/lib/services/trip-lock-service';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: Request) {
    const startTime = Date.now();

    try {
        const body = await request.json();
        const { idToken, tripId, busId } = body;

        // Validate required fields
        if (!idToken || !busId) {
            return NextResponse.json(
                { error: 'Missing required fields: idToken, busId' },
                { status: 400 }
            );
        }

        // Verify Firebase token
        if (!auth) {
            return NextResponse.json(
                { error: 'Firebase Admin not initialized' },
                { status: 500 }
            );
        }

        const decodedToken = await auth.verifyIdToken(idToken);
        const driverId = decodedToken.uid;

        // Verify user is a driver
        const userDoc = await adminDb.collection('users').doc(driverId).get();
        if (!userDoc.exists || userDoc.data()?.role !== 'driver') {
            return NextResponse.json(
                { error: 'User is not authorized as a driver' },
                { status: 403 }
            );
        }

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

        // End trip using TripLockService
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

            // Delete waiting flags
            await supabase
                .from('waiting_flags')
                .delete()
                .eq('bus_id', busId)
                .in('status', ['raised', 'acknowledged']);

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

    } catch (error: any) {
        console.error('❌ Error ending trip:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to end trip' },
            { status: 500 }
        );
    }
}
