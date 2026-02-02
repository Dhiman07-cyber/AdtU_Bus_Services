/**
 * POST /api/driver/start-trip
 * 
 * Start a trip with exclusive lock acquisition.
 * 
 * Request body:
 * - idToken: string (Firebase ID token)
 * - busId: string
 * - routeId: string
 * - shift: 'morning' | 'evening' | 'both'
 * 
 * Response:
 * - success: boolean
 * - tripId?: string (on success)
 * - reason?: string (on failure)
 */

import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';
import { tripLockService } from '@/lib/services/trip-lock-service';
import { createClient } from '@supabase/supabase-js';

// Generate UUID for trip ID
function generateTripId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export async function POST(request: Request) {
    const startTime = Date.now();

    try {
        const body = await request.json();
        const { idToken, busId, routeId, shift } = body;

        // Validate required fields
        if (!idToken || !busId || !routeId) {
            return NextResponse.json(
                { error: 'Missing required fields: idToken, busId, routeId' },
                { status: 400 }
            );
        }

        // Validate shift
        const validShifts = ['morning', 'evening', 'both'];
        const tripShift = shift && validShifts.includes(shift) ? shift : 'both';

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

        console.log(`🚀 Starting trip for driver ${driverId}, bus ${busId}, route ${routeId}...`);

        // Generate trip ID
        const tripId = generateTripId();

        // Start trip using TripLockService
        const result = await tripLockService.startTrip(
            driverId,
            busId,
            routeId,
            tripShift,
            tripId
        );

        if (!result.success) {
            // Determine appropriate status code
            const statusCode = result.errorCode === 'LOCKED_BY_OTHER' ? 409 : 500;

            return NextResponse.json(
                {
                    success: false,
                    reason: result.reason,
                    errorCode: result.errorCode
                },
                { status: statusCode }
            );
        }

        // Initialize Supabase for driver_status update
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (supabaseUrl && supabaseKey) {
            const supabase = createClient(supabaseUrl, supabaseKey);
            const now = new Date();

            // Update driver_status for realtime tracking
            await supabase
                .from('driver_status')
                .upsert({
                    driver_uid: driverId,
                    bus_id: busId,
                    route_id: routeId,
                    status: 'on_trip',
                    started_at: now.toISOString(),
                    last_updated_at: now.toISOString(),
                    trip_id: tripId
                }, {
                    onConflict: 'driver_uid',
                    ignoreDuplicates: false
                });

            // Broadcast trip start
            const channel = supabase.channel(`trip-status-${busId}`);
            channel.subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.send({
                        type: 'broadcast',
                        event: 'trip_started',
                        payload: {
                            busId,
                            routeId,
                            driverId,
                            tripId,
                            timestamp: now.toISOString()
                        }
                    });
                    await supabase.removeChannel(channel);
                }
            });
        }

        const elapsed = Date.now() - startTime;
        console.log(`✅ Trip started successfully in ${elapsed}ms`);

        return NextResponse.json({
            success: true,
            tripId: result.tripId,
            busId,
            routeId,
            timestamp: new Date().toISOString(),
            processingTimeMs: elapsed
        });

    } catch (error: any) {
        console.error('❌ Error starting trip:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to start trip' },
            { status: 500 }
        );
    }
}
