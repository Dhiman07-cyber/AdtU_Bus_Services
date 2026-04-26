import { NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';
import { getSupabaseServer } from '@/lib/supabase-server';
import { withSecurity } from '@/lib/security/api-security';
import { LocationUpdateBodySchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

// Anti-spoofing constants
const MAX_SPEED_KMH = 200;
const MAX_JUMP_METERS = 5000;
const TIME_WINDOW_SECONDS = 5;

/**
 * Calculate distance between two coordinates in meters (Haversine formula)
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const POST = withSecurity(
    async (request, { auth, body }) => {
        const { busId, routeId, lat, lng, speed, heading, timestamp } = body as any;
        const driverUid = auth.uid;
        const latNum = Number(lat);
        const lngNum = Number(lng);
        const now = timestamp ? new Date(timestamp) : new Date();

        // 1. Initial speed verification (fast local check)
        if (speed !== undefined && Number(speed) > MAX_SPEED_KMH) {
            return NextResponse.json({ error: `Speed exceeds limit (${MAX_SPEED_KMH} km/h)` }, { status: 400 });
        }

        const supabase = getSupabaseServer();

        // 2. Optimized Parallel Validation
        // We check Supabase driver_status instead of Firestore for sub-second auth verification
        const [statusResult, { data: lastLocations }] = await Promise.all([
            supabase.from('driver_status').select('status, bus_id').eq('driver_uid', driverUid).maybeSingle(),
            supabase.from('bus_locations').select('lat, lng, timestamp').eq('bus_id', busId).order('timestamp', { ascending: false }).limit(1)
        ]);

        // Authorization check via Supabase state (much faster/cheaper than Firestore)
        if (!statusResult.data || statusResult.data.bus_id !== busId || statusResult.data.status !== 'on_trip') {
            return NextResponse.json({ error: 'No active session found for this driver/bus' }, { status: 403 });
        }

        // 3. Anti-spoofing Logic
        if (lastLocations && lastLocations.length > 0) {
            const lastLoc = lastLocations[0];
            const lastTime = new Date(lastLoc.timestamp).getTime();
            const timeDiff = (now.getTime() - lastTime) / 1000;

            if (timeDiff > 0 && timeDiff < TIME_WINDOW_SECONDS * 2) {
                const distance = calculateDistance(Number(lastLoc.lat), Number(lastLoc.lng), latNum, lngNum);
                if (distance > MAX_JUMP_METERS && timeDiff < TIME_WINDOW_SECONDS) {
                    return NextResponse.json({ error: 'Location jump too large', details: { distance, timeDiff } }, { status: 400 });
                }
            }
        }

        // 4. Parallelized Writes
        const commonData = {
            bus_id: busId, route_id: routeId, driver_uid: driverUid,
            lat: latNum, lng: lngNum, speed: speed ? Number(speed) : null,
            heading: heading ? Number(heading) : null, timestamp: now.toISOString()
        };

        const primaryWrites = [
            // Realtime Update (Priority 1)
            supabase.from('bus_locations').insert({ ...commonData, is_snapshot: false }),
            // Historical Log (Priority 2)
            supabase.from('driver_location_updates').insert({
                driver_uid: driverUid, bus_id: busId, lat: latNum, lng: lngNum,
                speed: speed ? Number(speed) : null, heading: heading ? Number(heading) : null,
                timestamp: now.toISOString()
            })
        ];

        // Non-blocking background updates (Firestore cache)
        // We don't await this to speed up the primary telemetry response
        (async () => {
            try {
                await adminDb.collection('buses').doc(busId).update({
                    lastLocation: { lat: latNum, lng: lngNum, timestamp: now.toISOString() }
                });
            } catch (e) {
                // Ignore non-critical cache update errors
            }
        })();

        await Promise.allSettled(primaryWrites);

        return NextResponse.json({
            success: true,
            message: 'Location updated successfully',
            data: { busId, routeId, lat: latNum, lng: lngNum, timestamp: now.toISOString() }
        });
    },
    {
        requiredRoles: ['driver'],
        schema: LocationUpdateBodySchema,
        rateLimit: RateLimits.LOCATION_UPDATE,
        allowBodyToken: true
    }
);
