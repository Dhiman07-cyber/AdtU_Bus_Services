import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getSupabaseServer } from '@/lib/supabase-server';
import { withSecurity } from '@/lib/security/api-security';
import { RateLimits } from '@/lib/security/rate-limiter';

/**
 * GET /api/student/dashboard-data
 * 
 * COMPREHENSIVE DASHBOARD DATA FETCH
 * Fetches student profile, bus, route, driver, and live trip status in PARALLEL.
 */
export const GET = withSecurity(
    async (request, { auth }) => {
        const uid = auth.uid;
        const supabase = getSupabaseServer();

        // 1. Fetch Student Profile
        const studentDoc = await adminDb.collection('students').doc(uid).get().then(doc => {
            if (doc.exists) return doc;
            return adminDb.collection('students').where('uid', '==', uid).limit(1).get().then(q => q.empty ? null : q.docs[0]);
        });

        if (!studentDoc) {
            return NextResponse.json({ error: 'Student profile not found' }, { status: 404 });
        }

        const studentData = studentDoc.data()!;
        const busId = studentData.busId || studentData.assignedBusId;
        const routeId = studentData.routeId || studentData.assignedRouteId;

        // 2. Parallelize everything else
        const [busSnap, routeSnap, driverSnaps, tripStatus] = await Promise.all([
            busId ? adminDb.collection('buses').doc(busId).get() : Promise.resolve(null),
            routeId ? adminDb.collection('routes').doc(routeId).get() : Promise.resolve(null),
            busId ? adminDb.collection('drivers').where('assignedBusId', '==', busId).get() : Promise.resolve(null),
            busId ? supabase.from('driver_status').select('status, started_at, last_updated_at').eq('bus_id', busId).maybeSingle() : Promise.resolve(null)
        ]);

        // Process Bus & Route
        const bus = busSnap?.exists ? { id: busSnap.id, ...busSnap.data() } : null;
        const route = routeSnap?.exists ? { id: routeSnap.id, ...routeSnap.data() } : null;

        // Process Driver (Match shift)
        let driver = null;
        if (driverSnaps && !driverSnaps.empty) {
            const drivers = driverSnaps.docs.map(d => ({ id: d.id, ...d.data() }));
            const studentShift = (studentData.shift || 'Morning').toString().toLowerCase();
            
            // Try shift match
            driver = drivers.find((d: any) => (d.shift || '').toLowerCase().includes(studentShift));
            
            // Fallback to "Both" or first driver
            if (!driver) driver = drivers.find((d: any) => (d.shift || '').toLowerCase().includes('both'));
            if (!driver) driver = drivers[0];
        }

        // Process Trip Status
        const isTripActive = tripStatus?.data ? (tripStatus.data.status === 'on_trip' || tripStatus.data.status === 'enroute') : false;

        return NextResponse.json({
            student: studentData,
            bus,
            route,
            driver,
            tripActive: isTripActive,
            tripData: tripStatus?.data || null
        });
    },
    {
        requiredRoles: ['student'],
        rateLimit: RateLimits.READ
    }
);
