import { NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';
import { notifyRoute } from '@/lib/services/fcm-notification-service';
import { getSupabaseServer } from '@/lib/supabase-server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { snapStops, type SnapResult } from '@/lib/coordinate-snapping';
import { getRobustRoute } from '@/lib/ors-robust-client';
import { resolveStopCoordinate } from '@/lib/geocoding-service';
import { withSecurity } from '@/lib/security/api-security';
import { StartTripSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';
import crypto from 'crypto';

const ORS_API_KEY = process.env.ORS_API_KEY || '';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * POST /api/driver/start-journey-v2
 * 
 * COMPREHENSIVE START JOURNEY WITH COORDINATE SNAPPING
 * 
 * Process:
 * 1. Validate driver and bus assignment
 * 2. Fetch route stops (approxLat/approxLng as hints)
 * 3. Snap each stop to nearest road with incremental radii
 * 4. Compute route geometry using snapped coordinates
 * 5. Cache geometry and snapped stops
 * 6. Create trip session with all metadata
 * 7. Send FCM notifications to students
 * 8. Broadcast realtime event
 * 
 * Body: { busId, routeId }
 */
export const POST = withSecurity(
  async (request, { auth, body }) => {
    const startTime = Date.now();
    const { busId, routeId } = body as any;
    const driverUid = auth.uid;

    console.log(`🚀 Starting journey for bus ${busId}, route ${routeId}...`);

    // Get driver document to check bus assignment
    const driverDoc = await adminDb.collection('drivers').doc(driverUid).get();
    if (!driverDoc.exists) {
      return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
    }

    const driverData = driverDoc.data();

    // Get bus document
    const busDoc = await adminDb.collection('buses').doc(busId).get();
    if (!busDoc.exists) {
      return NextResponse.json({ error: 'Bus not found' }, { status: 404 });
    }

    const busData = busDoc.data();

    // Validate driver is assigned to this bus (check both driver doc and bus doc)
    const driverClaimsBus =
      driverData?.assignedBusId === busId ||
      driverData?.busId === busId;

    const busClaimsDriver =
      busData?.assignedDriverId === driverUid ||
      busData?.activeDriverId === driverUid ||
      busData?.driverUID === driverUid;

    if (!driverClaimsBus && !busClaimsDriver) {
      console.error('❌ Driver assignment validation failed:', {
        driverUid,
        busId,
        driverData: {
          assignedBusId: driverData?.assignedBusId,
          busId: driverData?.busId
        },
        busData: {
          assignedDriverId: busData?.assignedDriverId,
          activeDriverId: busData?.activeDriverId,
          driverUID: busData?.driverUID
        }
      });
      return NextResponse.json(
        { error: 'Driver is not assigned to this bus' },
        { status: 403 }
      );
    }

    console.log('✅ Driver assignment validated:', {
      driverClaimsBus,
      busClaimsDriver
    });

    // =====================================================
    // MULTI-DRIVER LOCK CHECK & ACQUISITION
    // Prevents multiple drivers from operating the same bus
    // =====================================================
    const now = new Date();
    const tripId = crypto.randomUUID(); // Cryptographically secure UUID
    const LOCK_TTL_SECONDS = 300;
    const expiresAt = new Date(now.getTime() + LOCK_TTL_SECONDS * 1000);

    const busRef = adminDb.collection('buses').doc(busId);

    try {
      await adminDb.runTransaction(async (transaction: any) => {
        const busDocSnap = await transaction.get(busRef);

        if (!busDocSnap.exists) {
          throw new Error('Bus not found');
        }

        const currentBusData = busDocSnap.data();
        const lock = currentBusData?.activeTripLock;

        // Check if lock has expired (stale lock recovery)
        let isLockExpired = false;
        if (lock?.expiresAt) {
          const expiryTime = lock.expiresAt.toMillis
            ? lock.expiresAt.toMillis()
            : new Date(lock.expiresAt).getTime();
          isLockExpired = Date.now() > expiryTime;

          if (isLockExpired) {
            console.log(`⏰ Lock for bus ${busId} has expired (was held by ${lock.driverId}), allowing takeover`);
          }
        }

        // Check if bus is locked by another driver (only if NOT expired)
        if (lock?.active && lock.driverId && lock.driverId !== driverUid && !isLockExpired) {
          console.log(`🔒 Bus ${busId} is locked by driver ${lock.driverId}, rejecting ${driverUid}`);
          throw new Error('LOCKED_BY_OTHER_DRIVER');
        }

        // Check if this driver already has an active trip (idempotent) - only if NOT expired
        if (lock?.active && lock.driverId === driverUid && lock.tripId && !isLockExpired) {
          console.log(`ℹ️ Trip already active for this driver on bus ${busId}: ${lock.tripId}`);
          throw new Error(`ALREADY_ACTIVE:${lock.tripId}`);
        }

        // Acquire the lock
        console.log(`🔐 Acquiring lock on bus ${busId} for driver ${driverUid}`);
        transaction.update(busRef, {
          activeTripLock: {
            active: true,
            tripId: tripId,
            driverId: driverUid,
            shift: 'both', // Default shift
            since: FieldValue.serverTimestamp(),
            expiresAt: Timestamp.fromDate(expiresAt),
            startFcmSent: false,
            endFcmSent: false,
          },
          activeDriverId: driverUid,
          activeTripId: tripId
        });
      });

      console.log(`✅ Lock acquired for bus ${busId} by driver ${driverUid}`);
    } catch (txError: any) {
      if (txError.message === 'LOCKED_BY_OTHER_DRIVER') {
        return NextResponse.json(
          {
            success: false,
            error: 'This bus is currently being operated by another driver. Please wait or try again later.',
            errorCode: 'LOCKED_BY_OTHER'
          },
          { status: 409 }
        );
      }

      if (txError.message.startsWith('ALREADY_ACTIVE:')) {
        const existingTripId = txError.message.split(':')[1];
        return NextResponse.json({
          success: true,
          message: 'Trip already active',
          tripId: existingTripId,
          routeGeometry: null,
          snappedStops: [],
          routeGeometrySource: 'existing_state'
        });
      }

      console.error('❌ Lock acquisition failed:', txError);
      return NextResponse.json(
        { error: 'Failed to acquire bus lock' },
        { status: 500 }
      );
    }

    // Fetch route data from bus document (route is nested inside bus)
    console.log(`📍 Fetching route from bus ${busId}...`);
    
    let stops = busData?.route?.stops || busData?.stops || [];
    const routeName = busData?.route?.routeName || busData?.routeName || routeId;

    // Attempt to fetch from 'routes' collection if bus data is missing stops
    if (stops.length < 2) {
      console.warn(`⚠️ Only ${stops.length} stops found in bus document. Attempting to fetch from route ${routeId}...`);

      try {
        const routeDoc = await adminDb.collection('routes').doc(routeId).get();
        if (routeDoc.exists) {
          const routeDocData = routeDoc.data();
          const routeStops = routeDocData?.stops || [];

          if (routeStops.length >= 2) {
            console.log(`✅ Found ${routeStops.length} stops in independent route document. Using these stops.`);
            stops = routeStops;
          }
        }
      } catch (err) {
        console.warn(`⚠️ Failed to fetch route document:`, err);
      }
    }

    console.log(`📍 Route has ${stops.length} stops`);

    // STEP 1: Bus lock already acquired above via transaction
    console.log(`\n⚡ STEP 1: Bus lock acquired successfully.`);

    // Initialize Supabase client
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Server configuration error: Missing Supabase credentials' },
        { status: 500 }
      );
    }

    // Create new client for this request context
    const supabase = getSupabaseServer();

    // Initialize Supabase realtime state IMMEDIATELY
    const { error: driverStatusError } = await supabase
      .from('driver_status')
      .upsert({
        driver_uid: driverUid,
        bus_id: busId,
        route_id: routeId,
        status: 'on_trip',
        started_at: now.toISOString(),
        last_updated_at: now.toISOString(),
        trip_id: tripId
      }, {
        onConflict: 'driver_uid',
        ignoreDuplicates: false
      });

    if (driverStatusError) {
      return NextResponse.json(
        { error: 'Failed to update driver status' },
        { status: 500 }
      );
    }

    // Insert into active_trips table for lock management
    const { error: activeTripError } = await supabase
      .from('active_trips')
      .insert({
        bus_id: busId,
        driver_id: driverUid,
        route_id: routeId,
        shift: 'both',
        status: 'active',
        start_time: now.toISOString(),
        last_heartbeat: now.toISOString(),
        metadata: {
          appTripId: tripId,
          routeName: routeName,
          busNumber: busData?.busNumber || busId,
          stopsCount: stops.length
        }
      });

    // Insert initial bus_locations row for this trip
    await supabase
      .from('bus_locations')
      .insert({
        bus_id: busId,
        route_id: routeId,
        driver_uid: driverUid,
        lat: 0,
        lng: 0,
        speed: 0,
        heading: 0,
        accuracy: 0,
        timestamp: now.toISOString(),
        is_snapshot: true,
        trip_id: tripId
      });

    // STEP 2: Resolve coordinates (Efficiently)
    console.log(`\n🔄 STEP 2: Resolving ${stops.length} stop coordinates...`);

    const resolvedStops: any[] = [];
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      if (stop.lat && stop.lng && stop.lat !== 0 && stop.lng !== 0) {
        resolvedStops.push({
          ...stop,
          geocodedLat: stop.lat,
          geocodedLng: stop.lng,
          geocodingMethod: 'stored',
          workingLat: stop.lat,
          workingLng: stop.lng
        });
        continue;
      }

      const resolved = await resolveStopCoordinate(
        stop.name,
        stop.lat || 0,
        stop.lng || 0,
        'Guwahati, Assam, India'
      );

      resolvedStops.push({
        ...stop,
        geocodedLat: resolved.method === 'geocoded' ? resolved.lat : null,
        geocodedLng: resolved.method === 'geocoded' ? resolved.lng : null,
        geocodingMethod: resolved.method,
        workingLat: resolved.lat,
        workingLng: resolved.lng
      });
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // STEP 3: Snapping and Routing (Optimized)
    console.log(`\n🔄 STEP 3: Snapping and routing...`);
    let snappedStops: any[] = [];

    try {
      if (ORS_API_KEY) {
        const snapResults = await snapStops(
          resolvedStops.map(s => ({ lat: s.workingLat || 0, lng: s.workingLng || 0, ...s })),
          { apiKey: ORS_API_KEY, radii: [350, 700], maxDistance: 500, enableNominatim: false }
        );

        snappedStops = resolvedStops.map((stop, index) => {
          const snapResult = snapResults[index];
          return {
            stopId: stop.stopId,
            name: stop.name,
            sequence: stop.sequence,
            approxLat: stop.lat || 0,
            approxLng: stop.lng || 0,
            snappedLat: snapResult.snappedLat || stop.lat || 0,
            snappedLng: snapResult.snappedLng || stop.lng || 0,
            isSnapped: snapResult.isSnapped || false,
            snappingMethod: snapResult.method || 'none'
          };
        });
      }
    } catch (routingError) {
      console.warn("⚠️ Routing calculation failed:", routingError);
    }

    // STEP 4: Update trip session with calculated data - SKIPPED per user request
    console.log(`\n🔄 STEP 4: Skipped updating trip geometry in Firestore (no trip_sessions doc).`);

    // STEP 5: Notify Students via centralized FCM service
    console.log(`\n📢 STEP 5: Sending notifications...`);

    try {
      const studentChannel = supabase.channel(`trip-status-${busId}`);
      await new Promise<void>((resolve) => {
        let isTimedOut = false;
        const timeout = setTimeout(() => {
          isTimedOut = true;
          resolve();
        }, 3000); // 3 sec timeout

        studentChannel.subscribe(async (status) => {
          if (isTimedOut) return;
          if (status === 'SUBSCRIBED') {
            await studentChannel.send({
              type: 'broadcast',
              event: 'trip_started',
              payload: {
                busId,
                routeId,
                driverUid,
                tripId,
                routeName: routeName,
                timestamp: now.toISOString()
              }
            });
            clearTimeout(timeout);
            supabase.removeChannel(studentChannel);
            resolve();
          }
        });
      });
    } catch (broadcastError) {
      // Non critical
    }

    try {
      await notifyRoute({
        routeId,
        tripId,
        routeName: routeName as string,
        busId,
      });
    } catch (err) {
      console.error('❌ FCM notification error:', err);
    }

    const elapsed = Date.now() - startTime;
    return NextResponse.json({
      success: true,
      message: 'Journey started successfully',
      tripId,
      busId,
      routeId,
      timestamp: now.toISOString(),
      processingTimeMs: elapsed
    });
  },
  {
    requiredRoles: ['driver', 'admin'],
    schema: StartTripSchema,
    rateLimit: RateLimits.CREATE, // Start trip shouldn't be spammed
    allowBodyToken: true
  }
);