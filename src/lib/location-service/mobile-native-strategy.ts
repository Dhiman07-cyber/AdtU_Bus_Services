// @ts-nocheck
/**
 * Mobile Native Location Strategy
 * Uses Capacitor Geolocation plugin with FusedLocationProvider (Android) / CoreLocation (iOS)
 * Provides Uber-like accuracy (1-5m) with background support
 */

import type {
  ILocationStrategy,
  LocationCoordinates,
  LocationOptions,
  LocationCallback,
  ErrorCallback,
  LocationError
} from './types';

export class MobileNativeLocationStrategy implements ILocationStrategy {
  private Geolocation: any = null;
  private BackgroundGeolocation: any = null;
  private watchIds: Map<string, string> = new Map();
  private isInitialized = false;
  
  constructor() {
    this.initialize();
  }
  
  private async initialize() {
    if (typeof window === 'undefined' || this.isInitialized) return;
    
    try {
      // Import Capacitor plugins dynamically
      const { Geolocation } = await import('@capacitor/geolocation');
      this.Geolocation = Geolocation;
      
      // Try to import background geolocation if available
      try {
        const { BackgroundGeolocation } = await import('@capacitor-community/background-geolocation');
        this.BackgroundGeolocation = BackgroundGeolocation;
        console.log('✅ Background Geolocation plugin available');
      } catch (error) {
        console.warn('⚠️ Background Geolocation plugin not available:', error);
      }
      
      this.isInitialized = true;
      console.log('✅ Mobile Native Location Strategy initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Capacitor Geolocation:', error);
    }
  }
  
  getName(): string {
    return 'MobileNative';
  }
  
