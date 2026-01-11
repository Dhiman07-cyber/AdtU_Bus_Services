import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase-client';

interface BusLocation {
  busId: string;
  routeId: string;
  driverUid: string;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  timestamp: string;
}

interface Position {
  lat: number;
  lng: number;
  timestamp: number;
}

/**
 * Hook to track real-time bus location on a route
 * Subscribes to route:routeId channel for live updates
 * Implements smooth interpolation for marker animation
 */
export const useBusLocationFixed = (routeId: string) => {
  const [currentLocation, setCurrentLocation] = useState<BusLocation | null>(null);
  const [history, setHistory] = useState<BusLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Refs for smooth interpolation
  const currentPositionRef = useRef<Position | null>(null);
  const targetPositionRef = useRef<Position | null>(null);
  const animationRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(0);
  const channelRef = useRef<any>(null);

  // Handle bus location updates from realtime channel
  const handleBusLocationUpdate = useCallback((payload: any) => {
    console.log('[useBusLocation] Received bus location update:', payload);
    
    const data = payload.payload || payload;
    
    const newLocation: BusLocation = {
      busId: data.busId,
      routeId: data.routeId || routeId,
      driverUid: data.driverUid,
      lat: data.lat,
      lng: data.lng,
      speed: data.speed || null,
      heading: data.heading || null,
      timestamp: data.timestamp || new Date().toISOString()
    };
    
    setCurrentLocation(newLocation);
    
    // Add to history
    setHistory(prev => {
      const newHistory = [...prev, newLocation];
      return newHistory.slice(-50); // Keep last 50 positions
    });
    
    // Set up interpolation for smooth movement
    if (currentPositionRef.current) {
      targetPositionRef.current = {
        lat: data.lat,
        lng: data.lng,
        timestamp: Date.now()
      };
    } else {
      // First position, set directly
      currentPositionRef.current = {
        lat: data.lat,
        lng: data.lng,
        timestamp: Date.now()
      };
    }
    
    lastUpdateRef.current = Date.now();
    setLoading(false);
    setError(null);
  }, [routeId]);

  // Fetch initial bus location from Supabase
  useEffect(() => {
    const fetchInitialLocation = async () => {
      if (!supabase || !routeId) return;

      try {
        // Get latest location for buses on this route
        const { data, error: fetchError } = await supabase
          .from('bus_locations')
          .select('*')
          .eq('route_id', routeId)
          .order('timestamp', { ascending: false })
          .limit(1);

        if (fetchError) {
          console.error('[useBusLocation] Error fetching initial location:', fetchError);
          return;
        }

        if (data && data.length > 0) {
          const loc = data[0];
          // Map snake_case to camelCase
          handleBusLocationUpdate({ 
            payload: {
              busId: loc.bus_id,
              routeId: loc.route_id,
              driverUid: loc.driver_uid,
              lat: loc.lat,
              lng: loc.lng,
              speed: loc.speed,
              heading: loc.heading,
              timestamp: loc.timestamp
            }
          });
        }
      } catch (err) {
        console.error('[useBusLocation] Error in fetchInitialLocation:', err);
      }
    };

    fetchInitialLocation();
  }, [routeId, handleBusLocationUpdate]);

  // Subscribe to realtime channel
  useEffect(() => {
    if (!supabase || !routeId) {
      console.log('[useBusLocation] Supabase client or routeId not available');
      setError('Supabase not initialized');
      setLoading(false);
      return;
    }

    const channelName = `route_${routeId}`;
    console.log(`[useBusLocation] Creating Supabase channel: ${channelName}`);
    
    const channel = supabase.channel(channelName);
    
    // Subscribe to bus location updates
    channel.on('broadcast', { event: 'bus_location_update' }, (payload: any) => {
      console.log('[useBusLocation] Received bus_location_update event:', payload);
      handleBusLocationUpdate(payload);
    });

    // Subscribe to the channel
    channel.subscribe((status: string, err: any) => {
      console.log(`[useBusLocation] Channel status: ${status}`, err);
      
      if (status === 'SUBSCRIBED') {
        console.log(`[useBusLocation] Successfully subscribed to ${channelName}`);
        setLoading(false);
      } else if (status === 'CHANNEL_ERROR') {
        console.error(`[useBusLocation] Error subscribing to ${channelName}:`, err);
        setError(`Error subscribing to channel: ${err?.message || 'Unknown error'}`);
        setLoading(false);
      } else if (status === 'TIMED_OUT') {
        console.error(`[useBusLocation] Timeout subscribing to ${channelName}`);
        setError('Timeout subscribing to channel');
        setLoading(false);
      }
    });

    channelRef.current = channel;

    // Cleanup function
    return () => {
      if (channelRef.current) {
        console.log(`[useBusLocation] Unsubscribing from ${channelName}`);
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [routeId, handleBusLocationUpdate]);

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
          
          const lat = currentPositionRef.current.lat + 
            (targetPositionRef.current.lat - currentPositionRef.current.lat) * easeProgress;
            
          const lng = currentPositionRef.current.lng + 
            (targetPositionRef.current.lng - currentPositionRef.current.lng) * easeProgress;
          
          // Update current position
          currentPositionRef.current = { lat, lng, timestamp: now };
        } else {
          // Animation complete
          currentPositionRef.current = { ...targetPositionRef.current };
          targetPositionRef.current = null;
        }
      }
      
      animationRef.current = requestAnimationFrame(animate);
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

