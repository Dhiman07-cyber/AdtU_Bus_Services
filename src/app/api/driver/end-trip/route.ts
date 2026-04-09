/**
 * POST /api/driver/end-trip
 * 
 * End a trip cleanly, releasing the lock.
 * Sends FCM push notifications to students and broadcasts via Supabase.
 * Cleans up all trip-related data from Supabase tables.
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
import { db as adminDb } from '@/lib/firebase-admin';
import { tripLockService } from '@/lib/services/trip-lock-service';
import { notifyRoute } from '@/lib/services/fcm-notification-service';
import { getSupabaseServer } from '@/lib/supabase-server';
import { withSecurity } from '@/lib/security/api-security';
import { EndTripSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const POST = withSecurity(
    async (request, { auth, body }) => {
        const startTime = Date.now();
        const { tripId, busId } = body as any;
        const driverId = auth.uid;



        // ── Resolve active trip ID and route info ────────────────────────────
        let activeTripId = tripId;
        let routeId = '';
        let routeName = 'your route';

        // Get trip details from trip lock (before ending it)
        const activeTrip = await tripLockService.getActiveTrip(busId);
        if (activeTrip) {
            if (!activeTripId) activeTripId = activeTrip.trip_id;
            routeId = activeTrip.route_id || '';
        }

        // Fetch route name for FCM notification
        if (routeId) {
            try {
                const routeDoc = await adminDb.collection('routes').doc(routeId).get();
                if (routeDoc.exists) {
                    const routeData = routeDoc.data();
                    routeName = routeData?.name || routeData?.routeName || 'your route';
                }
            } catch (e) {
                console.warn('Could not fetch route name:', e);
            }
        }

        // ── End trip lock ────────────────────────────────────────────────────
        if (activeTripId) {
            const result = await tripLockService.endTrip(activeTripId, driverId, busId);
            if (!result.success) {
                console.error('Error ending trip lock:', result.reason);
            }
        } else {
            console.warn('No active trip ID found for bus:', busId);
        }

        // ── Supabase cleanup + broadcast ─────────────────────────────────────
        if (supabaseUrl && supabaseKey) {
            const supabase = getSupabaseServer();
            const now = new Date().toISOString();

            // Parallel cleanup of all trip-related tables
            const cleanupPromises = [
                supabase.from('driver_status').delete().eq('bus_id', busId),
                supabase.from('bus_locations').delete().eq('bus_id', busId),
                supabase.from('waiting_flags').delete().eq('bus_id', busId),
                supabase.from('driver_location_updates').delete().eq('driver_uid', driverId).eq('bus_id', busId),
            ];

            const cleanupResults = await Promise.allSettled(cleanupPromises);
            cleanupResults.forEach((r, i) => {
                if (r.status === 'rejected') {
                    console.error(`⚠️ Cleanup task ${i} failed:`, r.reason);
                }
            });

            // Broadcast trip end on the main channel
            // Must subscribe first, then send, then unsubscribe
            const broadcastPayload = {
                busId,
                tripId: activeTripId,
                event: 'trip_ended',
                timestamp: now,
            };

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
                                    event: 'trip_ended',
                                    payload: broadcastPayload,
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

        // ── Send FCM Push Notifications ──────────────────────────────────────
        // Await notification send to ensure it executes before Next.js kills the request context
        if (activeTripId && busId) {
            try {
                await notifyRoute({
                    routeId,
                    tripId: activeTripId,
                    routeName,
                    busId,
                    eventType: 'TRIP_ENDED',
                });
            } catch (err) {
                console.error('❌ FCM end-trip notification error:', err);
            }
        }



        return NextResponse.json({
            success: true,
            tripId: activeTripId,
            busId,
            timestamp: new Date().toISOString(),
            processingTimeMs: Date.now() - startTime,
        });
    },
    {
        requiredRoles: ['driver', 'admin'],
        schema: EndTripSchema,
        rateLimit: RateLimits.CREATE,
        allowBodyToken: true,
    }
);
