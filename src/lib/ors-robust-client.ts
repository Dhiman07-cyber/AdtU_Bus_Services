/**
 * Robust ORS Client with 3-Tier Fallback
 * Implements snap-to-road, incremental radius retry, and straight-line fallback
 */

import { validateCoordinates, toORSFormat, calculateDistance, ValidatedCoordinate } from './coordinate-validator';

const ORS_BASE_URL = 'https://api.openrouteservice.org';
const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

export interface ORSConfig {
  apiKey: string;
  maxRetries?: number;
  radiusSteps?: number[]; // e.g., [350, 700, 1500] meters
  enableSnapping?: boolean;
  logRequests?: boolean;
}

export interface RouteResult {
  success: boolean;
  geometry?: any;
  distance?: number;
  duration?: number;
  fallbackUsed?: boolean;
  fallbackType?: 'none' | 'snapped' | 'increased-radius' | 'straight-line';
  fallbackReason?: string;
  originalError?: any;
  attempts?: Array<{
    method: string;
    radius?: number;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Snap a coordinate to the nearest road using Nominatim reverse geocoding
 * This is free but rate-limited (1 req/sec)
 */
async function snapToNearestRoad(
  coord: { lat: number; lng: number },
  config: ORSConfig
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `${NOMINATIM_BASE_URL}/reverse?format=json&lat=${coord.lat}&lon=${coord.lng}&zoom=18`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ADTU-Bus-System/1.0' // Required by Nominatim
      }
    });

    if (!response.ok) {
      console.warn(`Nominatim snap failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (data.lat && data.lon) {
      const snapped = {
        lat: parseFloat(data.lat),
        lng: parseFloat(data.lon)
      };

      // Only use if snapping didn't move it too far (max 500m)
      const distance = calculateDistance(coord, snapped);
      if (distance < 500) {
        console.log(`✅ Snapped coordinate to road: moved ${distance.toFixed(1)}m`);
        return snapped;
      } else {
        console.warn(`⚠️ Snap moved coordinate too far: ${distance.toFixed(1)}m`);
        return null;
      }
    }

    return null;
  } catch (error) {
    console.error('Error in snapToNearestRoad:', error);
    return null;
  }
}

/**
 * Try to get ORS route with a specific radius
 */
async function tryORSWithRadius(
  coordinates: [number, number][],
  profile: string,
  radius: number,
  config: ORSConfig
): Promise<{ success: boolean; data?: any; error?: any }> {
  try {
    const url = `${ORS_BASE_URL}/v2/directions/${profile}`;
    
    if (config.logRequests) {
      console.log(`🔄 Trying ORS with radius ${radius}m`, {
        url,
        coordinateCount: coordinates.length,
        firstCoord: coordinates[0],
        lastCoord: coordinates[coordinates.length - 1]
      });
    }

    // Build ORS request body - clone to avoid mutation
    const requestBody = {
      coordinates: JSON.parse(JSON.stringify(coordinates)), // Deep clone
      format: 'geojson',
      instructions: false,
      elevation: false,
      ...(radius !== 350 && { radiuses: coordinates.map(() => radius) }) // Only add if non-default
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': config.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();

    if (!response.ok) {
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { message: responseText };
      }

      return {
        success: false,
        error: errorData
      };
    }

    const data = JSON.parse(responseText);
    return {
      success: true,
      data
    };

  } catch (error) {
    return {
      success: false,
      error: { message: error instanceof Error ? error.message : 'Unknown error' }
    };
  }
}

/**
 * Create straight-line fallback geometry
 */
function createStraightLineFallback(coordinates: [number, number][]): any {
  // Calculate approximate distance and duration
  let totalDistance = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const dist = calculateDistance(
      { lat: coordinates[i][1], lng: coordinates[i][0] },
      { lat: coordinates[i + 1][1], lng: coordinates[i + 1][0] }
    );
    totalDistance += dist;
  }

  // Assume average speed of 30 km/h for duration estimation
  const avgSpeedKmh = 30;
  const durationSeconds = (totalDistance / 1000) / avgSpeedKmh * 3600;

  return {
    type: 'LineString',
    coordinates: coordinates
  };
}

/**
 * Main robust routing function with 3-tier fallback
 */
export async function getRobustRoute(
  inputCoordinates: any[],
  profile: string = 'driving-car',
  config: ORSConfig
): Promise<RouteResult> {
  const attempts: RouteResult['attempts'] = [];
  
  // Step 0: Validate and normalize coordinates
  const validation = validateCoordinates(inputCoordinates);
  
  if (!validation.valid) {
    console.error('❌ Coordinate validation failed:', validation.errors);
    return {
      success: false,
      fallbackUsed: false,
      fallbackReason: `Invalid coordinates: ${validation.errors.join(', ')}`,
      attempts
    };
  }

  if (validation.warnings.length > 0 && config.logRequests) {
    console.warn('⚠️ Coordinate warnings:', validation.warnings);
  }

  const validatedCoords = validation.coordinates!;
  let coordinates = toORSFormat(validatedCoords);

  // Step 1: Try standard ORS request with default radius (350m)
  const radiusSteps = config.radiusSteps || [350, 700, 1500];
  
  for (const radius of radiusSteps) {
    const result = await tryORSWithRadius(coordinates, profile, radius, config);
    
    attempts.push({
      method: `ORS with ${radius}m radius`,
      radius,
      success: result.success,
      error: result.error?.error?.message || result.error?.message
    });

    if (result.success && result.data?.features?.[0]?.geometry) {
      const feature = result.data.features[0];
      const geometry = feature.geometry;
      const properties = feature.properties;

      console.log(`✅ ORS succeeded with radius ${radius}m`);

      return {
        success: true,
        geometry,
        distance: properties?.summary?.distance,
        duration: properties?.summary?.duration,
        fallbackUsed: radius !== 350,
        fallbackType: radius !== 350 ? 'increased-radius' : 'none',
        fallbackReason: radius !== 350 ? `Required ${radius}m search radius` : undefined,
        attempts
      };
    }

    // Check if error is due to non-routable point
    const errorCode = result.error?.error?.code;
    if (errorCode !== 2010) {
      // Different error - don't retry
      break;
    }

    console.warn(`⚠️ ORS failed with ${radius}m radius:`, result.error?.error?.message);
  }

  // Step 2: Try snapping non-routable coordinates to roads
  if (config.enableSnapping) {
    console.log('🔄 Attempting coordinate snapping...');
    
    const snappedCoords: [number, number][] = [];
    let snappedAny = false;

    for (let i = 0; i < validatedCoords.length; i++) {
      const coord = validatedCoords[i];
      const snapped = await snapToNearestRoad({ lat: coord.lat, lng: coord.lng }, config);
      
      if (snapped) {
        snappedCoords.push([snapped.lng, snapped.lat]);
        snappedAny = true;
        
        // Rate limit for Nominatim
        if (i < validatedCoords.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1100)); // 1.1 second delay
        }
      } else {
        snappedCoords.push([coord.lng, coord.lat]);
      }
    }

    if (snappedAny) {
      // Try ORS again with snapped coordinates
      const snappedResult = await tryORSWithRadius(snappedCoords, profile, 350, config);
      
      attempts.push({
        method: 'ORS with snapped coordinates',
        success: snappedResult.success,
        error: snappedResult.error?.error?.message || snappedResult.error?.message
      });

      if (snappedResult.success && snappedResult.data?.features?.[0]?.geometry) {
        console.log('✅ ORS succeeded with snapped coordinates');
        const feature = snappedResult.data.features[0];
        
        return {
          success: true,
          geometry: feature.geometry,
          distance: feature.properties?.summary?.distance,
          duration: feature.properties?.summary?.duration,
          fallbackUsed: true,
          fallbackType: 'snapped',
          fallbackReason: 'Coordinates snapped to nearest roads',
          attempts
        };
      }
    }
  }

  // Step 3: Straight-line fallback
  console.warn('⚠️ All ORS attempts failed - using straight-line fallback');
  
  const straightLineGeometry = createStraightLineFallback(coordinates);
  
  // Calculate straight-line distance and duration
  let totalDistance = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    totalDistance += calculateDistance(
      { lat: coordinates[i][1], lng: coordinates[i][0] },
      { lat: coordinates[i + 1][1], lng: coordinates[i + 1][0] }
    );
  }
  
  const avgSpeedKmh = 30;
  const durationSeconds = (totalDistance / 1000) / avgSpeedKmh * 3600;

  attempts.push({
    method: 'Straight-line fallback',
    success: true
  });

  return {
    success: true,
    geometry: straightLineGeometry,
    distance: totalDistance,
    duration: durationSeconds,
    fallbackUsed: true,
    fallbackType: 'straight-line',
    fallbackReason: 'One or more coordinates not on routable roads. Route shown as straight lines.',
    originalError: attempts[attempts.length - 1]?.error,
    attempts
  };
}











