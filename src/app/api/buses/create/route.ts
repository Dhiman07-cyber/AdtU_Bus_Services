import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Create Bus API - Updated for Final Design Consistency
 * 
 * Payload:
 * - busId (Required)
 * - busNumber
 * - color
 * - capacity (number)
 * - driverUID
 * - routeId
 * - shift (Morning/Evening/Both)
 * - load: { morningCount, eveningCount } (Optional, defaults to 0)
 * - status (Defaults to 'Active')
 */
export async function POST(request: Request) {
  try {
    // Verify authentication
    const authHeader = (await headers()).get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const decodedToken = await adminAuth.verifyIdToken(token);

    // Check permissions
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists || !['admin', 'moderator'].includes(userDoc.data()?.role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Admin or Moderator access required' },
        { status: 403 }
      );
    }

    // Parse request body
    const busData = await request.json();
    console.log('🚌 Creating bus with data:', busData);

    const {
      busId,
      busNumber,
      color,
      capacity,
      driverUID,
      routeId,
      status = 'Active',
      shift,
      load
    } = busData;

    // Validate required fields
    if (!busId || !busNumber || !color || !capacity || !routeId || !shift) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields'
      }, { status: 400 });
    }

    // Check if bus ID already exists
    const busRef = adminDb.collection('buses').doc(busId);
    const existingBus = await busRef.get();
    if (existingBus.exists) {
      return NextResponse.json({
        success: false,
        error: `Bus ID ${busId} already exists.`
      }, { status: 400 });
    }

    // Fetch complete route data for denormalization
    let routeDoc = await adminDb.collection('routes').doc(routeId).get();
    let rData = routeDoc.exists ? routeDoc.data() : null;

    if (!rData) {
      // Fallback: Try to find this route in other buses
      console.log(`🔍 Route ${routeId} not found in master, searching other buses...`);
      const otherBus = await adminDb.collection('buses')
        .where('routeId', '==', routeId)
        .limit(1)
        .get();

      if (!otherBus.empty) {
        rData = otherBus.docs[0].data().route;
        console.log(`✅ Found route info in bus ${otherBus.docs[0].id}`);
      }
    }

    if (!rData) {
      return NextResponse.json(
        { success: false, error: `Route ${routeId} not found in master or other buses. Please create the route first.` },
        { status: 404 }
      );
    }

    const routeData = rData;

    // Parse Load Data
    const morningCount = load?.morningCount ? parseInt(load.morningCount) : 0;
    const eveningCount = load?.eveningCount ? parseInt(load.eveningCount) : 0;
    const initialLoad = {
      morningCount: isNaN(morningCount) ? 0 : morningCount,
      eveningCount: isNaN(eveningCount) ? 0 : eveningCount
    };

    // Construct Denormalized Route Object
    const denormalizedRoute = {
      routeId: routeId,
      routeName: routeData?.routeName || `Route-${routeId}`,
      stops: routeData?.stops || [],
      totalStops: routeData?.stops?.length || 0,
      // Optional: Keep other metadata if needed, but spec asked for these specific fields
    };

    // Calculate Current Members
    const currentMembers = initialLoad.morningCount + initialLoad.eveningCount;

    // Build complete bus document
    const busDocument: any = {
      // Identity
      busId: busId,
      busNumber: busNumber,
      defaultBusId: busId,
      currentBusId: busId,

      // State
      status: status,
      activeTripId: null,

      // Driver Assignments
      activeDriverId: driverUID || null, // Initially active assigned driver
      assignedDriverId: driverUID || null,

      // Capacity & Load
      capacity: parseInt(capacity),
      currentMembers: currentMembers,
      load: initialLoad,

      // Details
      color: color,
      shift: shift,

      // Route
      routeId: routeId,
      routeRef: `routes/${routeId}`,
      route: denormalizedRoute,

      // Timestamps
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    // Create bus document
    await busRef.set(busDocument);
    console.log(`✅ Bus ${busId} created successfully`);

    // Update driver document
    if (driverUID) {
      try {
        await adminDb.collection('drivers').doc(driverUID).update({
          assignedBusId: busId,
          busId: busId,
          assignedRouteId: routeId,
          routeId: routeId,
          status: 'active',
          updatedAt: FieldValue.serverTimestamp()
        });
      } catch (e) {
        console.error('⚠️ Failed to update driver assignment:', e);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Bus created successfully!',
      busId,
      busDocument
    });

  } catch (error: any) {
    console.error('❌ Error creating bus:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create bus' },
      { status: 500 }
    );
  }
}