/**
 * Geolocation Service
 * Centralized location handling with proper permission management
 */

export interface GeolocationPosition {
  lat: number;
  lng: number;
  accuracy: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

export interface GeolocationError {
  code: number;
  message: string;
  userFriendlyMessage: string;
}

export type GeolocationCallback = (position: GeolocationPosition) => void;
export type GeolocationErrorCallback = (error: GeolocationError) => void;

class GeolocationService {
  private watchId: number | null = null;
  private lastPosition: GeolocationPosition | null = null;

  /**
   * Check if geolocation is available
   */
  isAvailable(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    return 'geolocation' in navigator;
  }

  /**
   * Check current permission status
   */
  async checkPermissionStatus(): Promise<PermissionState | 'unsupported'> {
    if (typeof window === 'undefined' || !('permissions' in navigator)) {
      return 'unsupported';
    }

    try {
      const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      return result.state;
    } catch (error) {
      // Firefox and some browsers don't support geolocation permission query
      return 'unsupported';
    }
  }

  /**
   * Request location permission
   */
  async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !this.isAvailable()) {
      return false;
    }

    try {
      // Try to get current position to trigger permission prompt
      const position = await this.getCurrentPositionPromise();
      return !!position;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current position (single fetch)
   * Used by students for one-time location
   */
  getCurrentPosition(
    onSuccess: GeolocationCallback,
    onError: GeolocationErrorCallback
  ): void {
    if (typeof window === 'undefined' || !this.isAvailable()) {
      onError({
        code: 0,
        message: 'Geolocation not available',
        userFriendlyMessage: 'Your browser does not support location services.'
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const geoPosition: GeolocationPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading || undefined,
          speed: position.coords.speed || undefined,
          timestamp: position.timestamp
        };

        this.lastPosition = geoPosition;
        onSuccess(geoPosition);
      },
      (error) => {
        onError(this.parseGeolocationError(error));
      },
      {
        enableHighAccuracy: false, // Start with lower accuracy for faster results
        timeout: 10000, // Reduced timeout to 10 seconds
        maximumAge: 30000 // Allow cached positions up to 30 seconds old
      }
    );
  }

  /**
   * Get current position as a Promise
   */
  private getCurrentPositionPromise(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      this.getCurrentPosition(
        (position) => resolve(position),
        (error) => reject(error)
      );
    });
  }

  /**
   * Start watching position (continuous updates)
   * Used by drivers for real-time tracking
   */
  watchPosition(
    onSuccess: GeolocationCallback,
    onError: GeolocationErrorCallback
  ): () => void {
    if (typeof window === 'undefined' || !this.isAvailable()) {
      onError({
        code: 0,
        message: 'Geolocation not available',
        userFriendlyMessage: 'Your browser does not support location services.'
      });
      return () => { };
    }

    // Clear existing watch if any
    this.stopWatching();

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const geoPosition: GeolocationPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading || undefined,
          speed: position.coords.speed || undefined,
          timestamp: position.timestamp
        };

        this.lastPosition = geoPosition;
        onSuccess(geoPosition);
      },
      (error) => {
        onError(this.parseGeolocationError(error));
      },
      {
        enableHighAccuracy: true,
        timeout: 30000, // Increased timeout to 30 seconds for continuous tracking
        maximumAge: 5000 // Allow cached positions up to 5 seconds old
      }
    );

    // Return cleanup function
    return () => this.stopWatching();
  }

  /**
   * Stop watching position
   */
  stopWatching(): void {
    if (typeof window !== 'undefined' && this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  /**
   * Get last known position
   */
  getLastPosition(): GeolocationPosition | null {
    return this.lastPosition;
  }

  /**
   * Parse geolocation error into user-friendly message
   */
  private parseGeolocationError(error: GeolocationPositionError): GeolocationError {
    let userFriendlyMessage = '';

    switch (error.code) {
      case error.PERMISSION_DENIED:
        userFriendlyMessage =
          'Location access denied. Please enable location permissions in your browser settings for ADTU BUS XQ to function properly.';
        break;
      case error.POSITION_UNAVAILABLE:
        userFriendlyMessage =
          'Location information is unavailable. Please check your device settings and try again.';
        break;
      case error.TIMEOUT:
        userFriendlyMessage =
          'Location request timed out. Please check your internet connection and try again.';
        break;
      default:
        userFriendlyMessage =
          'Unable to get your location. Please ensure location services are enabled.';
    }

    return {
      code: error.code,
      message: error.message,
      userFriendlyMessage
    };
  }
}

// Export singleton instance
export const geolocationService = new GeolocationService();