import { NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';
import { getSupabaseServer } from '@/lib/supabase-server';
import { withSecurity } from '@/lib/security/api-security';
import { LocationUpdateBodySchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

// Anti-spoofing constants
const MAX_SPEED_KMH = 200; // Maximum allowed speed in km/h 
const MAX_JUMP_METERS = 5000; // Maximum jump in 5 seconds
const TIME_WINDOW_SECONDS = 5;

/**
 * Calculate distance between two coordinates in meters (Haversine formula)
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export const POST = withSecurity(
  async (request, { auth, body }) => {
    const { busId, routeId, lat, lng, speed, heading, timestamp } = body as any;
    const driverUid = auth.uid;

    const latNum = Number(lat);
    const lngNum = Number(lng);

    // Initial speed verification (schema handles basic bounds, this handles custom bounds)
    if (speed !== undefined && Number(speed) > MAX_SPEED_KMH) {
      return NextResponse.json(
        { error: `Speed exceeds maximum allowed limit (${MAX_SPEED_KMH} km/h)` },
        { status: 400 }
      );
    }

    // Verify driver is assigned to this bus
    const driverDoc = await adminDb.collection('drivers').doc(driverUid).get();
    if (!driverDoc.exists) {
      return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
    }

    const driverData = driverDoc.data();
    const driverClaimsBus =
      driverData?.assignedBusId === busId ||
      driverData?.busId === busId;

    // Verify the bus exists
    const busDoc = await adminDb.collection('buses').doc(busId).get();
    if (!busDoc.exists) {
      return NextResponse.json({ error: 'Bus not found' }, { status: 404 });
    }

    // Driver must claim the bus
    if (!driverClaimsBus) {
      console.error('Driver assignment validation failed:', {
        driverUid,
        busId,
        driverData: {
          assignedBusId: driverData?.assignedBusId,
          busId: driverData?.busId
        }
      });
      return NextResponse.json(
        { error: 'Driver is not assigned to this bus' },
        { status: 403 }
      );
    }

    const now = timestamp ? new Date(timestamp) : new Date();

    // Initialize Supabase client
    const supabase = getSupabaseServer();

    // ===== Anti-spoofing checks =====

    // Get last location from Supabase
    const { data: lastLocations } = await supabase
      .from('bus_locations')
      .select('*')
      .eq('bus_id', busId)
      .order('timestamp', { ascending: false })
      .limit(1);

    if (lastLocations && lastLocations.length > 0) {
      const lastLoc = lastLocations[0];
      const lastTime = new Date(lastLoc.timestamp).getTime();
      const currentTime = now.getTime();
      const timeDiff = (currentTime - lastTime) / 1000; // seconds

      if (timeDiff > 0 && timeDiff < TIME_WINDOW_SECONDS * 2) {
        // Use ACTUAL distance calculation instead of Math.random
        const distance = calculateDistance(
          Number(lastLoc.lat),
          Number(lastLoc.lng),
          latNum,
          lngNum
        );

        // Check for unrealistic jumps
        if (distance > MAX_JUMP_METERS && timeDiff < TIME_WINDOW_SECONDS) {
          return NextResponse.json(
            {
              error: 'Location jump too large - possible spoofing detected',
              details: { distance, timeDiff }
            },
            { status: 400 }
          );
        }
      }
    }

    // ===== Insert location data =====

    // 1. Insert to bus_locations in Supabase
    const { error: locationError } = await supabase
      .from('bus_locations')
      .insert({
        bus_id: busId,
        route_id: routeId,
        driver_uid: driverUid,
        lat: latNum,
        lng: lngNum,
        speed: speed ? Number(speed) : null,
        heading: heading ? Number(heading) : null,
        timestamp: now.toISOString(),
        is_snapshot: false
      });

    if (locationError) {
      console.error('Error inserting bus_locations:', locationError);
      return NextResponse.json(
        { error: 'Failed to update location in realtime database' },
        { status: 500 }
      );
    }

    // 2. Update buses/{busId}.lastLocation in Firestore
    await adminDb.collection('buses').doc(busId).update({
      lastLocation: {
        lat: latNum,
        lng: lngNum,
        timestamp: now.toISOString()
      }
    });

    // 3. Insert to driver_location_updates (historical)
    const { error: historyError } = await supabase
      .from('driver_location_updates')
      .insert({
        driver_uid: driverUid,
        bus_id: busId,
        lat: latNum,
        lng: lngNum,
        speed: speed ? Number(speed) : null,
        heading: heading ? Number(heading) : null,
        timestamp: now.toISOString()
      });

    if (historyError) {
      console.error('Error inserting driver_location_updates:', historyError);
      // Don't fail the request
    }

    return NextResponse.json({
      success: true,
      message: 'Location updated successfully',
      data: {
        busId,
        routeId,
        lat: latNum,
        lng: lngNum,
        speed: speed ? Number(speed) : 0,
        heading: heading ? Number(heading) : 0,
        timestamp: now.toISOString()
      }
    });
  },
  {
    requiredRoles: ['driver'],
    schema: LocationUpdateBodySchema,
    rateLimit: RateLimits.LOCATION_UPDATE, // 60 requests per minute
    allowBodyToken: true
  }
);
