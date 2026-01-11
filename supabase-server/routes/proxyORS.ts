import { Request, Response } from 'express';
import NodeCache from 'node-cache';
import { createClient } from '@supabase/supabase-js';

// Initialize cache with 5 minute TTL (300 seconds)
const cache = new NodeCache({ stdTTL: 300 });

// Initialize Supabase client with service role key for backend operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

interface Coordinate {
  lat: number;
  lng: number;
}

interface RouteGeometry {
  coordinates: [number, number][]; // [lng, lat] format for GeoJSON
  distance: number;
  duration: number;
}

export async function proxyORS(req: Request, res: Response) {
  try {
    const { coordinates, profile = 'driving-car', routeStops } = req.body;

    // Validate input
    let coordsToUse: Coordinate[] = coordinates || [];
    
    // If routeStops provided, extract coordinates from it
    if (routeStops && Array.isArray(routeStops)) {
      coordsToUse = routeStops.map((stop: any) => ({
        lat: stop.lat,
        lng: stop.lng
      }));
    }

    // If we still don't have coordinates, try to extract from the request body directly
    if (!coordsToUse || !Array.isArray(coordsToUse) || coordsToUse.length < 2) {
      // Try to parse coordinates from raw body if available
      if (req.body && typeof req.body === 'object') {
        if (req.body.coordinates && Array.isArray(req.body.coordinates)) {
          coordsToUse = req.body.coordinates;
        }
      }
    }

    if (!coordsToUse || !Array.isArray(coordsToUse) || coordsToUse.length < 2) {
      return res.status(400).json({
        error: 'Invalid coordinates. Must be an array of at least 2 [lat, lng] pairs.',
        received: {
          coordinates: coordinates,
          routeStops: routeStops,
          coordsToUse: coordsToUse
        }
      });
    }

    // Create cache key
    const cacheKey = `ors_${profile}_${JSON.stringify(coordsToUse)}`;
    
    // Check cache first
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) {
      return res.json(cachedResult);
    }

    // Validate ORS API key
    const orsApiKey = process.env.ORS_API_KEY;
    if (!orsApiKey) {
      // Fallback: calculate approximate ETA
      const approximateResult = calculateApproximateETA(coordsToUse);
      cache.set(cacheKey, approximateResult);
      return res.json({
        ...approximateResult,
        approximate: true
      });
    }

    // Call OpenRouteService API
    const response = await fetch(
      `https://api.openrouteservice.org/v2/directions/${profile}/geojson`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': orsApiKey
        },
        body: JSON.stringify({
          coordinates: coordsToUse.map(coord => [coord.lng, coord.lat]), // ORS expects [lng, lat]
          format: 'geojson',
          instructions: false
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ORS API error:', errorText);
      
      // Fallback: calculate approximate ETA
      const approximateResult = calculateApproximateETA(coordsToUse);
      cache.set(cacheKey, approximateResult);
      return res.json({
        ...approximateResult,
        approximate: true,
        fallback: true
      });
    }

    const data: any = await response.json();
    
    // Extract route geometry from the response
    let result: RouteGeometry | null = null;
    
    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      const geometry = feature.geometry;
      const properties = feature.properties;
      
      result = {
        coordinates: geometry.coordinates,
        distance: properties?.summary?.distance || 0,
        duration: properties?.summary?.duration || 0,
      };
    }
    
    if (result) {
      // Cache the result
      cache.set(cacheKey, result);
      
      // Store route geometry in Supabase cache table for re-use
      try {
        // Create a unique key for this route
        const routeKey = coordsToUse.map(c => `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`).join('|');
        
        await supabase
          .from('route_cache')
          .upsert({
            route_key: routeKey,
            profile: profile,
            geometry: result,
            created_at: new Date().toISOString()
          }, {
            onConflict: 'route_key,profile'
          });
      } catch (cacheError) {
        console.error('Error caching route geometry in Supabase:', cacheError);
      }
      
      return res.json(result);
    } else {
      // Fallback: calculate approximate ETA
      const approximateResult = calculateApproximateETA(coordsToUse);
      cache.set(cacheKey, approximateResult);
      return res.json({
        ...approximateResult,
        approximate: true,
        fallback: true
      });
    }
  } catch (error: any) {
    console.error('Error proxying ORS request:', error);
    
    // Fallback: calculate approximate ETA
    const { coordinates, routeStops } = req.body;
    let coordsToUse: Coordinate[] = coordinates || [];
    
    if (routeStops && Array.isArray(routeStops)) {
      coordsToUse = routeStops.map((stop: any) => ({
        lat: stop.lat,
        lng: stop.lng
      }));
    }
    
    if (coordsToUse && coordsToUse.length >= 2) {
      const approximateResult = calculateApproximateETA(coordsToUse);
      return res.json({
        ...approximateResult,
        approximate: true,
        fallback: true
      });
    }
    
    return res.status(500).json({
      error: error.message || 'Failed to proxy ORS request'
    });
  }
}

// Calculate approximate ETA based on distance and average speed
function calculateApproximateETA(coordinates: Coordinate[]): RouteGeometry {
  if (coordinates.length < 2) {
    return {
      coordinates: [],
      distance: 0,
      duration: 0
    };
  }
  
  // Calculate total distance using haversine formula
  let totalDistance = 0; // in meters
  
  for (let i = 0; i < coordinates.length - 1; i++) {
    const coord1 = coordinates[i];
    const coord2 = coordinates[i + 1];
    totalDistance += haversineDistance(coord1.lat, coord1.lng, coord2.lat, coord2.lng);
  }
  
  // Average speed in urban areas (adjust as needed)
  const averageSpeed = 15; // km/h
  
  // Calculate duration in seconds
  const duration = (totalDistance / 1000) / averageSpeed * 3600;
  
  // Create a simple straight-line geometry
  const straightLineCoords: [number, number][] = coordinates.map(coord => [coord.lng, coord.lat]);
  
  return {
    coordinates: straightLineCoords,
    distance: totalDistance,
    duration: Math.round(duration)
  };
}

// Haversine formula to calculate distance between two points
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}