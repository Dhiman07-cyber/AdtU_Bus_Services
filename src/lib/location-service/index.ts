/**
 * Location Service
 * Main entry point for location tracking
 * Automatically selects the best strategy based on device type
 */

import { getDeviceInfo } from '../device-detection';
import { WebGeolocationStrategy } from './web-strategy';
import { MobileNativeLocationStrategy } from './mobile-native-strategy';
import type {
  ILocationStrategy,
  LocationCoordinates,
  LocationOptions,
  LocationCallback,
  ErrorCallback,
  LocationUpdate
} from './types';

export * from './types';

/**
 * LocationService - Main API for location tracking
 */
export class LocationService {
  private strategy: ILocationStrategy | null = null;
  private currentWatchId: string | null = null;
  private isTracking: boolean = false;
  
  constructor() {
    this.selectStrategy();
  }
  
  /**
   * Automatically select the best location strategy for current device
   */
  private selectStrategy() {
    const deviceInfo = getDeviceInfo();
    
    console.log('🔍 Detecting device:', {
      type: deviceInfo.type,
      platform: deviceInfo.platform,
      isNative: deviceInfo.isNative,
      isMobile: deviceInfo.isMobile
    });
    
    if (deviceInfo.isNative || deviceInfo.isMobile) {
      console.log('📱 Using Mobile Native Strategy (FusedLocationProvider/CoreLocation)');
      this.strategy = new MobileNativeLocationStrategy();
    } else {
      console.log('🌐 Using Web Geolocation Strategy (browser fallback)');
      this.strategy = new WebGeolocationStrategy();
    }
  }
  
  /**
   * Get device type for logging
   */
  detectDeviceType(): 'mobile' | 'desktop' {
    const deviceInfo = getDeviceInfo();
    return deviceInfo.isMobile ? 'mobile' : 'desktop';
  }
  
  /**
   * Check if location services are available
   */
  async isAvailable(): Promise<boolean> {
    if (!this.strategy) return false;
    return await this.strategy.isAvailable();
  }
  
  /**
   * Request location permissions
   */
  async requestPermissions(background: boolean = false): Promise<boolean> {
    if (!this.strategy) return false;
    return await this.strategy.requestPermissions(background);
  }
  
  /**
   * Check permission status
   */
  async checkPermissions() {
    if (!this.strategy) {
      return { location: 'denied' as const };
    }
    return await this.strategy.checkPermissions();
  }
  
  /**
   * Get current location once
   */
  async getCurrentPosition(options?: Partial<LocationOptions>): Promise<LocationCoordinates> {
    if (!this.strategy) {
      throw new Error('Location strategy not initialized');
    }
    
    const fullOptions = this.getDefaultOptions(options);
    return await this.strategy.getCurrentPosition(fullOptions);
  }
  
  /**
   * Start continuous location tracking
   * Returns watchId that can be used to stop tracking
   */
  async startLocationTracking(
    options: Partial<LocationOptions>,
    onLocation: LocationCallback,
    onError: ErrorCallback
  ): Promise<string> {
    if (!this.strategy) {
      onError({
        code: 0,
        message: 'Location strategy not initialized',
        userFriendlyMessage: 'Location services are not available on this device'
      });
      return '';
    }
    
    if (this.isTracking) {
      console.warn('⚠️ Location tracking already active');
      return this.currentWatchId || '';
    }
    
    const fullOptions = this.getDefaultOptions(options);
    
    console.log('🚀 Starting location tracking with strategy:', this.strategy.getName());
    console.log('⚙️ Options:', fullOptions);
    
    try {
      this.currentWatchId = await this.strategy.startTracking(
        fullOptions,
        onLocation,
        onError
      );
      
      this.isTracking = true;
      console.log('✅ Location tracking started, watchId:', this.currentWatchId);
      
      return this.currentWatchId;
    } catch (error: any) {
      console.error('❌ Failed to start tracking:', error);
      onError({
        code: error.code || 0,
        message: error.message || 'Failed to start tracking',
        userFriendlyMessage: error.userFriendlyMessage || 'Failed to start location tracking'
      });
      return '';
    }
  }
  
  /**
   * Stop location tracking
   */
  async stopLocationTracking(watchId?: string): Promise<void> {
    if (!this.strategy) return;
    
    const idToStop = watchId || this.currentWatchId;
    if (!idToStop) {
      console.warn('⚠️ No watchId to stop');
      return;
    }
    
    console.log('🛑 Stopping location tracking, watchId:', idToStop);
    
    try {
      await this.strategy.stopTracking(idToStop);
      
      if (idToStop === this.currentWatchId) {
        this.isTracking = false;
        this.currentWatchId = null;
      }
      
      console.log('✅ Location tracking stopped');
    } catch (error) {
      console.error('❌ Failed to stop tracking:', error);
    }
  }
  
  /**
   * Send location update to backend
   */
  async sendLocationUpdate(
    location: LocationCoordinates,
    metadata: {
      busId?: string;
      driverId?: string;
      routeId?: string;
    }
  ): Promise<boolean> {
    const update: LocationUpdate = {
      ...metadata,
      coordinates: location,
      source: 'gps',
      deviceType: this.detectDeviceType()
    };
    
    console.log('📤 Sending location update:', {
      busId: update.busId,
      lat: update.coordinates.lat.toFixed(6),
      lng: update.coordinates.lng.toFixed(6),
      accuracy: `${update.coordinates.accuracy.toFixed(1)}m`,
      source: update.source,
      deviceType: update.deviceType
    });
    
    // This will be implemented by the caller
    // We're just providing the formatted data
    return true;
  }
  
  /**
   * Handle location errors
   */
  onLocationError(error: LocationError, context: string = 'general'): void {
    console.error(`❌ Location error (${context}):`, error);
    
    // Show user-friendly error message
    if (typeof window !== 'undefined') {
      // This can be customized to show toast/alert
      console.warn('🔔 User notification:', error.userFriendlyMessage);
    }
  }
  
  /**
   * Get default options with fallbacks
   */
  private getDefaultOptions(options?: Partial<LocationOptions>): LocationOptions {
    const deviceInfo = getDeviceInfo();
    
    // Mobile gets aggressive high-accuracy settings
    if (deviceInfo.isMobile || deviceInfo.isNative) {
      return {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
        updateInterval: options?.updateInterval || 3000, // 3 seconds
        fastestInterval: options?.fastestInterval || 1000, // 1 second
        distanceFilter: options?.distanceFilter || 5, // 5 meters
        backgroundUpdates: options?.backgroundUpdates || false,
        ...options
      };
    }
    
    // Desktop gets more relaxed settings
    return {
      enableHighAccuracy: options?.enableHighAccuracy !== undefined ? options.enableHighAccuracy : true,
      timeout: options?.timeout || 5000,
      maximumAge: options?.maximumAge || 5000,
      updateInterval: options?.updateInterval || 5000, // 5 seconds
      fastestInterval: options?.fastestInterval || 3000, // 3 seconds
      distanceFilter: options?.distanceFilter || 10, // 10 meters
      backgroundUpdates: false, // No background on desktop
      ...options
    };
  }
  
  /**
   * Get current tracking status
   */
  getTrackingStatus(): {
    isTracking: boolean;
    watchId: string | null;
    strategy: string | null;
  } {
    return {
      isTracking: this.isTracking,
      watchId: this.currentWatchId,
      strategy: this.strategy?.getName() || null
    };
  }
}

// Export singleton instance
export const locationService = new LocationService();


