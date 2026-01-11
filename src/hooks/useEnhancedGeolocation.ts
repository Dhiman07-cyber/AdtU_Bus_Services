/**
 * Enhanced Geolocation Hook
 * Uses LocationService with automatic strategy selection
 * Provides Uber-like GPS accuracy on mobile devices
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { locationService, LocationCoordinates, LocationOptions } from '@/lib/location-service';

export interface GeolocationState {
  position: LocationCoordinates | null;
  error: Error | null;
  loading: boolean;
  permissionDenied: boolean;
  accuracy: number | null;
  isTracking: boolean;
  deviceType: 'mobile' | 'desktop';
}

export interface UseEnhancedGeolocationOptions extends Partial<LocationOptions> {
  enabled?: boolean;
  watch?: boolean;
  onLocationUpdate?: (location: LocationCoordinates) => void;
  onError?: (error: Error) => void;
}

/**
 * Enhanced geolocation hook with native mobile support
 * 
 * @example
 * const { position, accuracy, isTracking, startTracking, stopTracking } = useEnhancedGeolocation({
 *   enabled: true,
 *   watch: true,
 *   enableHighAccuracy: true,
 *   backgroundUpdates: true
 * });
 */
export function useEnhancedGeolocation(options: UseEnhancedGeolocationOptions = {}) {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    error: null,
    loading: true,
    permissionDenied: false,
    accuracy: null,
    isTracking: false,
    deviceType: locationService.detectDeviceType()
  });
  
  const watchIdRef = useRef<string | null>(null);
  const optionsRef = useRef(options);
  
  // Update options ref when they change
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);
  
  /**
   * Start location tracking
   */
  const startTracking = useCallback(async () => {
    console.log('🚀 Starting enhanced location tracking...');
    
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      // Check if available
      const available = await locationService.isAvailable();
      if (!available) {
        throw new Error('Location services are not available on this device');
      }
      
      // Request permissions
      const hasPermission = await locationService.requestPermissions(
        optionsRef.current.backgroundUpdates || false
      );
      
      if (!hasPermission) {
        setState(prev => ({
          ...prev,
          loading: false,
          permissionDenied: true,
          error: new Error('Location permission denied')
        }));
        return;
      }
      
      // Start tracking
      const watchId = await locationService.startLocationTracking(
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
          distanceFilter: 5,
          updateInterval: 3000,
          fastestInterval: 1000,
          backgroundUpdates: optionsRef.current.backgroundUpdates || false,
          ...optionsRef.current
        },
        (location) => {
          console.log('📍 Location update:', {
            lat: location.lat.toFixed(6),
            lng: location.lng.toFixed(6),
            accuracy: `${location.accuracy.toFixed(1)}m`
          });
          
          setState(prev => ({
            ...prev,
            position: location,
            accuracy: location.accuracy,
            loading: false,
            error: null,
            isTracking: true
          }));
          
          // Call custom callback
          if (optionsRef.current.onLocationUpdate) {
            optionsRef.current.onLocationUpdate(location);
          }
        },
        (error) => {
          console.error('❌ Location error:', error);
          
          const errorObj = new Error(error.userFriendlyMessage);
          setState(prev => ({
            ...prev,
            error: errorObj,
            loading: false,
            isTracking: false
          }));
          
          // Call custom error callback
          if (optionsRef.current.onError) {
            optionsRef.current.onError(errorObj);
          }
        }
      );
      
      watchIdRef.current = watchId;
      console.log('✅ Tracking started with watchId:', watchId);
      
    } catch (error: any) {
      console.error('❌ Failed to start tracking:', error);
      setState(prev => ({
        ...prev,
        error: error,
        loading: false,
        isTracking: false
      }));
    }
  }, []);
  
  /**
   * Stop location tracking
   */
  const stopTracking = useCallback(async () => {
    if (watchIdRef.current) {
      console.log('🛑 Stopping location tracking...');
      await locationService.stopLocationTracking(watchIdRef.current);
      watchIdRef.current = null;
      
      setState(prev => ({
        ...prev,
        isTracking: false
      }));
      
      console.log('✅ Tracking stopped');
    }
  }, []);
  
  /**
   * Get current position once
   */
  const getCurrentPosition = useCallback(async (): Promise<LocationCoordinates | null> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const position = await locationService.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
        ...optionsRef.current
      });
      
      setState(prev => ({
        ...prev,
        position,
        accuracy: position.accuracy,
        loading: false,
        error: null
      }));
      
      return position;
    } catch (error: any) {
      console.error('❌ Get position failed:', error);
      setState(prev => ({
        ...prev,
        error: error,
        loading: false
      }));
      return null;
    }
  }, []);
  
  /**
   * Retry tracking after error
   */
  const retryTracking = useCallback(async () => {
    setState(prev => ({ ...prev, error: null, permissionDenied: false }));
    await startTracking();
  }, [startTracking]);
  
  // Auto-start tracking if enabled and watch mode
  useEffect(() => {
    if (options.enabled && options.watch) {
      startTracking();
    }
    
    // Cleanup on unmount
    return () => {
      if (watchIdRef.current) {
        locationService.stopLocationTracking(watchIdRef.current);
      }
    };
  }, [options.enabled, options.watch, startTracking]);
  
  return {
    // State
    position: state.position,
    error: state.error,
    loading: state.loading,
    permissionDenied: state.permissionDenied,
    accuracy: state.accuracy,
    isTracking: state.isTracking,
    deviceType: state.deviceType,
    
    // Methods
    startTracking,
    stopTracking,
    getCurrentPosition,
    retryTracking,
    
    // Helper methods
    hasHighAccuracy: () => state.accuracy !== null && state.accuracy < 20,
    isUberQuality: () => state.accuracy !== null && state.accuracy < 10,
  };
}


