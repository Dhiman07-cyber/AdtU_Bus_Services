import { NextRequest, NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';

/**
 * DEBUG: Show all buses and drivers data to diagnose the issue
 */
export async function GET(req: NextRequest) {
  try {
    console.log('🔍 Starting diagnostic check...');

    // Get all buses
    const busesSnapshot = await adminDb.collection('buses').get();
    console.log(`📦 Found ${busesSnapshot.size} buses`);

    const buses = busesSnapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        docId: doc.id,
        busId: data.busId,
        busNumber: data.busNumber,
        assignedDriverId: data.assignedDriverId,
        activeDriverId: data.activeDriverId,
        driverUid: data.driverUid,
        driver_uid: data.driver_uid
      };
    });

    // Get all drivers
    const driversSnapshot = await adminDb.collection('drivers').get();
    console.log(`👥 Found ${driversSnapshot.size} drivers`);

    const drivers = driversSnapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        uid: doc.id,
        driverId: data.driverId,
        fullName: data.fullName || data.name,
        busId: data.busId,
        assignedBusId: data.assignedBusId
      };
    });

    console.log('\n📊 BUSES:', JSON.stringify(buses, null, 2));
    console.log('\n👥 DRIVERS:', JSON.stringify(drivers, null, 2));

    return NextResponse.json({
      success: true,
      buses,
      drivers,
      summary: {
        totalBuses: buses.length,
        totalDrivers: drivers.length,
        busesWithLegacyIds: buses.filter((b: any) => 
          b.assignedDriverId?.startsWith('driver_') || 
          b.activeDriverId?.startsWith('driver_')
        ).length
      }
    });

  } catch (error: any) {
    console.error('❌ Error in diagnostic:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
