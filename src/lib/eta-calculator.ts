/**
 * Interface for basic coordinates
 */
export interface Coordinate {
  lat: number;
  lng: number;
}

// Average bus speed in meters per second (approx 30 km/h)
const AVERAGE_SPEED_MPS = 8.33;

/**
 * Calculate ETA to a specific stop along a route using pure math (Haversine distance / speed)
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
    let totalDistance = 0;
    
    // Distance from bus to the first relevant stop
    totalDistance += haversineDistance(
      currentBusLocation.lat,
      currentBusLocation.lng,
      routeStops[0].lat,
      routeStops[0].lng
    );

    // Sum up the straight-line distance between stops up to the target
    for (let i = 1; i <= targetStopIndex; i++) {
      totalDistance += haversineDistance(
        routeStops[i - 1].lat,
        routeStops[i - 1].lng,
        routeStops[i].lat,
        routeStops[i].lng
      );
    }

    // Time = Distance / Speed
    const etaSeconds = Math.round(totalDistance / AVERAGE_SPEED_MPS);
    return etaSeconds;
  } catch (error) {
    console.error('Error calculating ETA to stop:', error);
    return null;
  }
}

/**
 * Calculate ETA to all stops on a route using pure math
 * 
 * PERF: Uses pure mathematical distance approximation instead of external API calls.
 * Zero latency, fully offline, and highly efficient.
 * 
 * @param routeStops All stops on the route in order
 * @param currentBusLocation Current location of the bus
 * @returns Array of ETAs in seconds for each stop, or null if calculation fails
 */
export async function calculateETAtoAllStops(
  routeStops: Coordinate[],
  currentBusLocation: Coordinate
): Promise<(number | null)[]> {
  if (routeStops.length === 0) return [];

  try {
    const etas: (number | null)[] = [];
    let cumulativeDistance = 0;

    for (let i = 0; i < routeStops.length; i++) {
      const from = i === 0 ? currentBusLocation : routeStops[i - 1];
      const to = routeStops[i];
      const d = haversineDistance(from.lat, from.lng, to.lat, to.lng);
      
      cumulativeDistance += d;
      etas.push(Math.round(cumulativeDistance / AVERAGE_SPEED_MPS));
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
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) {
    return "Unable to calculate";
  }

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
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}