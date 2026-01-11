/**
 * Coordinate Validation & Normalization Utilities
 * Ensures all coordinates are valid before calling ORS or any mapping service
 */

export interface ValidatedCoordinate {
  lng: number;
  lat: number;
  original?: { lng: any; lat: any };
  normalized: boolean;
}

export interface CoordinateValidationResult {
  valid: boolean;
  coordinates?: ValidatedCoordinate[];
  errors: string[];
  warnings: string[];
}

/**
 * Validate and normalize a single coordinate pair
 */
export function validateCoordinate(lng: any, lat: any): { valid: boolean; lng?: number; lat?: number; error?: string } {
  // Type validation
  const lngNum = typeof lng === 'number' ? lng : Number(lng);
  const latNum = typeof lat === 'number' ? lat : Number(lat);

  // NaN check
  if (isNaN(lngNum) || isNaN(latNum)) {
    return {
      valid: false,
      error: `Invalid coordinate types: lng=${typeof lng}, lat=${typeof lat}`
    };
  }

  // Null/undefined check
  if (lng === null || lng === undefined || lat === null || lat === undefined) {
    return {
      valid: false,
      error: 'Coordinate contains null or undefined values'
    };
  }

  // Range validation
  if (latNum < -90 || latNum > 90) {
    return {
      valid: false,
      error: `Latitude ${latNum} out of range [-90, 90]`
    };
  }

  if (lngNum < -180 || lngNum > 180) {
    return {
      valid: false,
      error: `Longitude ${lngNum} out of range [-180, 180]`
    };
  }

  // Check for obviously bogus coordinates (0,0 or very small values that might be placeholders)
  if (lngNum === 0 && latNum === 0) {
    return {
      valid: false,
      error: 'Coordinate is (0,0) - likely a placeholder'
    };
  }

  // For ADTU Guwahati - validate coordinates are in reasonable range for Assam
  // Guwahati is roughly: 26.0-26.3°N, 91.6-92.0°E
  const isInAssam = latNum >= 24 && latNum <= 28 && lngNum >= 89 && lngNum <= 96;
  
  return {
    valid: true,
    lng: lngNum,
    lat: latNum,
    ...(!isInAssam && { warning: 'Coordinate outside expected Assam region' })
  };
}

/**
 * Validate an array of coordinates (typically for routing)
 * Input can be [[lng,lat]...] or [{lng,lat}...]
 */
export function validateCoordinates(coords: any[]): CoordinateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const validated: ValidatedCoordinate[] = [];

  if (!Array.isArray(coords)) {
    return {
      valid: false,
      errors: ['Coordinates must be an array'],
      warnings: []
    };
  }

  if (coords.length < 2) {
    return {
      valid: false,
      errors: ['At least 2 coordinates required for routing'],
      warnings: []
    };
  }

  coords.forEach((coord, index) => {
    let lng, lat;

    // Handle array format [lng, lat]
    if (Array.isArray(coord)) {
      [lng, lat] = coord;
    }
    // Handle object format {lng, lat} or {lon, lat}
    else if (typeof coord === 'object' && coord !== null) {
      lng = coord.lng || coord.lon || coord.longitude;
      lat = coord.lat || coord.latitude;
    } else {
      errors.push(`Coordinate at index ${index} is invalid format`);
      return;
    }

    const result = validateCoordinate(lng, lat);
    
    if (!result.valid) {
      errors.push(`Coordinate ${index}: ${result.error}`);
    } else {
      validated.push({
        lng: result.lng!,
        lat: result.lat!,
        original: { lng, lat },
        normalized: lng !== result.lng || lat !== result.lat
      });

      if ((result as any).warning) {
        warnings.push(`Coordinate ${index}: ${(result as any).warning}`);
      }
    }
  });

  return {
    valid: errors.length === 0,
    coordinates: validated,
    errors,
    warnings
  };
}

/**
 * Convert validated coordinates to ORS format [lng, lat]
 */
export function toORSFormat(coords: ValidatedCoordinate[]): [number, number][] {
  return coords.map(c => [c.lng, c.lat]);
}

/**
 * Convert validated coordinates to Leaflet format [lat, lng]
 */
export function toLeafletFormat(coords: ValidatedCoordinate[]): [number, number][] {
  return coords.map(c => [c.lat, c.lng]);
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in meters
 */
export function calculateDistance(
  coord1: { lat: number; lng: number },
  coord2: { lat: number; lng: number }
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (coord1.lat * Math.PI) / 180;
  const φ2 = (coord2.lat * Math.PI) / 180;
  const Δφ = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const Δλ = ((coord2.lng - coord1.lng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}











