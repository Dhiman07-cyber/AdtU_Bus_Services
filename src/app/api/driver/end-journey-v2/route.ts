/**
 * POST /api/driver/end-journey-v2
 * 
 * End trip with comprehensive event-driven cleanup:
 * - Immediate cleanup of ALL trip-related Supabase tables
 * - Parallel Supabase cleanup
 * - Broadcast notifications
 * - FCM notifications to students
 * - Stale FCM token auto-removal
 */

import { NextResponse } from 'next/server';
import { db as adminDb, messaging } from '@/lib/firebase-admin';
import { createClient } from '@supabase/supabase-js';
import { FieldValue } from 'firebase-admin/firestore';
import { withSecurity } from '@/lib/security/api-security';
import { EndTripSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

interface CleanupStats {
  busLocations: number;
  waitingFlags: number;
  driverLocationUpdates: number;
  activeTrips: number;
  driverStatus: number;
  missedBusRequests: number;
  deviceSessions: number;
  totalTime: number;
}

/**
 * Comprehensive Supabase cleanup — ALL trip-related tables
 * 
 * Tables cleaned on trip end:
 * 1. bus_locations        — Delete all location rows for this bus
 * 2. driver_location_updates — Delete historical breadcrumbs
 * 3. waiting_flags        — Delete raised/acknowledged flags for this bus
 * 4. active_trips         — DELETE rows for this bus/driver
 * 5. driver_status        — Delete driver status row entirely
 * 6. missed_bus_requests  — Expire any pending requests linked to this bus/trip
 * 7. device_sessions      — Clean up driver's device sessions
 */
async function cleanupSupabase(
  supabase: any,
  busId: string,
  tripId: string,
  driverUid: string
): Promise<Partial<CleanupStats>> {
  console.log('🧹 Starting COMPREHENSIVE Supabase cleanup...');
  const startTime = Date.now();
  const stats: Partial<CleanupStats> = {};

  // Execute all cleanup operations in parallel
  const results = await Promise.allSettled([
    // 1. Delete bus_locations for this bus (current state)
    supabase
      .from('bus_locations')
      .delete()
      .eq('bus_id', busId)
      .then(({ count, error }: { count: number | null, error: any }) => {
        if (error) console.error('❌ Error deleting bus_locations:', error);
        else {
          stats.busLocations = count || 0;
          console.log(`✅ Deleted ${count || 0} bus_locations`);
        }
      }),

    // 2. Delete driver_location_updates for this bus (historical trail)
    supabase
      .from('driver_location_updates')
      .delete()
      .eq('bus_id', busId)
      .then(({ count, error }: { count: number | null, error: any }) => {
        if (error) console.error('❌ Error deleting driver_location_updates:', error);
        else {
          stats.driverLocationUpdates = count || 0;
          console.log(`✅ Deleted ${count || 0} driver_location_updates`);
        }
      }),

    // 3. Delete/expire waiting_flags (raised or acknowledged)
    supabase
      .from('waiting_flags')
      .delete()
      .eq('bus_id', busId)
      .in('status', ['raised', 'acknowledged'])
      .then(({ count, error }: { count: number | null, error: any }) => {
        if (error) console.error('❌ Error deleting waiting_flags:', error);
        else {
          stats.waitingFlags = count || 0;
          console.log(`✅ Deleted ${count || 0} waiting_flags`);
        }
      }),

    // 4a. DELETE active_trips by bus_id
    supabase
      .from('active_trips')
      .delete()
      .eq('bus_id', busId)
      .then(({ count, error }: { count: number | null, error: any }) => {
        if (error) console.error('❌ Error deleting active_trips by bus_id:', error);
        else {
          stats.activeTrips = count || 0;
          console.log(`✅ Deleted ${count || 0} active_trips (by bus_id)`);
        }
      }),

    // 4b. Also DELETE active_trips by driver_id as safety fallback
    supabase
      .from('active_trips')
      .delete()
      .eq('driver_id', driverUid)
      .then(({ count, error }: { count: number | null, error: any }) => {
        if (error) console.error('❌ Error deleting active_trips by driver_id:', error);
        else console.log(`✅ Deleted ${count || 0} active_trips (by driver_id)`);
      }),

    // 5. DELETE driver_status row completely
    supabase
      .from('driver_status')
      .delete()
      .eq('bus_id', busId)
      .then(({ count, error }: { count: number | null, error: any }) => {
        if (error) console.error('❌ Error deleting driver_status:', error);
        else {
          stats.driverStatus = count || 0;
          console.log(`✅ Deleted ${count || 0} driver_status row(s)`);
        }
      }),

    // 5b. Also delete driver_status by driver_uid (safety fallback)
    supabase
      .from('driver_status')
      .delete()
      .eq('driver_uid', driverUid)
      .then(({ count, error }: { count: number | null, error: any }) => {
        if (error) console.error('❌ Error deleting driver_status by driver_uid:', error);
        else console.log(`✅ Deleted ${count || 0} driver_status row(s) by driver_uid`);
      }),

    // 6. Expire any pending missed_bus_requests that reference this bus's route
    //    These are no longer actionable once the trip has ended
    supabase
      .from('missed_bus_requests')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .eq('route_id', busId)  // missed_bus_requests use route_id
      .then(({ count, error }: { count: number | null, error: any }) => {
        if (error) console.error('❌ Error expiring missed_bus_requests:', error);
        else {
          stats.missedBusRequests = count || 0;
          console.log(`✅ Expired ${count || 0} missed_bus_requests`);
        }
      }),

    // 7. Clean up device sessions for this driver
    supabase
      .from('device_sessions')
      .delete()
      .eq('user_id', driverUid)
      .then(({ count, error }: { count: number | null, error: any }) => {
        if (error) console.error('❌ Error deleting device_sessions:', error);
        else {
          stats.deviceSessions = count || 0;
          console.log(`✅ Deleted ${count || 0} device_sessions`);
        }
      })
  ]);

  // Check for rejected promises
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`❌ Cleanup task ${index + 1} failed:`, result.reason);
    }
  });

  const elapsed = Date.now() - startTime;
  console.log(`🎉 Supabase cleanup completed in ${elapsed}ms`);

  return { ...stats, totalTime: elapsed };
}

