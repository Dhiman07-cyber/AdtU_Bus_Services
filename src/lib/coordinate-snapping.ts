/**
 * Coordinate Snapping Service
 * Snaps approximate coordinates to nearest routable roads
 * 
 * Strategy:
 * 1. Try ORS nearest endpoint with incremental radii
 * 2. Fallback to Nominatim reverse geocoding
 * 3. Mark as unsnappable if all fail
 */

import { validateCoordinate } from './coordinate-validator';

const ORS_BASE_URL = 'https://api.openrouteservice.org';
const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

export interface SnapResult {
  success: boolean;
  snappedLat?: number;
  snappedLng?: number;
  originalLat: number;
  originalLng: number;
  distance?: number; // meters from original
  method?: 'ors-nearest' | 'nominatim' | 'none';
  radius?: number;
  notes?: string;
  isSnapped: boolean;
}

export interface SnapConfig {
  apiKey: string;
  radii?: number[]; // Default: [350, 700, 1500]
  maxDistance?: number; // Don't accept snaps > this distance
  enableNominatim?: boolean;
}

/**
 * Calculate distance between two points (Haversine)
 */
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Snap using ORS nearest endpoint
 */
async function snapWithORS(
  lat: number,
  lng: number,
  radius: number,
  apiKey: string
): Promise<{ success: boolean; lat?: number; lng?: number; distance?: number }> {
  try {
    // ORS nearest endpoint format: /v2/directions/{profile}/geojson
    // Actually, use the snap endpoint if available, or nearest endpoint
    const url = `${ORS_BASE_URL}/v2/snap/driving-car`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        locations: [[lng, lat]],
        radius: radius
      })
    });

    if (!response.ok) {
      return { success: false };
    }

    const data = await response.json();
    
    if (data.features && data.features[0]) {
      const coords = data.features[0].geometry.coordinates;
      const snappedLng = coords[0];
      const snappedLat = coords[1];
      
      const distance = calculateDistance(lat, lng, snappedLat, snappedLng);
      
      return {
        success: true,
        lat: snappedLat,
        lng: snappedLng,
        distance
      };
    }

    return { success: false };
  } catch (error) {
    console.error('ORS snap error:', error);
    return { success: false };
  }
}

/**
 * Snap using Nominatim reverse geocoding
 */
async function snapWithNominatim(
  lat: number,
  lng: number
): Promise<{ success: boolean; lat?: number; lng?: number; distance?: number }> {
  try {
    const url = `${NOMINATIM_BASE_URL}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ADTU-Bus-System/1.0'
      }
    });

    if (!response.ok) {
      return { success: false };
    }

    const data = await response.json();
    
    if (data.lat && data.lon) {
      const snappedLat = parseFloat(data.lat);
      const snappedLng = parseFloat(data.lon);
      
      const distance = calculateDistance(lat, lng, snappedLat, snappedLng);
      
      return {
        success: true,
        lat: snappedLat,
        lng: snappedLng,
        distance
      };
    }

    return { success: false };
  } catch (error) {
    console.error('Nominatim snap error:', error);
    return { success: false };
  }
}

/**
 * Main snap function with multi-tier fallback
 */
export async function snapCoordinateToRoad(
  approxLat: number,
  approxLng: number,
  config: SnapConfig
): Promise<SnapResult> {
  // Validate input
  const validation = validateCoordinate(approxLng, approxLat);
  if (!validation.valid) {
    return {
      success: false,
      originalLat: approxLat,
      originalLng: approxLng,
      isSnapped: false,
      distance: 0,
      method: 'none',
      notes: validation.error
    };
  }

  const radii = config.radii || [350, 700, 1500];
  const maxDistance = config.maxDistance || 500; // Don't accept snaps > 500m away

  // Try ORS with incremental radii
  for (const radius of radii) {
    const result = await snapWithORS(approxLat, approxLng, radius, config.apiKey);
    
    if (result.success && result.lat && result.lng) {
      const distance = result.distance || 0;
      
      // Reject if snapped too far away
      if (distance > maxDistance) {
        console.warn(`⚠️ ORS snap rejected: ${distance.toFixed(1)}m > ${maxDistance}m limit`);
        continue;
      }

      console.log(`✅ Snapped with ORS (${radius}m radius): moved ${distance.toFixed(1)}m`);
      
      return {
        success: true,
        snappedLat: result.lat,
        snappedLng: result.lng,
        originalLat: approxLat,
        originalLng: approxLng,
        distance,
        method: 'ors-nearest',
        radius,
        isSnapped: true,
        notes: `Snapped to road using ORS (${radius}m search radius, ${distance.toFixed(1)}m from original)`
      };
    }
  }

  // Fallback to Nominatim if enabled
  if (config.enableNominatim) {
    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    const result = await snapWithNominatim(approxLat, approxLng);
    
    if (result.success && result.lat && result.lng) {
      const distance = result.distance || 0;
      
      if (distance > maxDistance) {
        console.warn(`⚠️ Nominatim snap rejected: ${distance.toFixed(1)}m > ${maxDistance}m limit`);
      } else {
        console.log(`✅ Snapped with Nominatim: moved ${distance.toFixed(1)}m`);
        
        return {
          success: true,
          snappedLat: result.lat,
          snappedLng: result.lng,
          originalLat: approxLat,
          originalLng: approxLng,
          distance,
          method: 'nominatim',
          isSnapped: true,
          notes: `Snapped using Nominatim reverse geocoding (${distance.toFixed(1)}m from original)`
        };
      }
    }
  }

  // Failed to snap
  console.warn(`❌ Could not snap coordinate (${approxLat}, ${approxLng})`);
  
  return {
    success: false,
    originalLat: approxLat,
    originalLng: approxLng,
    isSnapped: false,
    distance: 0,
    method: 'none',
    notes: 'Failed to snap to road after all attempts. Coordinate may not be near a routable road.'
  };
}

/**
 * Snap multiple stops in sequence
 */
export async function snapStops(
  stops: Array<{ lat: number; lng: number; [key: string]: any }>,
  config: SnapConfig,
  onProgress?: (index: number, total: number, result: SnapResult) => void
): Promise<Array<SnapResult & { stopIndex: number }>> {
  const results: Array<SnapResult & { stopIndex: number }> = [];

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    
    console.log(`📍 Snapping stop ${i + 1}/${stops.length}: (${stop.lat}, ${stop.lng})`);
    
    const result = await snapCoordinateToRoad(stop.lat, stop.lng, config);
    
    results.push({ ...result, stopIndex: i });
    
    if (onProgress) {
      onProgress(i, stops.length, result);
    }

    // Rate limit between snaps
    if (i < stops.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}

