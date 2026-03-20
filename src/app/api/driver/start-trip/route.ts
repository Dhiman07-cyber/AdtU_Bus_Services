/**
 * POST /api/driver/start-trip
 * 
 * Start a trip with exclusive lock acquisition.
 * Sends FCM push notifications to all students on the route via
 * the centralized fcm-notification-service.
 * 
 * Request body:
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
import { db as adminDb } from '@/lib/firebase-admin';
import { tripLockService } from '@/lib/services/trip-lock-service';
import { notifyRoute, verifyDriverRouteBinding } from '@/lib/services/fcm-notification-service';
import { createClient } from '@supabase/supabase-js';
import { withSecurity } from '@/lib/security/api-security';
import { RateLimits } from '@/lib/security/rate-limiter';
import { StartTripSchema } from '@/lib/security/validation-schemas';
import crypto from 'crypto';

export const POST = withSecurity(
    async (request, { auth, body }) => {
        const startTime = Date.now();
        const { busId, routeId, shift } = body as any;
        const driverId = auth.uid;

        // Validate shift
        const validShifts = ['morning', 'evening', 'both'];
        const tripShift = shift && validShifts.includes(shift) ? shift : 'both';

        // Verify driver→bus→route binding (prevent spoofing)
        const authCheck = await verifyDriverRouteBinding(driverId, routeId, busId);
        if (!authCheck.authorized) {
            return NextResponse.json(
                { error: authCheck.reason || 'Driver not authorized for this route' },
                { status: 403 }
            );
        }

        console.log(`🚀 Starting trip for driver ${driverId}, bus ${busId}, route ${routeId}...`);

        // Generate cryptographically secure trip ID
        const tripId = crypto.randomUUID();

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

            // Broadcast trip start (subscribe → send → cleanup)
            const channel = supabase.channel(`trip-status-${busId}`);
            try {
                await new Promise<void>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        supabase.removeChannel(channel);
                        reject(new Error('Broadcast subscribe timeout'));
                    }, 3000);

                    channel.subscribe(async (status) => {
                        if (status === 'SUBSCRIBED') {
                            clearTimeout(timeout);
                            try {
                                await channel.send({
                                    type: 'broadcast',
                                    event: 'trip_started',
                                    payload: {
                                        busId, routeId, driverId, tripId,
                                        timestamp: now.toISOString(),
                                    },
                                });
                            } finally {
                                await supabase.removeChannel(channel);
                            }
                            resolve();
                        }
                    });
                });
            } catch (err: any) {
                console.warn('⚠️ Broadcast send failed (non-critical):', err.message);
            }
        }

        // ── Send FCM Push Notifications ──────────────────────────────────
        let routeName = 'your route';
        try {
            const routeDoc = await adminDb.collection('routes').doc(routeId).get();
            if (routeDoc.exists) {
                const routeData = routeDoc.data();
                routeName = routeData?.name || routeData?.routeName || 'your route';
            }
        } catch (e) {
            console.warn('Could not fetch route name:', e);
        }

        // Await notification send to ensure it executes before Next.js kills the request context
        try {
            await notifyRoute({ routeId, tripId, routeName, busId, eventType: 'TRIP_STARTED' });
        } catch (err) {
            console.error('❌ FCM notification error:', err);
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
    },
    {
        requiredRoles: ['driver', 'admin'],
        schema: StartTripSchema,
        rateLimit: RateLimits.CREATE, // Start trip shouldn't be spammed
        allowBodyToken: true // For backward compatibility with older clients
    }
);
