import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { verifyApiAuth } from '@/lib/security/api-auth';
import { applyRateLimit, createRateLimitId, RateLimits } from '@/lib/security/rate-limiter';
import { handleApiError } from '@/lib/security/safe-error';

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Require authentication (any logged-in user can view buses)
    const auth = await verifyApiAuth(request, ['admin', 'moderator', 'driver', 'student']);
    if (!auth.authenticated) return auth.response;

    // Rate limit
    const rl = applyRateLimit(createRateLimitId(auth.uid, 'buses-list'), RateLimits.READ);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rl.headers });
    }

    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const routeId = searchParams.get('routeId');

    // Fetch buses from Firestore
    let busesSnapshot;
    if (routeId) {
      busesSnapshot = await db.collection('buses').where('routeId', '==', routeId).get();
    } else {
      busesSnapshot = await db.collection('buses').get();
    }

    const buses = busesSnapshot.docs.map((doc: any) => {
      const data = doc.data();
      return { id: doc.id, ...data };
    });

    return NextResponse.json({ buses }, { headers: rl.headers });
  } catch (error: any) {
    console.error('Error fetching buses:', error);
    return NextResponse.json(handleApiError(error, 'buses-get', 'Failed to fetch buses'), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Only admin/moderator can create buses
    const auth = await verifyApiAuth(request, ['admin', 'moderator']);
    if (!auth.authenticated) return auth.response;

    // Rate limit
    const rl = applyRateLimit(createRateLimitId(auth.uid, 'buses-create'), RateLimits.CREATE);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rl.headers });
    }

    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const busData = await request.json();

    // Input validation
    if (!busData.busNumber || typeof busData.busNumber !== 'string' || busData.busNumber.length > 50) {
      return NextResponse.json({ error: 'Valid bus number is required (max 50 chars)' }, { status: 400 });
    }
    if (!busData.routeId || typeof busData.routeId !== 'string' || busData.routeId.length > 100) {
      return NextResponse.json({ error: 'Valid route ID is required' }, { status: 400 });
    }
    if (busData.capacity && (typeof busData.capacity !== 'number' || busData.capacity < 1 || busData.capacity > 200)) {
      return NextResponse.json({ error: 'Capacity must be 1-200' }, { status: 400 });
    }

    const newBus = {
      busId: busData.busId || `bus_${Date.now()}`,
      busNumber: busData.busNumber.trim(),
      model: (busData.model || 'Standard Model').substring(0, 100),
      capacity: busData.capacity || 50,
      driverUID: busData.driverUID || null,
      driverName: (busData.driverName || '').substring(0, 200),
      routeId: busData.routeId.trim(),
      routeName: (busData.routeName || '').substring(0, 200),
      status: busData.status || 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.collection('buses').doc(newBus.busId).set(newBus);

    return NextResponse.json({ id: newBus.busId, ...newBus }, { status: 201, headers: rl.headers });
  } catch (error: any) {
    console.error('Error creating bus:', error);
    return NextResponse.json(handleApiError(error, 'buses-post', 'Failed to create bus'), { status: 500 });
  }
}