import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase-client';

interface BusLocation {
  busId: string;
  driverUid: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  accuracy?: number;
  timestamp: string;
}

interface Position {
  lat: number;
  lng: number;
  timestamp: number;
}

export const useBusLocation = (busId: string) => {
  const [currentLocation, setCurrentLocation] = useState<BusLocation | null>(null);
  const [history, setHistory] = useState<BusLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs for interpolation
  const currentPositionRef = useRef<Position | null>(null);
  const targetPositionRef = useRef<Position | null>(null);
  const animationRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(0);
  const channelRef = useRef<any>(null);

  // Handle bus location updates from realtime channel (optimized)
  const handleBusLocationUpdate = useCallback((payload: any) => {
    const locationData = payload.payload;

    // Create location object
    const newLocation: BusLocation = {
      busId: locationData.busId,
      driverUid: locationData.driverUid,
      lat: locationData.lat,
      lng: locationData.lng,
      speed: locationData.speed || 0,
      heading: locationData.heading || 0,
      accuracy: locationData.accuracy,
      timestamp: locationData.ts || new Date().toISOString()
    };

    // Use requestAnimationFrame to avoid blocking the main thread
    requestAnimationFrame(() => {
      console.log('Received bus location update:', locationData);
      setCurrentLocation(newLocation);

      // Add to history
      setHistory(prev => {
        // Keep only the last 50 locations
        const newHistory = [...prev, newLocation];
        return newHistory.slice(-50);
      });

      // Set up interpolation for smooth movement
      if (currentPositionRef.current) {
        targetPositionRef.current = {
          lat: locationData.lat,
          lng: locationData.lng,
          timestamp: Date.now()
        };
      } else {
        // First position, set directly
        currentPositionRef.current = {
          lat: locationData.lat,
          lng: locationData.lng,
          timestamp: Date.now()
        };
      }

      lastUpdateRef.current = Date.now();
      setLoading(false);
    });
  }, []);

  // Fetch initial bus location data
  useEffect(() => {
    const fetchInitialLocation = async () => {
      if (!supabase || !busId) {
        console.log('Supabase client or busId not available');
        setLoading(false);
        return;
      }

      try {
        console.log(`Fetching initial bus location for bus: ${busId}`);

        // Query bus_locations for the most recent location of this bus
        // Use the busId as-is (it should match what's stored in the database)
        const { data: locations, error } = await supabase
          .from('bus_locations')
          .select('*')
          .eq('bus_id', busId)
          .order('timestamp', { ascending: false })
          .limit(1);

        if (error) {
          console.error('Error fetching initial bus location:', error);
          // Don't set error state for missing initial data - this is expected when no trips are active
          console.log('No initial bus location found (this is normal when no trips are active)');
        } else if (locations && locations.length > 0) {
          const location = locations[0];
          console.log('Found initial bus location:', location);

          const busLocation: BusLocation = {
            busId: location.bus_id,
            driverUid: location.driver_uid,
            lat: location.lat,
            lng: location.lng,
            speed: location.speed || 0,
            heading: location.heading || 0,
            accuracy: location.accuracy,
            timestamp: location.timestamp || new Date().toISOString()
          };

          setCurrentLocation(busLocation);
          setHistory([busLocation]);
          setLoading(false);
        } else {
          console.log('No initial bus location found, will wait for realtime updates');
          // Set a timeout to stop loading after 10 seconds even if no realtime updates
          setTimeout(() => {
            if (loading) {
              console.log('No realtime updates received, stopping loading state');
              setLoading(false);
            }
          }, 10000);
        }
      } catch (err: any) {
        console.error('Error fetching initial bus location:', err);
        // Don't set error state for connection issues when fetching initial data
        console.log('Failed to fetch initial bus location (this is normal when no trips are active)');
      }
    };

    fetchInitialLocation();
  }, [busId]);

  // Subscribe to realtime channel - use postgres_changes for reliable updates
  useEffect(() => {
    if (!supabase || !busId) {
      console.log('[useBusLocation] Supabase client or busId not available');
      setLoading(false);
      return;
    }

    // Create channel - BUS-SPECIFIC (CRITICAL: not route-specific!)
    // This ensures students on different buses don't see each other's locations
    const channelName = `bus_location_${busId}`;
    console.log(`Creating Supabase channel: ${channelName} for bus: ${busId}`);

    const channel = supabase.channel(channelName, {
      config: {
        broadcast: {
          self: false
        },
        presence: {
          key: ''
        }
      }
    });

    // Listen for broadcast events from driver
    channel.on(
      'broadcast',
      {
        event: 'bus_location_update'
      },
      (payload: any) => {
        console.log('📍 Received bus location broadcast:', payload);

        // The payload already has the correct structure from driver broadcast
        if (payload.payload) {
          const locationData = {
            payload: {
              busId: payload.payload.busId,
              driverUid: payload.payload.driverUid,
              lat: payload.payload.lat,
              lng: payload.payload.lng,
              speed: payload.payload.speed || 0,
              heading: payload.payload.heading || 0,
              accuracy: payload.payload.accuracy,
              ts: payload.payload.timestamp
            }
          };

          handleBusLocationUpdate(locationData);
        }
      }
    );

    // Also listen to postgres_changes as fallback
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'bus_locations',
        filter: `bus_id=eq.${busId}`
      },
      (payload: any) => {
        console.log('📍 Received bus location INSERT event (fallback):', payload);

        // Convert from postgres format to our format
        const newLocation = payload.new;
        const locationData = {
          payload: {
            busId: newLocation.bus_id,
            driverUid: newLocation.driver_uid,
            lat: newLocation.lat,
            lng: newLocation.lng,
            speed: newLocation.speed || 0,
            heading: newLocation.heading || 0,
            accuracy: newLocation.accuracy,
            ts: newLocation.timestamp
          }
        };

        handleBusLocationUpdate(locationData);
      }
    );

    // Subscribe to the channel
    channel.subscribe((status: string, error: any) => {
      if (status === 'SUBSCRIBED') {
        console.log(`✅ Successfully subscribed to postgres changes for bus ${busId}`);
        setLoading(false);
      } else if (status === 'CHANNEL_ERROR') {
        console.error(`❌ Error subscribing to channel:`, error);
        setError(`Error subscribing to channel: ${error?.message || 'Unknown error'}`);
        setLoading(false);
      } else if (status === 'TIMED_OUT') {
        console.error(`⏱️ Timeout subscribing to channel`);
        setError('Timeout subscribing to channel');
        setLoading(false);
      } else {
        console.log(`Channel status: ${status}`, error);
      }
    });

    channelRef.current = channel;

    // Cleanup function
    return () => {
      try {
        supabase.removeChannel(channel);
        console.log(`Unsubscribed from bus_location_${busId}`);
      } catch (error) {
        console.warn('Failed to remove channel:', error);
      }
    };
  }, [busId, handleBusLocationUpdate]);

  // Interpolation for smooth movement
  useEffect(() => {
    const animate = () => {
      if (targetPositionRef.current && currentPositionRef.current) {
        const now = Date.now();
        const elapsed = now - lastUpdateRef.current;
        const duration = 5000; // 5 seconds for full interpolation

        if (elapsed < duration) {
          const progress = elapsed / duration;
          const easeProgress = 1 - Math.pow(1 - progress, 2); // Ease out

          currentPositionRef.current.lat =
            currentPositionRef.current.lat +
            (targetPositionRef.current.lat - currentPositionRef.current.lat) * easeProgress;

          currentPositionRef.current.lng =
            currentPositionRef.current.lng +
            (targetPositionRef.current.lng - currentPositionRef.current.lng) * easeProgress;

          animationRef.current = requestAnimationFrame(animate);
        } else {
          // Animation complete, set target as current
          currentPositionRef.current = { ...targetPositionRef.current };
          targetPositionRef.current = null;
        }
      } else {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Get interpolated position
  const getInterpolatedPosition = useCallback(() => {
    return currentPositionRef.current;
  }, []);

  return {
    currentLocation,
    history,
    loading,
    error,
    getInterpolatedPosition
  };
};