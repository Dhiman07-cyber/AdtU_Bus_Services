/**
 * GEOCODING SERVICE
 * 
 * Purpose: Search for place names on the map and get accurate routable coordinates
 * 
 * This solves the problem where stored coordinates are approximate or point to
 * building centers instead of road entrances.
 */

interface GeocodingResult {
  success: boolean;
  lat?: number;
  lng?: number;
  displayName?: string;
  address?: string;
  distance?: number; // Distance from original coordinate
  source?: string; // 'nominatim', 'ors', etc.
  error?: string;
}

/**
 * Geocode a place name to get routable coordinates
 * 
 * Example: "ADTU Campus, Guwahati, Assam" → actual entrance coordinates
 */
export async function geocodePlaceName(
  placeName: string,
  cityContext: string = 'Guwahati, Assam, India',
  originalLat?: number,
  originalLng?: number
): Promise<GeocodingResult> {
  
  // Construct full search query
  const searchQuery = `${placeName}, ${cityContext}`;
  
  console.log(`🔍 Geocoding: "${searchQuery}"`);
  
  try {
    // Use Nominatim for free geocoding
    const encodedQuery = encodeURIComponent(searchQuery);
    const url = `https://nominatim.openstreetmap.org/search?q=${encodedQuery}&format=json&limit=1&addressdetails=1`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ADTU-Bus-Tracking-System/1.0'
      }
    });
    
    if (!response.ok) {
      return {
        success: false,
        error: `Nominatim returned ${response.status}`
      };
    }
    
    const results = await response.json();
    
    if (results.length === 0) {
      console.warn(`❌ No geocoding results for: ${searchQuery}`);
      return {
        success: false,
        error: 'No results found'
      };
    }
    
    const result = results[0];
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    
    // Calculate distance from original coordinate if provided
    let distance: number | undefined;
    if (originalLat !== undefined && originalLng !== undefined) {
      distance = calculateDistance(originalLat, originalLng, lat, lng);
    }
    
    console.log(`✅ Geocoded to: (${lat}, ${lng})`);
    if (distance !== undefined) {
      console.log(`   Distance from original: ${distance.toFixed(1)}m`);
    }
    
    return {
      success: true,
      lat,
      lng,
      displayName: result.display_name,
      address: formatAddress(result.address),
      distance,
      source: 'nominatim'
    };
    
  } catch (error: any) {
    console.error(`❌ Geocoding error:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Smart coordinate resolution: Try geocoding by name first, fall back to snapping
 */
export async function resolveStopCoordinate(
  stopName: string,
  approxLat: number,
  approxLng: number,
  cityContext: string = 'Guwahati, Assam, India'
): Promise<{
  lat: number;
  lng: number;
  method: 'geocoded' | 'original';
  distance?: number;
  notes: string;
}> {
  
  // Try geocoding by place name first
  const geocoded = await geocodePlaceName(stopName, cityContext, approxLat, approxLng);
  
  if (geocoded.success && geocoded.lat && geocoded.lng) {
    // Check if geocoded result is reasonable (within 5km of original)
    const distance = geocoded.distance || 0;
    
    if (distance < 5000) {
      return {
        lat: geocoded.lat,
        lng: geocoded.lng,
        method: 'geocoded',
        distance,
        notes: `Geocoded from "${stopName}" - ${geocoded.displayName}`
      };
    } else {
      console.warn(`⚠️ Geocoded result too far (${distance.toFixed(0)}m), using original`);
    }
  }
  
  // Fallback to original coordinates
  return {
    lat: approxLat,
    lng: approxLng,
    method: 'original',
    notes: 'Using stored coordinates (geocoding failed or result too far)'
  };
}

// Helper: Calculate distance between two coordinates
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

// Helper: Format address from Nominatim response
function formatAddress(address: any): string {
  if (!address) return '';
  
  const parts = [
    address.road,
    address.suburb || address.neighbourhood,
    address.city || address.town,
    address.state
  ].filter(Boolean);
  
  return parts.join(', ');
}











