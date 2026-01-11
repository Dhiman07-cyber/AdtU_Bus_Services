import { NextRequest, NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';

/**
 * Set a driver as "Reserved" (not assigned to any bus)
 * 
 * Body: { driverUID: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { driverUID } = await req.json();

    if (!driverUID) {
      return NextResponse.json(
        { success: false, error: 'driverUID is required' },
        { status: 400 }
      );
    }

    // Get driver document
    const driverDoc = await adminDb.collection('drivers').doc(driverUID).get();
    
    if (!driverDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Driver not found' },
        { status: 404 }
      );
    }

    const driverData = driverDoc.data();
    const oldBusId = driverData?.assignedBusId || driverData?.busId;

    console.log(`🔄 Setting driver ${driverData?.fullName} as Reserved`);
    console.log(`   Old bus: ${oldBusId}`);

    // Update driver to be reserved
    await driverDoc.ref.update({
      assignedBusId: null,
      busId: null,
      assignedRouteId: null,
      routeId: null,
      status: 'active'
    });

    // Remove driver from ALL buses that reference them
    // Check both assignedDriverId and activeDriverId
    const [assignedBuses, activeBuses] = await Promise.all([
      adminDb.collection('buses').where('assignedDriverId', '==', driverUID).get(),
      adminDb.collection('buses').where('activeDriverId', '==', driverUID).get()
    ]);

    console.log(`   Found ${assignedBuses.size} buses with assignedDriverId`);
    console.log(`   Found ${activeBuses.size} buses with activeDriverId`);

    const batch = adminDb.batch();
    const updatedBuses: string[] = [];

    // Remove from assignedDriverId buses
    assignedBuses.docs.forEach((doc: any) => {
      const data = doc.data();
      batch.update(doc.ref, {
        assignedDriverId: null,
        activeDriverId: null
      });
      updatedBuses.push(data.busNumber || doc.id);
      console.log(`   🔄 Removing from bus ${data.busNumber} (assignedDriverId)`);
    });

    // Remove from activeDriverId buses (if not already handled)
    const processedBusIds = new Set(assignedBuses.docs.map((d: any) => d.id));
    activeBuses.docs.forEach((doc: any) => {
      if (!processedBusIds.has(doc.id)) {
        const data = doc.data();
        batch.update(doc.ref, {
          activeDriverId: null
        });
        updatedBuses.push(data.busNumber || doc.id);
        console.log(`   🔄 Removing from bus ${data.busNumber} (activeDriverId)`);
      }
    });

    if (updatedBuses.length > 0) {
      await batch.commit();
      console.log(`   ✅ Removed driver from ${updatedBuses.length} bus(es): ${updatedBuses.join(', ')}`);
    }

    console.log(`✅ Driver ${driverData?.fullName} is now Reserved`);

    return NextResponse.json({
      success: true,
      message: `${driverData?.fullName || 'Driver'} is now Reserved and available for swap`,
      driver: {
        uid: driverUID,
        name: driverData?.fullName,
        oldBusId,
        newStatus: 'Reserved'
      },
      busesUpdated: updatedBuses.length,
      busesCleaned: updatedBuses
    });

  } catch (error: any) {
    console.error('❌ Error setting driver as reserved:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