/**
 * Broadcast trip end to all channels
 */
async function broadcastTripEnd(
  supabase: any,
  busId: string,
  tripId: string,
  busNumber: string
): Promise<void> {
  console.log('📢 Broadcasting trip end events...');

  // Broadcast to multiple channels for different subscribers
  const channels = [
    `trip-status-${busId}`,
    `bus_${busId}_students`,
    `bus_location_${busId}`
  ];

  const payload = {
    busId,
    tripId,
    busNumber,
    event: 'trip_ended',
    timestamp: new Date().toISOString()
  };

  for (const channelName of channels) {
    try {
      const channel = supabase.channel(channelName);
      await channel.httpSend('trip_ended', payload);
      console.log(`✅ Broadcast sent to ${channelName}`);
    } catch (broadcastErr) {
      console.warn(`⚠️ Broadcast to ${channelName} failed (non-critical):`, broadcastErr);
    }
  }
}

/**
 * Send FCM notifications using properly initialized Firebase Admin Messaging
 */
async function sendTripEndFCM(
  busId: string,
  busNumber: string,
  activeTripId: string
): Promise<void> {
  if (!messaging) {
    console.warn('⚠️ Firebase Admin Messaging not initialized - cannot send FCM notifications');
    return;
  }

  try {
    console.log('📲 Sending trip end FCM notifications...');

    let studentsSnapshot = await adminDb
      .collection('students')
      .where('assignedBusId', '==', busId)
      .get();

    if (studentsSnapshot.empty) {
      const altSnapshot1 = await adminDb.collection('students').where('busId', '==', busId).get();
      const altSnapshot2 = await adminDb.collection('students').where('bus_id', '==', busId).get();
      studentsSnapshot = altSnapshot1.empty ? altSnapshot2 : altSnapshot1;
    }

    if (studentsSnapshot.empty) {
      console.log('ℹ️ No students found for this bus, skipping FCM');
      return;
    }

    const allTokens: string[] = [];
    const tokenToUidMap: Map<string, string> = new Map();

    studentsSnapshot.docs.forEach((doc: any) => {
      const data = doc.data();
      if (data.fcmToken) {
        allTokens.push(data.fcmToken);
        tokenToUidMap.set(data.fcmToken, doc.id);
      }
    });

    console.log(`📲 Found ${allTokens.length} FCM tokens from ${studentsSnapshot.size} students`);

    if (allTokens.length === 0) {
      console.log('ℹ️ No FCM tokens found for students on this bus');
      return;
    }

    const sendResult = await messaging.sendEach(
      allTokens.map(token => ({
        token,
        notification: {
          title: '🏁 Bus Trip Ended',
          body: `Your trip for Bus ${busNumber} has ended successfully!`
        },
        data: {
          type: 'trip_ended',
          tripId: activeTripId,
          busId,
          busNumber
        }
      }))
    );

    console.log(`✅ FCM send results: ${sendResult.successCount} success, ${sendResult.failureCount} failed`);

    // Clean up stale/invalid tokens automatically
    if (sendResult.failureCount > 0) {
      sendResult.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          const errorCode = resp.error.code;
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            const staleToken = allTokens[idx];
            const uid = tokenToUidMap.get(staleToken);
            if (uid) {
              console.log(`🗑️ Removing stale FCM token for student ${uid}`);
              adminDb.collection('students').doc(uid).update({
                fcmToken: null,
                fcmUpdatedAt: new Date().toISOString()
              }).catch(() => {});
            }
          }
        }
      });
    }
  } catch (fcmError) {
    console.error('❌ FCM notification error (non-critical):', fcmError);
  }
}