  async isAvailable(): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this.Geolocation !== null;
  }
  
  async requestPermissions(background: boolean = false): Promise<boolean> {
    if (!await this.isAvailable()) {
      return false;
    }
    
    try {
      console.log('🔐 Requesting location permissions (background:', background, ')');
      
      // Request foreground location permission
      const permissions = await this.Geolocation.requestPermissions();
      console.log('📱 Permission result:', permissions);
      
      if (permissions.location !== 'granted') {
        console.warn('❌ Location permission denied');
        return false;
      }
      
      // Request background permission if needed (Android 10+, iOS 13+)
      if (background && this.BackgroundGeolocation) {
        try {
          // Configure background geolocation
          await this.BackgroundGeolocation.addWatcher(
            {
              backgroundMessage: "Your location is being tracked for bus service.",
              backgroundTitle: "Bus Tracking Active",
              requestPermissions: true,
              stale: false,
              distanceFilter: 5 // meters
            },
            () => {} // Dummy callback
          );
          
          // Remove the watcher immediately (we just wanted permissions)
          await this.BackgroundGeolocation.removeWatcher({ id: '' });
          console.log('✅ Background location permission requested');
        } catch (bgError) {
          console.warn('⚠️ Background permission request failed:', bgError);
        }
      }
      
      return true;
    } catch (error) {
      console.error('❌ Permission request failed:', error);
      return false;
    }
  }
  
  async checkPermissions() {
    if (!await this.isAvailable()) {
      return { location: 'denied' as const };
    }
    
    try {
      const permissions = await this.Geolocation.checkPermissions();
      return {
        location: permissions.location as 'granted' | 'denied' | 'prompt',
        backgroundLocation: permissions.location as 'granted' | 'denied' | 'prompt'
      };
    } catch (error) {
      console.error('❌ Check permissions failed:', error);
      return { location: 'denied' as const };
    }
  }
  
  async getCurrentPosition(options: LocationOptions): Promise<LocationCoordinates> {
    if (!await this.isAvailable()) {
      throw this.createError(0, 'Native geolocation not available');
    }
    
    try {
      console.log('📍 Getting current position with native GPS...');
      
      const position = await this.Geolocation.getCurrentPosition({
        enableHighAccuracy: options.enableHighAccuracy,
        timeout: options.timeout,
        maximumAge: options.maximumAge
      });
      
      const location = this.convertPosition(position);
      console.log('✅ Got position:', {
        lat: location.lat.toFixed(6),
        lng: location.lng.toFixed(6),
        accuracy: location.accuracy.toFixed(1)
      });
      
      return location;
    } catch (error: any) {
      console.error('❌ getCurrentPosition failed:', error);
      throw this.convertError(error);
    }
  }
  
  async startTracking(
    options: LocationOptions,
    onLocation: LocationCallback,
    onError: ErrorCallback
  ): Promise<string> {
    if (!await this.isAvailable()) {
      onError(this.createError(0, 'Native geolocation not available'));
      return '';
    }
    
    console.log('🚀 Starting native GPS tracking with HIGH ACCURACY mode');
    console.log('📊 Options:', {
      enableHighAccuracy: options.enableHighAccuracy,
      distanceFilter: options.distanceFilter,
      updateInterval: options.updateInterval,
      fastestInterval: options.fastestInterval,
      background: options.backgroundUpdates
    });
    
    let lastLocation: LocationCoordinates | null = null;
    let updateCount = 0;
    
    try {
      // Use background geolocation if available and requested
      if (options.backgroundUpdates && this.BackgroundGeolocation) {
        const watchId = await this.startBackgroundTracking(options, onLocation, onError);
        return watchId;
      }
      
      // Otherwise use standard foreground tracking
      const watchId = await this.Geolocation.watchPosition(
        {
          enableHighAccuracy: options.enableHighAccuracy,
          timeout: options.timeout,
          maximumAge: 0 // Always get fresh location
        },
        (position: any, err: any) => {
          if (err) {
            console.error('❌ Watch position error:', err);
            onError(this.convertError(err));
            return;
          }
          
          const location = this.convertPosition(position);
          updateCount++;
          
          // Validate location
          if (!this.isValidLocation(location, options)) {
            console.warn('⚠️ Invalid location, skipping:', {
              accuracy: location.accuracy,
              age: Date.now() - location.timestamp
            });
            return;
          }
          
          // Check minimum movement
          if (lastLocation && options.distanceFilter) {
            const distance = this.calculateDistance(lastLocation, location);
            if (distance < options.distanceFilter) {
              console.log(`📍 Movement ${distance.toFixed(1)}m < ${options.distanceFilter}m, skipping`);
              return;
            }
          }
          
          console.log(`📍 Native GPS update #${updateCount}:`, {
            lat: location.lat.toFixed(6),
            lng: location.lng.toFixed(6),
            accuracy: `${location.accuracy.toFixed(1)}m`,
            speed: location.speed ? `${(location.speed * 3.6).toFixed(1)} km/h` : 'N/A',
            source: 'FusedLocationProvider/CoreLocation'
          });
          
          lastLocation = location;
          onLocation(location);
        }
      );
      
      const watchIdStr = `native_${watchId}`;
      this.watchIds.set(watchIdStr, watchId);
      
      console.log('✅ Native GPS tracking started, watchId:', watchIdStr);
      console.log('🎯 Expected accuracy: 1-5 meters (Uber-like quality)');
      
      return watchIdStr;
    } catch (error: any) {
      console.error('❌ Start tracking failed:', error);
      onError(this.convertError(error));
      return '';
    }
  }
  
  private async startBackgroundTracking(
    options: LocationOptions,
    onLocation: LocationCallback,
    onError: ErrorCallback
  ): Promise<string> {
    console.log('🌙 Starting BACKGROUND GPS tracking');
    
    const watchId = await this.BackgroundGeolocation.addWatcher(
      {
        backgroundMessage: "Your location is being tracked for bus service.",
        backgroundTitle: "Bus Tracking Active",
        requestPermissions: false, // Already requested
        stale: false,
        distanceFilter: options.distanceFilter || 5,
      },
      (location: any, error: any) => {
        if (error) {
          console.error('❌ Background location error:', error);
          if (error.code !== 'NOT_AUTHORIZED') {
            onError(this.convertError(error));
          }
          return;
        }
        
        if (location) {
          const coords: LocationCoordinates = {
            lat: location.latitude,
            lng: location.longitude,
            accuracy: location.accuracy,
            altitude: location.altitude,
            heading: location.bearing,
            speed: location.speed,
            timestamp: location.time
          };
          
          console.log('🌙 Background GPS update:', {
            lat: coords.lat.toFixed(6),
            lng: coords.lng.toFixed(6),
            accuracy: `${coords.accuracy.toFixed(1)}m`
          });
          
          onLocation(coords);
        }
      }
    );
    
    const watchIdStr = `background_${watchId}`;
    this.watchIds.set(watchIdStr, watchId);
    
    console.log('✅ Background GPS tracking started, watchId:', watchIdStr);
    return watchIdStr;
  }
  
  async stopTracking(watchId: string): Promise<void> {
    const nativeId = this.watchIds.get(watchId);
    if (!nativeId) {
      console.warn('⚠️ Watch ID not found:', watchId);
      return;
    }
    
    try {
      if (watchId.startsWith('background_') && this.BackgroundGeolocation) {
        await this.BackgroundGeolocation.removeWatcher({ id: nativeId });
        console.log('🛑 Background GPS tracking stopped');
      } else {
        await this.Geolocation.clearWatch({ id: nativeId });
        console.log('🛑 Native GPS tracking stopped');
      }
      
      this.watchIds.delete(watchId);
    } catch (error) {
      console.error('❌ Stop tracking failed:', error);
    }
  }
  
  private convertPosition(position: any): LocationCoordinates {
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
  
  private convertError(error: any): LocationError {
    const code = error.code || 0;
    const message = error.message || 'Unknown error';
    
    const userFriendlyMessages: Record<string, string> = {
      'NOT_AUTHORIZED': 'Location permission denied. Please enable location access in device settings.',
      'LOCATION_DISABLED': 'GPS is disabled. Please enable location services in device settings.',
      'TIMEOUT': 'Location request timed out. Please ensure GPS is enabled and try again.',
      'UNAVAILABLE': 'Location unavailable. Please check your GPS or network connection.'
    };
    
    let userFriendlyMessage = userFriendlyMessages[error.code] || message;
    
    if (code === 1) userFriendlyMessage = userFriendlyMessages['NOT_AUTHORIZED'];
    else if (code === 2) userFriendlyMessage = userFriendlyMessages['UNAVAILABLE'];
    else if (code === 3) userFriendlyMessage = userFriendlyMessages['TIMEOUT'];
    
    return {
      code,
      message,
      userFriendlyMessage
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
    // Native GPS should have very good accuracy
    if (location.accuracy > 50) { // 50 meters max for mobile
      console.warn(`Low accuracy: ${location.accuracy.toFixed(1)}m (expected < 50m)`);
      return false;
    }
    
    // Check age
    const age = Date.now() - location.timestamp;
    if (age > 10000) { // 10 seconds max
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


