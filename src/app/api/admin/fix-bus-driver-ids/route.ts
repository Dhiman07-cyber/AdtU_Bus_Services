import { NextRequest, NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';

/**
 * FIX: Update buses collection to use actual driver UIDs instead of "driver_X" format
 * 
 * This endpoint maps old driver IDs (driver_1, driver_2, etc.) to actual Firebase UIDs
 * by using the driverId field in the drivers collection.
 */
export async function POST(req: NextRequest) {
  try {
    console.log('🔧 Starting bus driver ID fix...');

    // Get all buses
    const busesSnapshot = await adminDb.collection('buses').get();
    console.log(`📦 Found ${busesSnapshot.size} buses`);

    // Get all drivers to create mapping
    const driversSnapshot = await adminDb.collection('drivers').get();
    console.log(`👥 Found ${driversSnapshot.size} drivers`);

    // Create mapping: driver_X -> Firebase UID
    const driverMapping: Record<string, string> = {};
    driversSnapshot.docs.forEach((doc: any) => {
      const data = doc.data();
      // Map both driverId formats
      if (data.driverId) {
        // Convert "DR-01" to both "driver_1" and "driver_01" for compatibility
        const numericPart = data.driverId.replace(/[^0-9]/g, '');
        const numericValue = parseInt(numericPart, 10);
        
        // Map without leading zero: driver_1, driver_2, etc.
        const legacyIdNoZero = `driver_${numericValue}`;
        driverMapping[legacyIdNoZero] = doc.id;
        
        // Map with leading zero: driver_01, driver_02, etc.
        const legacyIdWithZero = `driver_${numericPart}`;
        driverMapping[legacyIdWithZero] = doc.id;
        
        console.log(`📍 Mapped ${legacyIdNoZero} and ${legacyIdWithZero} -> ${doc.id} (${data.fullName || data.name})`);
      }
    });

    console.log('🗺️ Driver mapping:', driverMapping);

    // Update buses
    const batch = adminDb.batch();
    let updateCount = 0;
    const busDetails: any[] = [];

    busesSnapshot.docs.forEach((busDoc: any) => {
      const busData = busDoc.data();
      const updates: any = {};

      console.log(`\n🚌 Bus ${busData.busNumber || busDoc.id}:`, {
        busId: busData.busId || busDoc.id,
        assignedDriverId: busData.assignedDriverId,
        activeDriverId: busData.activeDriverId,
        driverUid: busData.driverUid
      });

      // Update assignedDriverId
      if (busData.assignedDriverId) {
        if (busData.assignedDriverId.startsWith('driver_')) {
          const actualUID = driverMapping[busData.assignedDriverId];
          if (actualUID) {
            updates.assignedDriverId = actualUID;
            console.log(`  ✅ assignedDriverId: ${busData.assignedDriverId} -> ${actualUID}`);
          } else {
            console.warn(`  ⚠️ No mapping found for assignedDriverId: ${busData.assignedDriverId}`);
          }
        } else {
          console.log(`  ℹ️ assignedDriverId already uses Firebase UID: ${busData.assignedDriverId.substring(0, 10)}...`);
        }
      }

      // Update activeDriverId
      if (busData.activeDriverId) {
        if (busData.activeDriverId.startsWith('driver_')) {
          const actualUID = driverMapping[busData.activeDriverId];
          if (actualUID) {
            updates.activeDriverId = actualUID;
            console.log(`  ✅ activeDriverId: ${busData.activeDriverId} -> ${actualUID}`);
          } else {
            console.warn(`  ⚠️ No mapping found for activeDriverId: ${busData.activeDriverId}`);
          }
        } else {
          console.log(`  ℹ️ activeDriverId already uses Firebase UID: ${busData.activeDriverId.substring(0, 10)}...`);
        }
      }

      // Apply updates if any
      if (Object.keys(updates).length > 0) {
        batch.update(busDoc.ref, updates);
        updateCount++;
        busDetails.push({
          busNumber: busData.busNumber,
          busId: busData.busId || busDoc.id,
          updates
        });
      }
    });

    // Commit batch
    if (updateCount > 0) {
      await batch.commit();
      console.log(`✅ Updated ${updateCount} buses`);
    } else {
      console.log('ℹ️ No buses needed updating');
    }

    return NextResponse.json({
      success: true,
      message: `Fixed driver IDs for ${updateCount} buses`,
      driverMapping,
      updatedBuses: updateCount,
      busDetails
    });

  } catch (error: any) {
    console.error('❌ Error fixing bus driver IDs:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
