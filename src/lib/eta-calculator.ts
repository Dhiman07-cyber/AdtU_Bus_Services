import { Coordinate, RouteGeometry, fetchRouteGeometryViaProxy } from './ors-service';

/**
 * Calculate ETA to a specific stop along a route
 * @param routeStops All stops on the route in order
 * @param currentBusLocation Current location of the bus
 * @param targetStopIndex Index of the target stop in the routeStops array
 * @returns ETA in seconds or null if calculation fails
 */
export async function calculateETAtoStop(
  routeStops: Coordinate[],
  currentBusLocation: Coordinate,
  targetStopIndex: number
): Promise<number | null> {
  if (targetStopIndex < 0 || targetStopIndex >= routeStops.length) {
    console.error('Invalid target stop index');
    return null;
  }

  try {
    // Get the segment of the route from current bus location to target stop
    const routeSegment: Coordinate[] = [currentBusLocation];
    
    // Add all stops from current position to target stop
    for (let i = 0; i <= targetStopIndex; i++) {
      routeSegment.push(routeStops[i]);
    }

    // Fetch route geometry for this segment
    const routeGeometry = await fetchRouteGeometryViaProxy(routeSegment);
    
    if (routeGeometry) {
      return routeGeometry.duration;
    }

    return null;
  } catch (error) {
    console.error('Error calculating ETA to stop:', error);
    return null;
  }
}

/**
 * Calculate ETA to all stops on a route
 * @param routeStops All stops on the route in order
 * @param currentBusLocation Current location of the bus
 * @returns Array of ETAs in seconds for each stop, or null if calculation fails
 */
export async function calculateETAtoAllStops(
  routeStops: Coordinate[],
  currentBusLocation: Coordinate
): Promise<(number | null)[]> {
  try {
    const etas: (number | null)[] = [];
    
    // Calculate ETA for each stop
    for (let i = 0; i < routeStops.length; i++) {
      const eta = await calculateETAtoStop(routeStops, currentBusLocation, i);
      etas.push(eta);
    }
    
    return etas;
  } catch (error) {
    console.error('Error calculating ETAs to all stops:', error);
    return routeStops.map(() => null);
  }
}

/**
 * Format duration in seconds to a human-readable string
 * @param seconds Duration in seconds
 * @returns Formatted time string (e.g., "5 mins", "1 hour 15 mins")
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)} seconds`;
  }
  
  const minutes = Math.round(seconds / 60);
  
  if (minutes < 60) {
    return `${minutes} min${minutes !== 1 ? 's' : ''}`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  
  return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} min${remainingMinutes !== 1 ? 's' : ''}`;
}

/**
 * Get the next stop index based on current bus location
 * @param routeStops All stops on the route in order
 * @param currentBusLocation Current location of the bus
 * @returns Index of the next stop, or null if calculation fails
 */
export function getNextStopIndex(
  routeStops: Coordinate[],
  currentBusLocation: Coordinate
): number | null {
  if (routeStops.length === 0) {
    return null;
  }
  
  if (routeStops.length === 1) {
    return 0;
  }
  
  // Find the closest stop to the current bus location
  let minDistance = Infinity;
  let closestStopIndex = 0;
  
  for (let i = 0; i < routeStops.length; i++) {
    const stop = routeStops[i];
    const distance = haversineDistance(
      currentBusLocation.lat,
      currentBusLocation.lng,
      stop.lat,
      stop.lng
    );
    
    if (distance < minDistance) {
      minDistance = distance;
      closestStopIndex = i;
    }
  }
  
  // Return the next stop (or the last stop if we're at the end)
  return Math.min(closestStopIndex + 1, routeStops.length - 1);
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