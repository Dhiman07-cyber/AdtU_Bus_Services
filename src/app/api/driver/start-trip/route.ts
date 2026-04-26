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
import { notifyRouteTopic, verifyDriverRouteBinding } from '@/lib/services/fcm-notification-service';
import { getSupabaseServer } from '@/lib/supabase-server';
import { withSecurity } from '@/lib/security/api-security';
import { RateLimits } from '@/lib/security/rate-limiter';
import { formatIdForDisplay } from '@/lib/utils';
import { StartTripSchema } from '@/lib/security/validation-schemas';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

        // ── Parallel Execution of Secondary Operations ──────────────────
        // We run status updates, broadcasts, and notifications in parallel
        // to minimize response time.
        
        const secondaryOperations = (async () => {
            if (supabaseUrl && supabaseKey) {
                const supabase = getSupabaseServer();
                const now = new Date();

                // 1. Update driver_status for realtime tracking
                const statusUpdate = supabase
                    .from('driver_status')
                    .upsert({
                        driver_uid: driverId,
                        bus_id: busId,
                        route_id: routeId,
                        status: 'on_trip',
                        started_at: now.toISOString(),
                        last_updated_at: now.toISOString(),
                        trip_id: tripId
                    }, { onConflict: 'driver_uid' });

                // 2. Broadcast trip start (Fire-and-forget broadcast)
                const broadcast = supabase.channel(`trip-status-${busId}`).send({
                    type: 'broadcast',
                    event: 'trip_started',
                    payload: {
                        busId, routeId, driverId, tripId,
                        timestamp: now.toISOString(),
                    },
                }).catch(e => console.warn('Broadcast failed:', e.message));

                // 3. Fetch Route Name & Send Notifications
                const notificationTask = (async () => {
                    let routeName = 'your route';
                    try {
                        const routeDoc = await adminDb.collection('routes').doc(routeId).get();
                        if (routeDoc.exists) {
                            const routeData = routeDoc.data();
                            routeName = routeData?.name || routeData?.routeName || routeId;
                            if (routeName.includes('_') || routeName.startsWith('route')) {
                                routeName = formatIdForDisplay(routeName);
                            }
                        }
                    } catch (e) {
                        console.warn('Route name fetch failed:', e);
                    }

                    try {
                        // High-performance Topic Notification (doesn't require fetching 100s of tokens)
                        await notifyRouteTopic({ 
                            routeId, 
                            tripId, 
                            routeName, 
                            busId, 
                            eventType: 'TRIP_STARTED' 
                        });
                    } catch (err) {
                        console.error('❌ FCM notification error:', err);
                    }
                })();

                await Promise.allSettled([statusUpdate, broadcast, notificationTask]);
            }
        })();

        // On Vercel, we could use waitUntil(secondaryOperations)
        // For now, we await to ensure completion in various environments
        await secondaryOperations;

        return NextResponse.json({
            success: true,
            tripId: result.tripId,
            busId,
            routeId,
            timestamp: new Date().toISOString(),
            processingTimeMs: Date.now() - startTime
        });
    },
    {
        requiredRoles: ['driver', 'admin'],
        schema: StartTripSchema,
        rateLimit: RateLimits.CREATE, // Start trip shouldn't be spammed
        allowBodyToken: true // For backward compatibility with older clients
    }
);
