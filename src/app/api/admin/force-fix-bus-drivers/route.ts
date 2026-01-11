import { NextRequest, NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';

/**
 * FORCE FIX: Aggressively fix ALL bus driver assignments
 * 
 * This will:
 * 1. Get the driver's busId from their driver document
 * 2. Update that bus to use the driver's Firebase UID
 */
export async function POST(req: NextRequest) {
  try {
    console.log('🔧 Starting FORCE FIX of bus-driver assignments...\n');

    // Get all drivers
    const driversSnapshot = await adminDb.collection('drivers').get();
    console.log(`👥 Found ${driversSnapshot.size} drivers\n`);

    const updates: any[] = [];
    const batch = adminDb.batch();

    // For each driver, update their assigned bus
    for (const driverDoc of driversSnapshot.docs) {
      const driverData = driverDoc.data();
      const driverUID = driverDoc.id;
      const assignedBusId = driverData.assignedBusId || driverData.busId;

      console.log(`\n👤 Driver: ${driverData.fullName || driverData.name}`);
      console.log(`   UID: ${driverUID}`);
      console.log(`   Driver ID: ${driverData.driverId}`);
      console.log(`   Assigned Bus: ${assignedBusId}`);

      if (!assignedBusId) {
        console.log(`   ⚠️ No bus assigned, skipping...`);
        continue;
      }

      // Get the bus document
      const busDoc = await adminDb.collection('buses').doc(assignedBusId).get();
      
      if (!busDoc.exists) {
        console.log(`   ❌ Bus ${assignedBusId} not found!`);
        continue;
      }

      const busData = busDoc.data();
      console.log(`   🚌 Bus: ${busData?.busNumber}`);
      console.log(`   Current assignedDriverId: ${busData?.assignedDriverId}`);
      console.log(`   Current activeDriverId: ${busData?.activeDriverId}`);

      // Update the bus to use this driver's UID
      const busUpdates: any = {
        assignedDriverId: driverUID,
        activeDriverId: driverUID
      };

      batch.update(busDoc.ref, busUpdates);
      
      updates.push({
        driverName: driverData.fullName || driverData.name,
        driverUID,
        driverId: driverData.driverId,
        busId: assignedBusId,
        busNumber: busData?.busNumber,
        oldAssignedDriverId: busData?.assignedDriverId,
        oldActiveDriverId: busData?.activeDriverId,
        newDriverId: driverUID
      });

      console.log(`   ✅ Will update bus ${busData?.busNumber} to use UID: ${driverUID}`);
    }

    // Commit all updates
    if (updates.length > 0) {
      await batch.commit();
      console.log(`\n✅ Successfully updated ${updates.length} buses`);
    } else {
      console.log('\nℹ️ No buses needed updating');
    }

    return NextResponse.json({
      success: true,
      message: `Force-fixed ${updates.length} bus assignments`,
      updates
    });

  } catch (error: any) {
    console.error('❌ Error in force fix:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
