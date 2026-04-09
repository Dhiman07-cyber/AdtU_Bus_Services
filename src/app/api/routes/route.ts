import { NextRequest, NextResponse } from 'next/server';
import { getAllRoutes } from '@/lib/dataService';
import { db } from '@/lib/firebase-admin';
import { verifyApiAuth } from '@/lib/security/api-auth';
import { applyRateLimit, createRateLimitId, RateLimits } from '@/lib/security/rate-limiter';
import { handleApiError } from '@/lib/security/safe-error';

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Require authentication (any logged-in user can view routes)
    const auth = await verifyApiAuth(request, ['admin', 'moderator', 'driver', 'student']);
    if (!auth.authenticated) return auth.response;

    // Rate limit
    const rl = await applyRateLimit(createRateLimitId(auth.uid, 'routes-list'), RateLimits.READ);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rl.headers });
    }

    const routes = await getAllRoutes();
    return NextResponse.json(routes, { headers: rl.headers });
  } catch (error) {
    console.error('Error fetching routes:', error);
    return NextResponse.json(handleApiError(error, 'routes-get', 'Failed to fetch routes'), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Only admin/moderator can create routes
    const auth = await verifyApiAuth(request, ['admin', 'moderator']);
    if (!auth.authenticated) return auth.response;

    // Rate limit
    const rl = await applyRateLimit(createRateLimitId(auth.uid, 'routes-create'), RateLimits.CREATE);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rl.headers });
    }

    const newRouteData = await request.json();

    // Input validation
    if (!newRouteData.routeName || typeof newRouteData.routeName !== 'string' || newRouteData.routeName.length > 200) {
      return NextResponse.json({ error: 'Valid route name is required (max 200 chars)' }, { status: 400 });
    }
    if (!newRouteData.stops || !Array.isArray(newRouteData.stops)) {
      return NextResponse.json({ error: 'Stops array is required' }, { status: 400 });
    }

    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const newRoute = {
      routeId: newRouteData.routeId || `route_${Date.now()}`,
      routeName: newRouteData.routeName.trim().substring(0, 200),
      stops: newRouteData.stops,
      totalStops: newRouteData.stops.length,
      assignedBuses: newRouteData.assignedBuses || [],
      estimatedTime: (newRouteData.estimatedTime || '').substring(0, 50),
      status: newRouteData.status || 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.collection('routes').doc(newRoute.routeId).set(newRoute);

    return NextResponse.json({ id: newRoute.routeId, ...newRoute }, { status: 201, headers: rl.headers });
  } catch (error) {
    console.error('Error adding route:', error);
    return NextResponse.json(handleApiError(error, 'routes-post', 'Failed to add route'), { status: 500 });
  }
}