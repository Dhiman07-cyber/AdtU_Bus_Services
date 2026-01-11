import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Create Route API
 * Updated to support manual routeId and new fields
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

    // Check if user is admin or moderator
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists || !['admin', 'moderator'].includes(userDoc.data()?.role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Admin or Moderator access required' },
        { status: 403 }
      );
    }

    // Parse request body
    const routeData = await request.json();
    console.log('🛣️ Creating route with data:', routeData);

    const {
      routeId: providedRouteId,
      routeName,
      stops,
      status
    } = routeData;

    // Validate required fields
    if (!routeName || !stops || !Array.isArray(stops) || stops.length < 2) {
      return NextResponse.json({
        success: false,
        error: 'Route name and at least 2 stops are required'
      }, { status: 400 });
    }

    // Determine Route ID
    let routeId = providedRouteId;
    if (!routeId) {
      // Fallback or Error? UI requires it, so let's default to old logic if missing but simpler
      const num = routeName.match(/\d+/)?.[0] || Date.now().toString();
      routeId = `route_${num}`;
    }

    // Check if route already exists
    const existingRoute = await adminDb.collection('routes').doc(routeId).get();
    if (existingRoute.exists) {
      return NextResponse.json(
        { success: false, error: `Route ${routeId} already exists` },
        { status: 400 }
      );
    }

    // Format stops array
    const formattedStops = stops.map((stop: any, index: number) => ({
      name: stop.name,
      sequence: index + 1,
      stopId: stop.stopId
    }));

    // Build complete route document
    const routeDocument: any = {
      routeId,
      routeName,
      stops: formattedStops,
      totalStops: formattedStops.length,
      status: status || 'Active',

      // Defaults
      assignedBuses: [],
      currentBusId: null,
      defaultBusId: null,

      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    // Create route document
    await adminDb.collection('routes').doc(routeId).set(routeDocument);
    console.log(`✅ Route ${routeId} created successfully`);

    return NextResponse.json({
      success: true,
      message: 'Route created successfully!',
      routeId,
      routeDocument
    });

  } catch (error: any) {
    console.error('❌ Error creating route:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create route' },
      { status: 500 }
    );
  }
}
