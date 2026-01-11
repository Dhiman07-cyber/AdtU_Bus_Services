/**
 * Location Service Types
 * Common types for all location strategies
 */

export interface LocationCoordinates {
  accuracy: number;
  altitude?: number;
  altitudeAccuracy?: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

export interface LocationError {
  code: number;
  message: string;
  userFriendlyMessage: string;
}

export interface LocationOptions {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
  updateInterval?: number; // For native mobile (milliseconds)
  fastestInterval?: number; // For native mobile (milliseconds)
  distanceFilter?: number; // Minimum distance to trigger update (meters)
  backgroundUpdates?: boolean; // Enable background location updates
}

export interface LocationUpdate {
  busId?: string;
  driverId?: string;
  routeId?: string;
  coordinates: LocationCoordinates;
  source: 'gps' | 'network' | 'fused' | 'manual';
  deviceType: 'mobile' | 'desktop';
}

export type LocationCallback = (location: LocationCoordinates) => void;
export type ErrorCallback = (error: LocationError) => void;

/**
 * Location Strategy Interface
 * All location strategies must implement this interface
 */
export interface ILocationStrategy {
  /**
   * Start watching location
   */
  startTracking(
    options: LocationOptions,
    onLocation: LocationCallback,
    onError: ErrorCallback
  ): Promise<string>; // Returns watchId
  
  /**
   * Stop watching location
   */
  stopTracking(watchId: string): Promise<void>;
  
  /**
   * Get current location once
   */
  getCurrentPosition(
    options: LocationOptions
  ): Promise<LocationCoordinates>;
  
  /**
   * Check if strategy is available on current device
   */
  isAvailable(): Promise<boolean>;
  
  /**
   * Get strategy name
   */
  getName(): string;
  
  /**
   * Request necessary permissions
   */
  requestPermissions(background?: boolean): Promise<boolean>;
  
  /**
   * Check permission status
   */
  checkPermissions(): Promise<{
    location: 'granted' | 'denied' | 'prompt';
    backgroundLocation?: 'granted' | 'denied' | 'prompt';
  }>;
}

/**
 * Location validation constraints
 */
export const LOCATION_CONSTRAINTS = {
  MIN_ACCURACY: 100, // meters - reject locations worse than this
  MAX_AGE: 10000, // milliseconds - reject locations older than this
  MIN_MOVEMENT: 5, // meters - minimum movement to trigger update
  UPDATE_INTERVAL: 3000, // milliseconds - how often to update
  FASTEST_INTERVAL: 1000, // milliseconds - fastest update rate
  TIMEOUT: 5000, // milliseconds - timeout for location request
} as const;

/**
 * Background location config
 */
export const BACKGROUND_CONFIG = {
  android: {
    notificationTitle: 'Bus Tracking Active',
    notificationText: 'Your location is being shared with students',
    notificationIcon: 'ic_notification',
  },
  ios: {
    activityType: 'automotiveNavigation', // Best for driving
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
  }
} as const;


