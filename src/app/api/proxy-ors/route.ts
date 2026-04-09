import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { getRobustRoute, type ORSConfig } from '@/lib/ors-robust-client';
import { validateCoordinates } from '@/lib/coordinate-validator';
import { withSecurity } from '@/lib/security/api-security';
import { ProxyORSSchema, EmptySchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

// Initialize Supabase client
const supabase = getSupabaseServer();

const ORS_API_KEY = process.env.ORS_API_KEY || '';
const ORS_BASE_URL = 'https://api.openrouteservice.org';
const CACHE_EXPIRY_HOURS = 24;

const orsConfig: ORSConfig = {
  apiKey: ORS_API_KEY,
  radiusSteps: [350, 700, 1500],
  enableSnapping: true,
  logRequests: true
};

export const POST = withSecurity(
  async (request, { body, requestId }) => {
    try {
      const {
        action,
        coordinates,
        profile = 'driving-car',
        routeId,
        address,
        forceRefresh = false
      } = body;

      if (!ORS_API_KEY) {
        console.error(`[${requestId}] ORS_API_KEY not configured`);
        return NextResponse.json({ success: false, error: 'Routing service unavailable', requestId }, { status: 500 });
      }

      // 1. Directions Action
      if (action === 'directions') {
        if (!coordinates || !Array.isArray(coordinates)) {
          return NextResponse.json({ success: false, error: 'Invalid coordinates array provided', requestId }, { status: 400 });
        }

        // Coordinate Validation
        const validation = validateCoordinates(coordinates);
        if (!validation.valid) {
          return NextResponse.json({ 
            success: false, 
            error: 'Invalid coordinates format or range', 
            details: validation.errors,
            requestId 
          }, { status: 400 });
        }

        // Cache Lookup
        if (routeId && !forceRefresh) {
          const { data: cachedData } = await supabase
            .from('route_cache')
            .select('*')
            .eq('route_id', routeId)
            .gt('expires_at', new Date().toISOString())
            .maybeSingle();

          if (cachedData) {
            console.log(`✅ [${requestId}] Cache hit for route ${routeId}`);
            return NextResponse.json({
              success: true,
              cached: true,
              data: cachedData.geometry,
              distance: cachedData.distance,
              duration: cachedData.duration,
              requestId
            });
          }
        }

        // Fetch from ORS
        console.log(`🔄 [${requestId}] Fetching route from ORS for ${routeId || 'untracked route'}...`);
        const routeResult = await getRobustRoute(coordinates, profile, orsConfig);

        if (!routeResult.success) {
          console.error(`[${requestId}] ORS routing failed:`, routeResult.fallbackReason);
          return NextResponse.json({ 
            success: false, 
            error: 'Failed to calculate route', 
            details: routeResult.fallbackReason,
            requestId 
          }, { status: 422 });
        }

        // Update Cache (opportunistic)
        if (routeId) {
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + CACHE_EXPIRY_HOURS);

          supabase.from('route_cache').upsert({
            route_id: routeId,
            geometry: routeResult.geometry,
            distance: routeResult.distance,
            duration: routeResult.duration,
            fallback_used: routeResult.fallbackUsed || false,
            fallback_type: routeResult.fallbackType || 'none',
            fallback_reason: routeResult.fallbackReason || null,
            cached_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString()
          }).then(({ error }) => {
            if (error) console.error(`[${requestId}] Cache upsert error:`, error);
          });
        }

        return NextResponse.json({
          success: true,
          cached: false,
          data: routeResult.geometry,
          distance: routeResult.distance,
          duration: routeResult.duration,
          requestId
        });
      }

      // 2. Geocode Action
      if (action === 'geocode') {
        if (!address) {
          return NextResponse.json({ success: false, error: 'Address required for geocoding', requestId }, { status: 400 });
        }

        const orsUrl = `${ORS_BASE_URL}/geocode/search`;
        const orsResponse = await fetch(
          `${orsUrl}?api_key=${ORS_API_KEY}&text=${encodeURIComponent(address)}`,
          { method: 'GET', headers: { 'Accept': 'application/json' } }
        );

        if (!orsResponse.ok) {
          const errorText = await orsResponse.text();
          console.error(`[${requestId}] ORS Geocode error:`, errorText);
          return NextResponse.json({ success: false, error: 'Geocoding service failed', requestId }, { status: orsResponse.status });
        }

        const geocodeData = await orsResponse.json();
        if (!geocodeData.features?.length) {
          return NextResponse.json({ success: false, error: 'No results found for address', requestId }, { status: 404 });
        }

        const result = geocodeData.features[0];
        return NextResponse.json({
          success: true,
          data: {
            coordinates: result.geometry?.coordinates,
            label: result.properties?.label
          },
          requestId
        });
      }

      return NextResponse.json({ success: false, error: 'Invalid action provided', requestId }, { status: 400 });

    } catch (error: any) {
      console.error(`[${requestId}] Internal error in proxy-ors:`, error);
      return NextResponse.json({ success: false, error: 'An unexpected error occurred', requestId }, { status: 500 });
    }
  },
  {
    requiredRoles: ['admin', 'moderator'],
    schema: ProxyORSSchema,
    rateLimit: RateLimits.READ
  }
);

export const GET = withSecurity(
  async (request, { auth, requestId }) => {
    try {
      const url = new URL(request.url);
      const routeId = url.searchParams.get('routeId');

      if (!routeId) {
        return NextResponse.json({ success: false, error: 'routeId parameter required', requestId }, { status: 400 });
      }

      const { data: cachedData, error: cacheError } = await supabase
        .from('route_cache')
        .select('*')
        .eq('route_id', routeId)
        .maybeSingle();

      if (cacheError || !cachedData) {
        return NextResponse.json({ success: false, error: 'Cached route not found', requestId }, { status: 404 });
      }

      if (new Date(cachedData.expires_at) < new Date()) {
        return NextResponse.json({ success: false, error: 'Cached route has expired', requestId }, { status: 410 });
      }

      return NextResponse.json({
        success: true,
        data: cachedData.geometry,
        distance: cachedData.distance,
        duration: cachedData.duration,
        cachedAt: cachedData.cached_at,
        requestId
      });

    } catch (error: any) {
      console.error(`[${requestId}] Error retrieving cached route:`, error);
      return NextResponse.json({ success: false, error: 'Failed to retrieve cache', requestId }, { status: 500 });
    }
  },
  {
    requiredRoles: ['admin', 'moderator', 'student', 'driver'],
    schema: EmptySchema,
    rateLimit: RateLimits.READ
  }
);
