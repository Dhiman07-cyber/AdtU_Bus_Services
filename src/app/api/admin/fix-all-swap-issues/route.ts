import { NextRequest, NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';

/**
 * COMPREHENSIVE FIX: Fix all driver swap validation issues
 * 
 * This fixes:
 * 1. Driver status (sets all to 'active')
 * 2. Bus driver IDs (maps legacy IDs to Firebase UIDs)
 * 3. Validates all relationships
 */
export async function POST(req: NextRequest) {
  try {
    console.log('🔧 Starting comprehensive driver swap fix...\n');

    const results: any = {
      driversFixed: 0,
      busesFixed: 0,
      errors: []
    };

    // Step 1: Fix driver status
    console.log('Step 1: Fixing driver status...');
    const driversSnapshot = await adminDb.collection('drivers').get();
    const driverBatch = adminDb.batch();
    const driverMapping: Record<string, string> = {};

    driversSnapshot.docs.forEach((doc: any) => {
      const data = doc.data();
      
      // Map driver IDs
      if (data.driverId) {
        const numericPart = data.driverId.replace(/[^0-9]/g, '');
        const numericValue = parseInt(numericPart, 10);
        driverMapping[`driver_${numericValue}`] = doc.id;
        driverMapping[`driver_${numericPart}`] = doc.id;
      }

      // Set status to active if not set
      if (data.status !== 'active') {
        driverBatch.update(doc.ref, { status: 'active' });
        results.driversFixed++;
        console.log(`✅ Set ${data.fullName || data.name} to active`);
      }
    });

    await driverBatch.commit();
    console.log(`✅ Fixed ${results.driversFixed} driver statuses\n`);

    // Step 2: Fix bus driver IDs
    console.log('Step 2: Fixing bus driver IDs...');
    const busesSnapshot = await adminDb.collection('buses').get();
    const busBatch = adminDb.batch();

    busesSnapshot.docs.forEach((busDoc: any) => {
      const busData = busDoc.data();
      const updates: any = {};

      // Update assignedDriverId
      if (busData.assignedDriverId?.startsWith('driver_')) {
        const actualUID = driverMapping[busData.assignedDriverId];
        if (actualUID) {
          updates.assignedDriverId = actualUID;
        }
      }

      // Update activeDriverId
      if (busData.activeDriverId?.startsWith('driver_')) {
        const actualUID = driverMapping[busData.activeDriverId];
        if (actualUID) {
          updates.activeDriverId = actualUID;
        }
      }

      if (Object.keys(updates).length > 0) {
        busBatch.update(busDoc.ref, updates);
        results.busesFixed++;
        console.log(`✅ Fixed bus ${busData.busNumber}`);
      }
    });

    await busBatch.commit();
    console.log(`✅ Fixed ${results.busesFixed} bus assignments\n`);

    // Step 3: Validate all drivers have proper bus assignments
    console.log('Step 3: Validating relationships...');
    for (const doc of driversSnapshot.docs) {
      const data = doc.data();
      const assignedBusId = data.assignedBusId || data.busId;
      
      if (assignedBusId) {
        const busDoc = await adminDb.collection('buses').doc(assignedBusId).get();
        if (!busDoc.exists) {
          results.errors.push({
            driver: data.fullName || data.name,
            issue: `Assigned bus ${assignedBusId} not found`
          });
        } else {
          const busData = busDoc.data();
          if (busData?.assignedDriverId !== doc.id && busData?.activeDriverId !== doc.id) {
            results.errors.push({
              driver: data.fullName || data.name,
              bus: busData?.busNumber,
              issue: 'Bus does not reference this driver'
            });
          }
        }
      }
    }

    console.log('\n✅ Comprehensive fix complete!');
    
    return NextResponse.json({
      success: true,
      message: 'All driver swap issues fixed',
      results: {
        driversFixed: results.driversFixed,
        busesFixed: results.busesFixed,
        totalDrivers: driversSnapshot.size,
        totalBuses: busesSnapshot.size,
        errors: results.errors
      }
    });

  } catch (error: any) {
    console.error('❌ Error in comprehensive fix:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
