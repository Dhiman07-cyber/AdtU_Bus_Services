// OpenRouteService API integration for route geometry
const ORS_API_KEY = process.env.ORS_API_KEY || '';

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface RouteGeometry {
  coordinates: [number, number][]; // [lng, lat] format for GeoJSON
  distance: number;
  duration: number;
}

/**
 * Fetch route geometry from OpenRouteService API
 * @param coordinates Array of coordinate points [lat, lng]
 * @returns RouteGeometry object with coordinates and metadata
 */
export async function fetchRouteGeometry(coordinates: Coordinate[]): Promise<RouteGeometry | null> {
  if (!ORS_API_KEY) {
    console.warn('ORS_API_KEY not set, skipping route geometry fetch');
    return null;
  }

  if (coordinates.length < 2) {
    console.warn('At least 2 coordinates required to fetch route geometry');
    return null;
  }

  try {
    // Convert coordinates to the format expected by ORS API
    // ORS expects [lng, lat] format
    const orsCoordinates = coordinates.map(coord => [coord.lng, coord.lat]);

    const response = await fetch(
      `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${ORS_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coordinates: orsCoordinates,
          format: 'geojson',
          instructions: false,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ORS API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    
    // Extract route geometry from the response
    if (data.features && data.features.length > 0) {
      const feature = data.features[0];
      const geometry = feature.geometry;
      const properties = feature.properties;
      
      return {
        coordinates: geometry.coordinates,
        distance: properties?.summary?.distance || 0,
        duration: properties?.summary?.duration || 0,
      };
    }

    return null;
  } catch (error) {
    console.error('Error fetching route geometry from ORS:', error);
    return null;
  }
}

/**
 * Fetch route geometry using the proxy endpoint to avoid CORS issues
 * @param coordinates Array of coordinate points [lat, lng]
 * @returns RouteGeometry object with coordinates and metadata
 */
export async function fetchRouteGeometryViaProxy(coordinates: Coordinate[]): Promise<RouteGeometry | null> {
  if (coordinates.length < 2) {
    console.warn('At least 2 coordinates required to fetch route geometry');
    return null;
  }

  try {
    // Convert coordinates to the format expected by ORS: [[lng, lat], [lng, lat], ...]
    const orsCoordinates = coordinates.map(coord => [coord.lng, coord.lat]);

    const response = await fetch('/api/proxy-ors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'directions',
        coordinates: orsCoordinates,
        profile: 'driving-car'
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Proxy ORS error:', response.status, errorText);
      
      // Log more details about the error
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.orsError?.code === 2010) {
          console.warn('⚠️ ORS Coordinate Error:', errorData.suggestion);
          console.warn('This usually means a route stop is not on a valid road. Using straight-line fallback.');
        }
      } catch (e) {
        // Error text is not JSON, ignore
      }
      
      return null;
    }

    const data = await response.json();
    
    // Check if data has the expected structure
    if (!data?.data?.coordinates) {
      console.warn('ORS response missing geometry data, returning null');
      return null;
    }
    
    return data.data; // Return just the geometry data
  } catch (error) {
    console.error('Error fetching route geometry via proxy:', error);
    return null;
  }
}