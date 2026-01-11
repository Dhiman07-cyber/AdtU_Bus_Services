import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function PUT(request: Request) {
    try {
        const authHeader = (await headers()).get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.substring(7);
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();

        if (!userDoc.exists || !['admin', 'moderator'].includes(userDoc.data()?.role)) {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const { routeId, routeName, status, stops } = body;

        if (!routeId) {
            return NextResponse.json({ success: false, error: 'Route ID is required' }, { status: 400 });
        }

        const routeRef = adminDb.collection('routes').doc(routeId);

        // Format stops
        const formattedStops = stops.map((stop: any, index: number) => ({
            name: stop.name,
            sequence: index + 1,
            stopId: stop.stopId
        }));

        const updates: any = {
            routeName,
            status,
            stops: formattedStops,
            totalStops: formattedStops.length,
            updatedAt: FieldValue.serverTimestamp()
        };

        // Update or Create Route Master (Maintenance of the central route definition)
        await routeRef.set(updates, { merge: true });

        // Propagate changes to Buses that use this route
        // This is crucial for denormalization consistency
        const busesQuery = await adminDb.collection('buses').where('routeId', '==', routeId).get();

        if (!busesQuery.empty) {
            const batch = adminDb.batch();
            busesQuery.forEach((doc: any) => {
                const busUpdates: any = {
                    'route.routeName': routeName,
                    'route.stops': formattedStops,
                    'route.totalStops': formattedStops.length,
                };

                // Also update status if needed? Maybe not.

                batch.update(doc.ref, busUpdates);
            });
            await batch.commit();
            console.log(`Updated ${busesQuery.size} buses with new route info.`);
        }

        return NextResponse.json({ success: true, message: 'Route updated successfully' });

    } catch (error: any) {
        console.error('Update route error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
