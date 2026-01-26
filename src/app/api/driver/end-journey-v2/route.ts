/**
 * POST /api/driver/end-journey-v2
 * 
 * End trip with comprehensive event-driven cleanup:
 * - Immediate cleanup of all ephemeral data
 * - Parallel Supabase cleanup
 * - Sequential Firestore cleanup
 * - Broadcast notifications
 * - Audit logging
 */

import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';
import { createClient } from '@supabase/supabase-js';
import { FieldValue } from 'firebase-admin/firestore';



interface CleanupStats {
  busLocations: number;
  waitingFlags: number;
  driverLocationUpdates: number;
  tripSessions: number;
  auditLogs: number;
  notifications: number;
  totalTime: number;
}

/**
 * Parallel Supabase cleanup
 */
async function cleanupSupabase(
  supabase: any,
  busId: string,
  tripId: string
): Promise<Partial<CleanupStats>> {
  console.log('🧹 Starting PARALLEL Supabase cleanup...');
  const startTime = Date.now();
  const stats: Partial<CleanupStats> = {};

  // Execute all cleanup operations in parallel
  const results = await Promise.allSettled([
    // 1. Delete bus locations for this bus (current state)
    supabase
      .from('bus_locations')
      .delete()
      .eq('bus_id', busId)
      // Removed .eq('trip_id', tripId) to ensure cleanup even if trip_id is missing/null
      .then(({ data, count }: { data: any, count: number }) => {
        stats.busLocations = count || 0;
        console.log(`✅ Deleted ${count || 0} bus_locations`);
      }),

    // 2. Delete driver_location_updates for this bus (historical trail for this trip)
    supabase
      .from('driver_location_updates')
      .delete()
      .eq('bus_id', busId)
      .then(({ data, count }: { data: any, count: number }) => {
        stats.driverLocationUpdates = count || 0;
        console.log(`✅ Deleted ${count || 0} driver_location_updates`);
      }),

    // 3. Delete/expire waiting flags
    supabase
      .from('waiting_flags')
      .delete()
      .eq('bus_id', busId)
      .in('status', ['raised', 'acknowledged'])
      .then(({ data, count }: { data: any, count: number }) => {
        stats.waitingFlags = count || 0;
        console.log(`✅ Deleted ${count || 0} waiting_flags`);
      }),

    // 5. DELETE driver_status row completely (ensures clean state for next trip)
    // This is critical: the student dashboard queries for rows with status 'on_trip' or 'enroute'
    // Deleting the row ensures no false positives when checking for active trips
    supabase
      .from('driver_status')
      .delete()
      .eq('bus_id', busId)
      .then(({ count }: { count: number }) => {
        console.log(`✅ Deleted driver_status row (${count || 1} row removed)`);
      })
  ]);

  // Check for errors
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
 * Sequential Firestore cleanup with batch operations
 */
async function cleanupFirestore(
  busId: string,
  tripId: string
): Promise<Partial<CleanupStats>> {
  console.log('🧹 Skipped Firestore cleanup (no docs created per new logic).');
  return {
    tripSessions: 0,
    driverLocationUpdates: 0,
    auditLogs: 0,
    notifications: 0,
    totalTime: 0
  };
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
    const channel = supabase.channel(channelName);
    await channel.send({
      type: 'broadcast',
      event: 'trip_ended',
      payload
    });
    console.log(`✅ Broadcast sent to ${channelName}`);
  }
}

