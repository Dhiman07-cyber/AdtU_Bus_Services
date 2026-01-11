/**
 * Web Geolocation Strategy
 * Uses browser's navigator.geolocation API
 * For desktop/laptop testing and fallback
 */

import type {
  ILocationStrategy,
  LocationCoordinates,
  LocationOptions,
  LocationCallback,
  ErrorCallback,
  LocationError
} from './types';

export class WebGeolocationStrategy implements ILocationStrategy {
  private watchIds: Map<string, number> = new Map();
  
  getName(): string {
    return 'WebGeolocation';
  }
  
  async isAvailable(): Promise<boolean> {
    return typeof navigator !== 'undefined' && 'geolocation' in navigator;
  }
  
  async requestPermissions(background?: boolean): Promise<boolean> {
    // Browser geolocation doesn't need explicit permission request
    // Permission is requested when getCurrentPosition/watchPosition is called
    
    // We can check permission status if Permissions API is available
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        return result.state === 'granted' || result.state === 'prompt';
      } catch (error) {
        console.warn('Permissions API not supported:', error);
        return true; // Assume available
      }
    }
    
    return true;
  }
  
  async checkPermissions() {
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        return {
          location: result.state as 'granted' | 'denied' | 'prompt'
        };
      } catch (error) {
        console.warn('Permissions API not supported:', error);
      }
    }
    
    return { location: 'prompt' as const };
  }
  
  async getCurrentPosition(options: LocationOptions): Promise<LocationCoordinates> {
    const available = await this.isAvailable();
    if (!available) {
      throw this.createError(0, 'Geolocation not supported');
    }
    
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve(this.convertPosition(position));
        },
        (error) => {
          reject(this.convertError(error));
        },
        {
          enableHighAccuracy: options.enableHighAccuracy,
          timeout: options.timeout,
          maximumAge: options.maximumAge
        }
      );
    });
  }
  
  async startTracking(
    options: LocationOptions,
    onLocation: LocationCallback,
    onError: ErrorCallback
  ): Promise<string> {
    const available = await this.isAvailable();
    if (!available) {
      onError(this.createError(0, 'Geolocation not supported'));
      return '';
    }
    
    console.log('🌐 Starting web geolocation tracking with options:', options);
    
    let lastLocation: LocationCoordinates | null = null;
    
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const location = this.convertPosition(position);
        
        // Validate location
        if (!this.isValidLocation(location, options)) {
          console.warn('⚠️ Invalid location, skipping:', location);
          return;
        }
        
        // Check minimum movement
        if (lastLocation && options.distanceFilter) {
          const distance = this.calculateDistance(lastLocation, location);
          if (distance < options.distanceFilter) {
            console.log(`📍 Movement ${distance.toFixed(1)}m < ${options.distanceFilter}m, skipping update`);
            return;
          }
        }
        
        console.log('📍 Web location update:', {
          lat: location.lat.toFixed(6),
          lng: location.lng.toFixed(6),
          accuracy: location.accuracy.toFixed(1),
          speed: location.speed?.toFixed(1)
        });
        
        lastLocation = location;
        onLocation(location);
      },
      (error) => {
        console.error('❌ Web geolocation error:', error);
        onError(this.convertError(error));
      },
      {
        enableHighAccuracy: options.enableHighAccuracy,
        timeout: options.timeout,
        maximumAge: options.maximumAge
      }
    );
    
    const watchIdStr = `web_${watchId}`;
    this.watchIds.set(watchIdStr, watchId);
    
    console.log('✅ Web geolocation tracking started, watchId:', watchIdStr);
    return watchIdStr;
  }
  
  async stopTracking(watchId: string): Promise<void> {
    const numericId = this.watchIds.get(watchId);
    if (numericId !== undefined) {
      navigator.geolocation.clearWatch(numericId);
      this.watchIds.delete(watchId);
      console.log('🛑 Web geolocation tracking stopped, watchId:', watchId);
    }
  }
  
  private convertPosition(position: GeolocationPosition): LocationCoordinates {
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude ?? undefined,
      altitudeAccuracy: position.coords.altitudeAccuracy ?? undefined,
      heading: position.coords.heading ?? undefined,
      speed: position.coords.speed ?? undefined,
      timestamp: position.timestamp
    };
  }
  
  private convertError(error: GeolocationPositionError): LocationError {
    const errorMessages: Record<number, string> = {
      1: 'Location permission denied. Please enable location access in your browser settings.',
      2: 'Location unavailable. Please check your GPS or network connection.',
      3: 'Location request timed out. Please try again.'
    };
    
    return {
      code: error.code,
      message: error.message,
      userFriendlyMessage: errorMessages[error.code] || error.message
    };
  }
  
  private createError(code: number, message: string): LocationError {
    return {
      code,
      message,
      userFriendlyMessage: message
    };
  }
  
  private isValidLocation(location: LocationCoordinates, options: LocationOptions): boolean {
    // Check accuracy
    if (location.accuracy > 100) { // 100 meters max for web
      console.warn(`Low accuracy: ${location.accuracy.toFixed(1)}m`);
      return false;
    }
    
    // Check age
    const age = Date.now() - location.timestamp;
    if (age > options.maximumAge) {
      console.warn(`Location too old: ${age}ms`);
      return false;
    }
    
    // Check coordinates are valid
    if (!location.lat || !location.lng || 
        Math.abs(location.lat) > 90 || 
        Math.abs(location.lng) > 180) {
      console.warn('Invalid coordinates:', location);
      return false;
    }
    
    return true;
  }
  
  private calculateDistance(loc1: LocationCoordinates, loc2: LocationCoordinates): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = loc1.lat * Math.PI / 180;
    const φ2 = loc2.lat * Math.PI / 180;
    const Δφ = (loc2.lat - loc1.lat) * Math.PI / 180;
    const Δλ = (loc2.lng - loc1.lng) * Math.PI / 180;
    
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c; // Distance in meters
  }
}


