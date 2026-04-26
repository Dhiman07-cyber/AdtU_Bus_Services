import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getSupabaseServer } from '@/lib/supabase-server';
import { withSecurity } from '@/lib/security/api-security';
import { RateLimits } from '@/lib/security/rate-limiter';

/**
 * GET /api/driver/dashboard-data
 * 
 * COMPREHENSIVE DRIVER DASHBOARD DATA FETCH
 * Parallelizes: Driver Profile, Assigned Bus, Route, Student Count, and Trip Status.
 */
export const GET = withSecurity(
    async (request, { auth }) => {
        const uid = auth.uid;
        const supabase = getSupabaseServer();

        // 1. Fetch Driver Profile
        const driverSnap = await adminDb.collection('drivers').doc(uid).get();
        if (!driverSnap.exists) {
            return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
        }

        const driverData = driverSnap.data()!;
        const busId = driverData.assignedBusId || driverData.busId;
        const routeId = driverData.assignedRouteId || driverData.routeId;

        // 2. Parallelize everything else
        const [busSnap, routeSnap, studentCountSnap, tripStatus] = await Promise.all([
            busId ? adminDb.collection('buses').doc(busId).get() : Promise.resolve(null),
            routeId ? adminDb.collection('routes').doc(routeId).get() : Promise.resolve(null),
            busId ? adminDb.collection('students').where('busId', '==', busId).where('status', '==', 'active').count().get() : Promise.resolve(null),
            supabase.from('driver_status').select('*').eq('driver_uid', uid).maybeSingle()
        ]);

        const bus = busSnap?.exists ? { id: busSnap.id, ...busSnap.data() } : null;
        const route = routeSnap?.exists ? { id: routeSnap.id, ...routeSnap.data() } : null;
        const studentCount = studentCountSnap?.data().count || 0;
        const tripData = tripStatus?.data || null;
        const isTripActive = tripData ? (tripData.status === 'on_trip' || tripData.status === 'enroute') : false;

        return NextResponse.json({
            driver: driverData,
            bus,
            route,
            studentCount,
            tripActive: isTripActive,
            tripData
        });
    },
    {
        requiredRoles: ['driver'],
        rateLimit: RateLimits.READ
    }
);
