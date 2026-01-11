import { NextRequest, NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';

/**
 * DEBUG: Check driver-bus linkage for a specific driver
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const driverUID = searchParams.get('driverUID');

    if (!driverUID) {
      return NextResponse.json(
        { success: false, error: 'driverUID query parameter required' },
        { status: 400 }
      );
    }

    console.log(`🔍 Checking driver-bus linkage for: ${driverUID}\n`);

    // Get driver document
    const driverDoc = await adminDb.collection('drivers').doc(driverUID).get();
    
    if (!driverDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'Driver not found' },
        { status: 404 }
      );
    }

    const driverData = driverDoc.data();
    
    console.log('👤 Driver Data:');
    console.log({
      uid: driverUID,
      name: driverData?.fullName || driverData?.name,
      driverId: driverData?.driverId,
      status: driverData?.status,
      assignedBusId: driverData?.assignedBusId,
      busId: driverData?.busId,
      assignedRouteId: driverData?.assignedRouteId,
      routeId: driverData?.routeId
    });

    // Check all buses where this driver is assigned or active
    const [assignedBuses, activeBuses] = await Promise.all([
      adminDb.collection('buses').where('assignedDriverId', '==', driverUID).get(),
      adminDb.collection('buses').where('activeDriverId', '==', driverUID).get()
    ]);

    console.log('\n🚌 Buses linked to this driver:');
    console.log(`   Assigned: ${assignedBuses.size} buses`);
    console.log(`   Active: ${activeBuses.size} buses`);

    const linkedBuses: any[] = [];
    const busIds = new Set<string>();

    assignedBuses.docs.forEach((doc: any) => {
      const data = doc.data();
      busIds.add(doc.id);
      linkedBuses.push({
        busId: doc.id,
        busNumber: data.busNumber,
        linkType: 'assignedDriverId',
        assignedDriverId: data.assignedDriverId,
        activeDriverId: data.activeDriverId
      });
    });

    activeBuses.docs.forEach((doc: any) => {
      const data = doc.data();
      if (!busIds.has(doc.id)) {
        busIds.add(doc.id);
        linkedBuses.push({
          busId: doc.id,
          busNumber: data.busNumber,
          linkType: 'activeDriverId',
          assignedDriverId: data.assignedDriverId,
          activeDriverId: data.activeDriverId
        });
      }
    });

    console.log('\nLinked buses:', linkedBuses);

    const isReserved = !driverData?.assignedBusId && !driverData?.busId;
    const hasConflict = linkedBuses.length > 0;

    return NextResponse.json({
      success: true,
      driver: {
        uid: driverUID,
        name: driverData?.fullName || driverData?.name,
        driverId: driverData?.driverId,
        status: driverData?.status,
        assignedBusId: driverData?.assignedBusId,
        busId: driverData?.busId,
        isReservedInDriverDoc: isReserved
      },
      linkedBuses,
      analysis: {
        isReserved,
        hasConflict,
        message: hasConflict 
          ? `⚠️ Driver appears reserved but is still linked to ${linkedBuses.length} bus(es). Need to clean up bus documents!`
          : isReserved 
            ? '✅ Driver is properly reserved with no bus conflicts'
            : 'ℹ️ Driver has bus assignment'
      }
    });

  } catch (error: any) {
    console.error('❌ Error checking driver-bus link:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
