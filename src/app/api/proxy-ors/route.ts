import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRobustRoute, type ORSConfig } from '@/lib/ors-robust-client';
import { validateCoordinates } from '@/lib/coordinate-validator';

// Initialize Supabase client with service role for caching
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const ORS_API_KEY = process.env.ORS_API_KEY || '';
const ORS_BASE_URL = 'https://api.openrouteservice.org';

// Cache expiry in hours
const CACHE_EXPIRY_HOURS = 24;

// ORS configuration
const orsConfig: ORSConfig = {
  apiKey: ORS_API_KEY,
  radiusSteps: [350, 700, 1500], // Incremental retry radii
  enableSnapping: true, // Enable coordinate snapping
  logRequests: true // Log all ORS requests for debugging
};

/**
 * POST /api/proxy-ors
 * 
 * Proxies requests to OpenRouteService API with server-side API key
 * Caches route geometries in Supabase route_cache table
 * 
 * Body:
 * - action: 'directions' | 'geocode'
 * - coordinates: [[lng, lat], [lng, lat], ...] (for directions)
 * - profile: 'driving-car' | 'cycling-regular' | 'foot-walking' (default: driving-car)
 * - routeId?: string (optional, for caching by routeId)
 * - address?: string (for geocoding)
 */
export async function POST(request: Request) {
  try {
    // Clone request body to avoid mutation errors
    const body = await request.json();
    const requestData = JSON.parse(JSON.stringify(body)); // Deep clone to prevent read-only issues
    
    const { 
      action, 
      coordinates, 
      profile = 'driving-car', 
      routeId, 
      address,
      forceRefresh = false 
    } = requestData;

    if (!ORS_API_KEY) {
      console.error('❌ ORS_API_KEY not configured in environment');
      return NextResponse.json(
        { error: 'ORS API key not configured' },
        { status: 500 }
      );
    }

    // ===== DIRECTIONS ACTION =====
    if (action === 'directions') {
      // Validate input
      if (!coordinates || !Array.isArray(coordinates)) {
        return NextResponse.json(
          { error: 'Invalid coordinates - must be an array' },
          { status: 400 }
        );
      }

      // Early validation using our validator
      const validation = validateCoordinates(coordinates);
      
      if (!validation.valid) {
        console.error('❌ Coordinate validation failed:', {
          routeId,
          errors: validation.errors,
          coordinates
        });
        
        return NextResponse.json(
          { 
            error: 'Invalid coordinates',
            details: validation.errors,
            suggestion: 'Check that all coordinates are numeric and within valid lat/lng ranges'
          },
          { status: 400 }
        );
      }

      if (validation.warnings.length > 0) {
        console.warn('⚠️ Coordinate warnings:', validation.warnings);
      }

      // Check cache first (if routeId provided and not forcing refresh)
      if (routeId && !forceRefresh) {
        const { data: cachedData, error: cacheError } = await supabase
          .from('route_cache')
          .select('*')
          .eq('route_id', routeId)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        if (!cacheError && cachedData) {
          console.log(`✅ Cache hit for route ${routeId}`);
          return NextResponse.json({
            success: true,
            cached: true,
            data: cachedData.geometry,
            distance: cachedData.distance,
            duration: cachedData.duration,
            fallbackUsed: cachedData.fallback_used || false,
            fallbackType: cachedData.fallback_type || 'none',
            fallbackReason: cachedData.fallback_reason
          });
        }
      }

      console.log(`🔄 Fetching route from ORS for ${routeId || 'unknown route'}...`);

      // Use robust ORS client with 3-tier fallback
      const routeResult = await getRobustRoute(
        coordinates,
        profile,
        orsConfig
      );

      if (!routeResult.success) {
        console.error('❌ Route fetching failed:', {
          routeId,
          reason: routeResult.fallbackReason,
          attempts: routeResult.attempts
        });
        
        return NextResponse.json(
          { 
            error: 'Failed to fetch route',
            details: routeResult.fallbackReason,
            attempts: routeResult.attempts,
            suggestion: 'One or more coordinates may not be on routable roads. Check route configuration in admin panel.'
          },
          { status: 422 }
        );
      }

      // Log the result
      if (routeResult.fallbackUsed) {
        console.warn(`⚠️ Route ${routeId} using fallback: ${routeResult.fallbackType}`, {
          reason: routeResult.fallbackReason,
          attempts: routeResult.attempts?.length
        });
      } else {
        console.log(`✅ Route ${routeId} fetched successfully from ORS`);
      }

      const { geometry, distance, duration, fallbackUsed, fallbackType, fallbackReason } = routeResult;

      // Cache the result if routeId provided
      if (routeId) {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + CACHE_EXPIRY_HOURS);

        const { error: cacheWriteError } = await supabase
          .from('route_cache')
          .upsert({
            route_id: routeId,
            geometry,
            distance,
            duration,
            fallback_used: fallbackUsed || false,
            fallback_type: fallbackType || 'none',
            fallback_reason: fallbackReason || null,
            cached_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString()
          });

        if (cacheWriteError) {
          console.error('❌ Error caching route:', cacheWriteError);
          // Don't fail the request
        } else {
          console.log(`✅ Route ${routeId} cached successfully`);
        }
      }

      return NextResponse.json({
        success: true,
        cached: false,
        data: geometry,
        distance,
        duration,
        fallbackUsed: fallbackUsed || false,
        fallbackType: fallbackType || 'none',
        fallbackReason: fallbackReason || null,
        attempts: routeResult.attempts
      });
    }

    // ===== GEOCODE ACTION =====
    else if (action === 'geocode') {
      if (!address) {
        return NextResponse.json(
          { error: 'Address is required for geocoding' },
          { status: 400 }
        );
      }

      const orsUrl = `${ORS_BASE_URL}/geocode/search`;
      
      const orsResponse = await fetch(
        `${orsUrl}?api_key=${ORS_API_KEY}&text=${encodeURIComponent(address)}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        }
      );

      if (!orsResponse.ok) {
        const errorText = await orsResponse.text();
        console.error('ORS Geocode API error:', errorText);
        return NextResponse.json(
          { error: 'Failed to geocode address', details: errorText },
          { status: orsResponse.status }
        );
      }

      const geocodeData = await orsResponse.json();

      if (!geocodeData.features || geocodeData.features.length === 0) {
        return NextResponse.json(
          { error: 'No results found for address' },
          { status: 404 }
        );
      }

      // Return the first result
      const result = geocodeData.features[0];
      const coordinates = result.geometry?.coordinates; // [lng, lat]
      const label = result.properties?.label;

      return NextResponse.json({
        success: true,
        data: {
          coordinates: coordinates, // [lng, lat]
          lat: 0,
          lng: 0,
          label
        }
      });
    }

    // ===== INVALID ACTION =====
    else {
      return NextResponse.json(
        { error: 'Invalid action - must be "directions" or "geocode"' },
        { status: 400 }
      );
    }

  } catch (error: any) {
    console.error('Error in ORS proxy:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process ORS request' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/proxy-ors?routeId=xxx
 * 
 * Get cached route geometry
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const routeId = url.searchParams.get('routeId');

    if (!routeId) {
      return NextResponse.json(
        { error: 'routeId parameter is required' },
        { status: 400 }
      );
    }

    // Get cached route
    const { data: cachedData, error: cacheError } = await supabase
      .from('route_cache')
      .select('*')
      .eq('route_id', routeId)
      .maybeSingle();

    if (cacheError || !cachedData) {
      return NextResponse.json(
        { error: 'Cached route not found' },
        { status: 404 }
      );
    }

    // Check if expired
    if (new Date(cachedData.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'Cached route has expired', expired: true },
        { status: 410 }
      );
    }

    return NextResponse.json({
      success: true,
      data: cachedData.geometry,
      distance: cachedData.distance,
      duration: cachedData.duration,
      cachedAt: cachedData.cached_at
    });

  } catch (error: any) {
    console.error('Error getting cached route:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get cached route' },
      { status: 500 }
    );
  }
}
