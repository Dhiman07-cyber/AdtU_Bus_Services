import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getSupabaseServer } from '@/lib/supabase-server';
import { withSecurity } from '@/lib/security/api-security';
import { AdminSwapBusSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';
import { notifyRouteTopic } from '@/lib/services/fcm-notification-service';

/**
 * POST /api/admin/swap-bus
 * 
 * Optimized:
 * - Parallelized metadata fetching (Route, FromBus, ToBus)
 * - Scalable FCM Topic notifications (replaces expensive N+1 token fetching)
 * - Atomic Firestore batch updates
 */

export const POST = withSecurity(
    async (request, { body }) => {
        const { routeId, fromBusId, toBusId } = body as any;
        const supabase = getSupabaseServer();

        // 1. Parallelize document fetching
        const [routeSnap, fromBusSnap, toBusSnap] = (await adminDb.getAll(
            adminDb.collection('routes').doc(routeId),
            adminDb.collection('buses').doc(fromBusId),
            adminDb.collection('buses').doc(toBusId)
        )) as any[];

        if (!routeSnap.exists) return NextResponse.json({ error: 'Route not found' }, { status: 404 });
        if (!fromBusSnap.exists) return NextResponse.json({ error: `Bus ${fromBusId} not found` }, { status: 404 });
        if (!toBusSnap.exists) return NextResponse.json({ error: `Bus ${toBusId} not found` }, { status: 404 });

        const toBusData = toBusSnap.data()!;

        // 2. Atomic Batch Update
        const batch = adminDb.batch();
        batch.update(routeSnap.ref, { currentBusId: toBusId });
        batch.update(fromBusSnap.ref, { status: 'maintenance' });
        batch.update(toBusSnap.ref, { status: 'active', routeId: routeId });
        await batch.commit();

        // 3. Parallelized Realtime & Notifications (Non-blocking response)
        const postTasks = [
            // Supabase Broadcast
            supabase.channel(`route_${routeId}`).send({
                type: 'broadcast',
                event: 'bus_swapped',
                payload: { routeId, fromBusId, toBusId, timestamp: new Date().toISOString() }
            }),
            // Scalable FCM Topic Notification
            notifyRouteTopic({
                routeId,
                title: 'Bus Changed',
                body: `Your route bus has been changed to ${toBusData.busNumber || toBusData.displayIndex || toBusId}`,
                data: { type: 'bus_swapped', routeId, newBusId: toBusId },
                eventType: 'BUS_CHANGED'
            })
        ];

        // We await them but could fire-and-forget if absolute speed is needed
        await Promise.allSettled(postTasks);

        return NextResponse.json({
            success: true,
            message: 'Bus swapped successfully',
            data: {
                routeId,
                fromBus: { busId: fromBusId, busNumber: fromBusSnap.data()?.busNumber, status: 'maintenance' },
                toBus: { busId: toBusId, busNumber: toBusData.busNumber, status: 'active' }
            }
        });
    },
    {
        requiredRoles: ['admin'],
        schema: AdminSwapBusSchema,
        rateLimit: RateLimits.CREATE,
        allowBodyToken: true
    }
);
