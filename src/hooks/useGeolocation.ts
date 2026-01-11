"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  geolocationService, 
  GeolocationPosition, 
  GeolocationError 
} from '@/lib/geolocation-service';

interface UseGeolocationOptions {
  watch?: boolean; // If true, continuously watch position (for drivers)
  enabled?: boolean; // If false, don't start tracking
  onPositionUpdate?: (position: GeolocationPosition) => void;
}

export function useGeolocation(options: UseGeolocationOptions = {}) {
  const { watch = false, enabled = true, onPositionUpdate } = options;

  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [error, setError] = useState<GeolocationError | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [permissionDenied, setPermissionDenied] = useState<boolean>(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const handleSuccess = useCallback((pos: GeolocationPosition) => {
    setPosition(pos);
    setError(null);
    setLoading(false);
    setPermissionDenied(false);
    
    if (onPositionUpdate) {
      onPositionUpdate(pos);
    }
  }, [onPositionUpdate]);

  const handleError = useCallback((err: GeolocationError) => {
    setError(err);
    setLoading(false);
    
    // Check if permission was denied
    if (err.code === 1) { // PERMISSION_DENIED
      setPermissionDenied(true);
    }
  }, []);

  const startTracking = useCallback(() => {
    if (!enabled || !geolocationService.isAvailable()) {
      setError({
        code: 0,
        message: 'Geolocation not available',
        userFriendlyMessage: 'Your browser does not support location services.'
      });
      return;
    }

    setLoading(true);
    setError(null);

    if (watch) {
      // Continuous tracking for drivers
      cleanupRef.current = geolocationService.watchPosition(
        handleSuccess,
        handleError
      );
    } else {
      // Single fetch for students
      geolocationService.getCurrentPosition(
        handleSuccess,
        handleError
      );
    }
  }, [enabled, watch, handleSuccess, handleError]);

  const stopTracking = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    geolocationService.stopWatching();
  }, []);

  const retryTracking = useCallback(() => {
    setPermissionDenied(false);
    setError(null);
    startTracking();
  }, [startTracking]);

  // Start tracking on mount if enabled
  useEffect(() => {
    if (enabled) {
      startTracking();
    }

    // Cleanup on unmount
    return () => {
      stopTracking();
    };
  }, [enabled]); // Only re-run if enabled changes

  return {
    position,
    error,
    loading,
    permissionDenied,
    startTracking,
    stopTracking,
    retryTracking,
    isAvailable: geolocationService.isAvailable()
  };
}