export async function POST(request: Request) {
  const startTime = Date.now();

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

  try {
    const body = await request.json();
    const { idToken, busId, tripId } = body;

    // Validate required fields
    if (!idToken || !busId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    console.log(`🏁 Ending journey for bus ${busId}, trip ${tripId || 'current'}...`);

    // Verify Firebase token
    const decodedToken = await auth.verifyIdToken(idToken);
    const driverUid = decodedToken.uid;

    // Verify user is a driver
    const userDoc = await adminDb.collection('users').doc(driverUid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'driver') {
      return NextResponse.json(
        { error: 'User is not authorized as a driver' },
        { status: 403 }
      );
    }

    // Get active trip if tripId not provided - from BUSES collection
    let activeTripId = tripId;
    if (!activeTripId) {
      const busDoc = await adminDb.collection('buses').doc(busId).get();
      if (!busDoc.exists) {
        return NextResponse.json({ error: 'Bus not found' }, { status: 404 });
      }
      activeTripId = busDoc.data()?.activeTripId;

      if (!activeTripId) {
        // Fallback or error?
        console.warn('⚠️ No active trip ID found on bus, assuming cleanup already done or stateless end.');
        activeTripId = `trip_${busId}_${Date.now()}`;
      }
    }

    // Get bus details
    const busDoc = await adminDb.collection('buses').doc(busId).get();
    const busData = busDoc.data();
    const busNumber = busData?.busNumber || busId;

    // Remove trip_sessions update (not using collection anymore)


    // Clear trip-related fields from bus document
    // NOTE: We do NOT update the 'status' field here because it represents
    // the bus condition (maintenance, active, etc.) - NOT trip status.
    // Trip status is tracked in Supabase 'driver_status' table.
    await adminDb.collection('buses').doc(busId).update({
      activeTripId: null,
      activeDriverId: null,
      lastEndedAt: FieldValue.serverTimestamp()
    });

    // CRITICAL: Event-driven cleanup
    console.log('\n🚀 STARTING EVENT-DRIVEN CLEANUP...\n');

    // Execute cleanup in parallel where possible
    const [supabaseStats, firestoreStats] = await Promise.all([
      cleanupSupabase(supabase, busId, activeTripId),
      cleanupFirestore(busId, activeTripId)
    ]);

    // Broadcast trip end to all subscribers
    await broadcastTripEnd(supabase, busId, activeTripId, busNumber);

    // Send FCM notifications to students
    try {
      console.log('📲 Sending trip end FCM notifications...');

      const studentsSnapshot = await adminDb
        .collection('students')
        .where('assignedBusId', '==', busId)
        .get();

      if (!studentsSnapshot.empty && auth.messaging) {
        const allTokens: string[] = [];

        for (const studentDoc of studentsSnapshot.docs) {
          const tokensSnapshot = await adminDb
            .collection('fcm_tokens')
            .where('userUid', '==', studentDoc.id)
            .get();

          tokensSnapshot.docs.forEach((tokenDoc: any) => {
            allTokens.push(tokenDoc.data().deviceToken);
          });
        }

        if (allTokens.length > 0) {
          await auth.messaging().sendEach(
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
          console.log(`✅ Sent trip end FCM to ${allTokens.length} device(s)`);
        }
      }
    } catch (fcmError) {
      console.error('❌ FCM notification error (non-critical):', fcmError);
    }

    // Log to audit


    const totalElapsed = Date.now() - startTime;

    // Prepare cleanup summary
    const cleanupSummary = {
      busLocations: supabaseStats.busLocations || 0,
      waitingFlags: supabaseStats.waitingFlags || 0,
      driverLocationUpdates: firestoreStats.driverLocationUpdates || 0,
      tripSessions: firestoreStats.tripSessions || 0,
      notifications: firestoreStats.notifications || 0,
      supabaseTime: supabaseStats.totalTime || 0,
      firestoreTime: firestoreStats.totalTime || 0,
      totalTime: totalElapsed
    };

    console.log('\n📊 CLEANUP SUMMARY:');
    console.log(`  Bus Locations: ${cleanupSummary.busLocations}`);
    console.log(`  Waiting Flags: ${cleanupSummary.waitingFlags}`);
    console.log(`  Location Updates: ${cleanupSummary.driverLocationUpdates}`);
    console.log(`  Trip Sessions: ${cleanupSummary.tripSessions}`);
    console.log(`  Notifications: ${cleanupSummary.notifications}`);
    console.log(`  Supabase Time: ${cleanupSummary.supabaseTime}ms`);
    console.log(`  Firestore Time: ${cleanupSummary.firestoreTime}ms`);
    console.log(`  Total Time: ${cleanupSummary.totalTime}ms`);
    console.log('\n✅ Journey ended successfully with complete cleanup!\n');

    return NextResponse.json({
      success: true,
      message: 'Journey ended successfully',
      tripId: activeTripId,
      busId,
      cleanupStats: cleanupSummary,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error ending journey:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to end journey' },
      { status: 500 }
    );
  }
}
