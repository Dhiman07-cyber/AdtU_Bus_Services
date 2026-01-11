import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

/**
 * ONE-TIME FIX SCRIPT
 * 
 * This script fixes all bus documents to have correct:
 * - activeDriverId (set to the driver currently assigned)
 * - assignedDriverId (set to the driver currently assigned)
 * - activeTripId (cleared to null - no active trips by default)
 * 
 * RUN ONCE AND DELETE THIS FILE
 */
export async function POST(request: Request) {
  try {
    console.log('🔧 Starting bus-driver assignment fix...');
    
    const results = {
      busesFixed: 0,
      busesSkipped: 0,
      errors: [] as string[]
    };

    // Step 1: Get all drivers
    const driversSnapshot = await adminDb.collection('drivers').get();
    const driversByBus: Record<string, string> = {}; // busId => driverUID
    
    console.log(`📋 Found ${driversSnapshot.size} drivers`);
    
    // Build mapping of busId => driverUID
    driversSnapshot.forEach(doc => {
      const driver = doc.data();
      const busId = driver.assignedBusId || driver.busId;
      
      if (busId) {
        driversByBus[busId] = doc.id; // doc.id is the driver UID
        console.log(`   ✅ Driver ${driver.fullName} (${doc.id}) → Bus ${busId}`);
      } else {
        console.log(`   ℹ️  Driver ${driver.fullName} (${doc.id}) is RESERVED (no bus)`);
      }
    });

    // Step 2: Get all buses and fix them
    const busesSnapshot = await adminDb.collection('buses').get();
    console.log(`\n🚌 Found ${busesSnapshot.size} buses to fix`);
    
    const batch = adminDb.batch();
    let batchCount = 0;
    const MAX_BATCH_SIZE = 500;

    for (const busDoc of busesSnapshot.docs) {
      const busId = busDoc.id;
      const busData = busDoc.data();
      const assignedDriverUID = driversByBus[busId];

      try {
        if (assignedDriverUID) {
          // Bus has a driver assigned - update all fields
          const updates = {
            activeDriverId: assignedDriverUID,
            assignedDriverId: assignedDriverUID,
            activeTripId: null, // Clear any stale trip data
            updatedAt: new Date().toISOString()
          };

          batch.update(busDoc.ref, updates);
          batchCount++;
          results.busesFixed++;

          console.log(`   ✅ Fixed ${busData.busNumber} (${busId})`);
          console.log(`      → activeDriverId: ${assignedDriverUID}`);
          console.log(`      → assignedDriverId: ${assignedDriverUID}`);
          console.log(`      → activeTripId: null`);
        } else {
          // No driver assigned to this bus - clear the fields
          const updates = {
            activeDriverId: null,
            assignedDriverId: null,
            activeTripId: null,
            updatedAt: new Date().toISOString()
          };

          batch.update(busDoc.ref, updates);
          batchCount++;
          results.busesSkipped++;

          console.log(`   ⚠️  No driver for ${busData.busNumber} (${busId}) - cleared fields`);
        }

        // Commit batch if we reach the limit
        if (batchCount >= MAX_BATCH_SIZE) {
          await batch.commit();
          console.log(`\n💾 Committed batch of ${batchCount} updates`);
          batchCount = 0;
        }
      } catch (error: any) {
        console.error(`   ❌ Error fixing ${busId}:`, error);
        results.errors.push(`Failed to fix ${busId}: ${error.message}`);
      }
    }

    // Commit remaining documents
    if (batchCount > 0) {
      await batch.commit();
      console.log(`\n💾 Committed final batch of ${batchCount} updates`);
    }

    console.log('\n🎉 Bus-driver assignment fix completed!');
    console.log(`   ✅ Buses fixed: ${results.busesFixed}`);
    console.log(`   ⚠️  Buses without drivers: ${results.busesSkipped}`);
    console.log(`   ❌ Errors: ${results.errors.length}`);

    if (results.errors.length > 0) {
      console.error('\n❌ Errors encountered:', results.errors);
    }

    return NextResponse.json({
      success: true,
      message: 'Bus-driver assignments fixed successfully!',
      results,
      note: '⚠️ DELETE THIS API ENDPOINT AFTER RUNNING ONCE'
    });

  } catch (error: any) {
    console.error('❌ Error during fix:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        note: 'Fix failed - bus documents may be partially updated'
      },
      { status: 500 }
    );
  }
}

// Also support GET for easy testing
export async function GET(request: Request) {
  return POST(request);
}