export const POST = withSecurity(
  async (request, { auth, body }) => {
    const startTime = Date.now();
    const { busId, tripId } = body as any;
    const driverUid = auth.uid;

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("❌ Missing Supabase credentials in end-journey-v2");
      return NextResponse.json(
        { error: 'Server configuration error: Missing Supabase credentials' },
        { status: 500 }
      );
    }

    // Create client inside handler
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`🏁 Ending journey for bus ${busId}, trip ${tripId || 'current'}...`);

    // Get active trip if tripId not provided - from BUSES collection
    let activeTripId = tripId;
    if (!activeTripId) {
      const busDoc = await adminDb.collection('buses').doc(busId).get();
      if (!busDoc.exists) {
        return NextResponse.json({ error: 'Bus not found' }, { status: 404 });
      }
      activeTripId = busDoc.data()?.activeTripId;

      if (!activeTripId) {
        console.warn('⚠️ No active trip ID found on bus, assuming cleanup already done or stateless end.');
        // Generate a fallback ID so cleanup functions still work nicely
        const crypto = require('crypto');
        activeTripId = `trip_${busId}_${crypto.randomUUID()}`;
      }
    }

    // Get bus details
    const busDoc = await adminDb.collection('buses').doc(busId).get();
    const busData = busDoc.data();
    const busNumber = busData?.busNumber || busId;

    // =====================================================
    // MULTI-DRIVER LOCK VERIFICATION
    // Only the driver who holds the lock can end the trip
    // =====================================================
    const lock = busData?.activeTripLock;

    if (lock?.active && lock.driverId && lock.driverId !== driverUid) {
      console.error(`🔒 Lock mismatch: Driver ${driverUid} trying to end trip owned by ${lock.driverId}`);
      return NextResponse.json(
        {
          success: false,
          error: 'You cannot end this trip. Another driver is currently operating this bus.',
          errorCode: 'NOT_LOCK_HOLDER'
        },
        { status: 403 }
      );
    }

    // If no active lock, allow the end (might be cleanup or expired lock)
    if (!lock?.active) {
      console.warn(`⚠️ No active lock found for bus ${busId}, proceeding with cleanup anyway`);
    } else {
      console.log(`✅ Lock verification passed: Driver ${driverUid} is the lock holder`);
    }

    // Clear trip-related fields from bus document including the lock
    await adminDb.collection('buses').doc(busId).update({
      activeTripLock: {
        active: false,
        tripId: null,
        driverId: null,
        shift: null,
        since: null,
        expiresAt: null
      },
      activeTripId: null,
      activeDriverId: null,
      lastEndedAt: FieldValue.serverTimestamp()
    });

    // CRITICAL: Comprehensive cleanup of ALL trip-related Supabase tables
    console.log('\n🚀 STARTING COMPREHENSIVE SUPABASE CLEANUP...\n');

    const supabaseStats = await cleanupSupabase(supabase, busId, activeTripId, driverUid);

    // Broadcast trip end to all subscribers
    await broadcastTripEnd(supabase, busId, activeTripId, busNumber);

    // Send FCM notifications to students (uses proper Firebase Admin Messaging)
    await sendTripEndFCM(busId, busNumber, activeTripId);

    const totalElapsed = Date.now() - startTime;

    // Prepare cleanup summary
    const cleanupSummary = {
      busLocations: supabaseStats.busLocations || 0,
      waitingFlags: supabaseStats.waitingFlags || 0,
      driverLocationUpdates: supabaseStats.driverLocationUpdates || 0,
      activeTrips: supabaseStats.activeTrips || 0,
      driverStatus: supabaseStats.driverStatus || 0,
      missedBusRequests: supabaseStats.missedBusRequests || 0,
      deviceSessions: supabaseStats.deviceSessions || 0,
      supabaseTime: supabaseStats.totalTime || 0,
      totalTime: totalElapsed
    };

    console.log('\n📊 CLEANUP SUMMARY:');
    console.log(`  Bus Locations: ${cleanupSummary.busLocations}`);
    console.log(`  Waiting Flags: ${cleanupSummary.waitingFlags}`);
    console.log(`  Location Updates: ${cleanupSummary.driverLocationUpdates}`);
    console.log(`  Active Trips Ended: ${cleanupSummary.activeTrips}`);
    console.log(`  Driver Status: ${cleanupSummary.driverStatus}`);
    console.log(`  Missed Bus Requests: ${cleanupSummary.missedBusRequests}`);
    console.log(`  Device Sessions: ${cleanupSummary.deviceSessions}`);
    console.log(`  Supabase Time: ${cleanupSummary.supabaseTime}ms`);
    console.log(`  Total Time: ${cleanupSummary.totalTime}ms`);
    console.log('\n✅ Journey ended successfully with COMPLETE cleanup!\n');

    return NextResponse.json({
      success: true,
      message: 'Journey ended successfully',
      tripId: activeTripId,
      busId,
      cleanupStats: cleanupSummary,
      timestamp: new Date().toISOString()
    });
  },
  {
    requiredRoles: ['driver', 'admin'],
    schema: EndTripSchema,
    rateLimit: RateLimits.CREATE, // Prevent spam
    allowBodyToken: true
  }
);
