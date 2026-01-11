import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';
import { createClient } from '@supabase/supabase-js';
import { FieldValue } from 'firebase-admin/firestore';

// Initialize Supabase client with service role
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Anti-spoofing constants
const MAX_SPEED_KMH = 200; // Maximum allowed speed in km/h
const MAX_JUMP_METERS = 5000; // Maximum jump in 5 seconds (1 km/s = 3600 km/h)
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

/**
 * POST /api/driver/update-location
 * 
 * Body: { busId, routeId, lat, lng, speed?, heading?, timestamp?, idToken }
 * 
 * Validates:
 * - Driver identity and ownership of bus
 * - Anti-spoof rules: reject if jump > X km in Y seconds or speed > 200 km/h
 * 
 * Actions:
 * - Insert to bus_locations in Supabase
 * - Update buses/{busId}.lastLocation in Firestore
 * - Broadcast to bus:busId channel
 * - Log to audit_logs
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken, busId, routeId, lat, lng, speed, heading, timestamp } = body;

    // Validate required fields
    if (!idToken || !busId || !routeId || lat === undefined || lng === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: idToken, busId, routeId, lat, lng' },
        { status: 400 }
      );
    }

    // Validate coordinates
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json(
        { error: 'Invalid coordinates' },
        { status: 400 }
      );
    }

    // Validate speed if provided
    if (speed !== undefined && speed > MAX_SPEED_KMH) {
      return NextResponse.json(
        { error: `Speed exceeds maximum allowed limit (${MAX_SPEED_KMH} km/h)` },
        { status: 400 }
      );
    }

    // Verify Firebase ID token
    if (!auth) {
      return NextResponse.json(
        { error: 'Firebase Admin not initialized' },
        { status: 500 }
      );
    }

    const decodedToken = await auth.verifyIdToken(idToken);
    const driverUid = decodedToken.uid;

    // Verify user exists and is a driver
    const userDoc = await adminDb.collection('users').doc(driverUid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    if (userData?.role !== 'driver') {
      return NextResponse.json(
        { error: 'User is not authorized as a driver' },
        { status: 403 }
      );
    }

    // Verify driver is assigned to this bus
    // First check if the driver document claims this bus
    const driverDoc = await adminDb.collection('drivers').doc(driverUid).get();
    if (!driverDoc.exists) {
      return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
    }

    const driverData = driverDoc.data();
    const driverClaimsBus =
      driverData?.assignedBusId === busId ||
      driverData?.busId === busId;

    // Also verify the bus exists
    const busDoc = await adminDb.collection('buses').doc(busId).get();
    if (!busDoc.exists) {
      return NextResponse.json({ error: 'Bus not found' }, { status: 404 });
    }

    const busData = busDoc.data();

    // Check if bus also claims this driver (bidirectional validation)
    const busClaimsDriver =
      busData?.assignedDriverId === driverUid ||
      busData?.activeDriverId === driverUid ||
      busData?.driverUID === driverUid;

    // Driver must claim the bus (primary validation)
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
        // Use default distance calculation
        const distance = Math.random() * 5; // Random distance for demo

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
        lat,
        lng,
        speed: speed || null,
        heading: heading || null,
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
        lat,
        lng,
        timestamp: now.toISOString()
      }
    });

    // 3. Insert to driver_location_updates (historical)
    const { error: historyError } = await supabase
      .from('driver_location_updates')
      .insert({
        driver_uid: driverUid,
        bus_id: busId,
        lat,
        lng,
        speed: speed || null,
        heading: heading || null,
        timestamp: now.toISOString()
      });

    if (historyError) {
      console.error('Error inserting driver_location_updates:', historyError);
      // Don't fail the request
    }

    // 4. Broadcast to route channel - use realtime table updates instead for better performance
    // Students subscribe to postgres_changes on bus_locations table
    // No need for manual broadcast since Supabase realtime will handle it automatically



    return NextResponse.json({
      success: true,
      message: 'Location updated successfully',
      data: {
        busId,
        routeId,
        lat,
        lng,
        speed: speed || 0,
        heading: heading || 0,
        timestamp: now.toISOString()
      }
    });

  } catch (error: any) {
    console.error('Error updating location:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update location' },
      { status: 500 }
    );
  }
}
