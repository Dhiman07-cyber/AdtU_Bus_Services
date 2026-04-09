import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { getSupabaseServer } from '@/lib/supabase-server';
import { withSecurity } from '@/lib/security/api-security';
import { AdminSwapBusSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

// Initialize Supabase client with service role
const supabase = getSupabaseServer();

export const POST = withSecurity(
    async (request, { auth, body }) => {
        const { routeId, fromBusId, toBusId } = body as any;

        const routeDoc = await adminDb.collection('routes').doc(routeId).get();
        if (!routeDoc.exists) {
            return NextResponse.json({ error: 'Route not found' }, { status: 404 });
        }

        const fromBusDoc = await adminDb.collection('buses').doc(fromBusId).get();
        const toBusDoc = await adminDb.collection('buses').doc(toBusId).get();

        if (!fromBusDoc.exists) return NextResponse.json({ error: `Bus ${fromBusId} not found` }, { status: 404 });
        if (!toBusDoc.exists) return NextResponse.json({ error: `Bus ${toBusId} not found` }, { status: 404 });

        const batch = adminDb.batch();
        batch.update(routeDoc.ref, { currentBusId: toBusId });
        batch.update(fromBusDoc.ref, { status: 'maintenance' });
        batch.update(toBusDoc.ref, { status: 'active', routeId: routeId });
        await batch.commit();

        console.log('📝 Bus swapped:', { actorUid: auth.uid, action: 'admin_swap_bus', routeId, fromBusId, toBusId, timestamp: new Date().toISOString() });

        // Realtime Broadcast
        try {
            const channel = supabase.channel(`route_${routeId}`);
            await channel.send({
                type: 'broadcast',
                event: 'bus_swapped',
                payload: { routeId, fromBusId, toBusId, timestamp: new Date().toISOString() }
            });
        } catch (err) { console.error('Broadcast error:', err); }

        // FCM Notifications
        try {
            const studentsSnapshot = await adminDb.collection('students').where('routeId', '==', routeId).get();
            const studentIds = studentsSnapshot.docs.map(doc => doc.id);
            const tokenSnapshots = await Promise.all(studentIds.map(uid => adminDb.collection('fcm_tokens').where('userUid', '==', uid).get()));

            const fcmTokens: string[] = [];
            tokenSnapshots.forEach(snapshot => {
                snapshot.docs.forEach((tokenDoc: any) => fcmTokens.push(tokenDoc.data().deviceToken));
            });

            if (fcmTokens.length > 0) {
                const toBusData = toBusDoc.data();
                await adminAuth.messaging().sendEach(
                    fcmTokens.map(token => ({
                        token,
                        notification: { title: 'Bus Changed', body: `Your route bus has been changed to ${toBusData?.busNumber || toBusId}` },
                        data: { type: 'bus_swapped', routeId, newBusId: toBusId }
                    }))
                );
            }
        } catch (fcmError) { console.error('Error sending FCM notifications:', fcmError); }

        return NextResponse.json({
            success: true,
            message: 'Bus swapped successfully',
            data: {
                routeId,
                fromBus: { busId: fromBusId, busNumber: fromBusDoc.data()?.busNumber, status: 'maintenance' },
                toBus: { busId: toBusId, busNumber: toBusDoc.data()?.busNumber, status: 'active' }
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
