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

  const [interpolatedLocation, setInterpolatedLocation] = useState<Position | null>(null);

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
        setInterpolatedLocation({
          lat: locationData.lat,
          lng: locationData.lng,
          timestamp: Date.now()
        });
      }

      lastUpdateRef.current = Date.now();
      setLoading(false);
    });
  }, []);

  // Fetch initial bus location data
  useEffect(() => {
    const fetchInitialLocation = async () => {
      if (!supabase || !busId) {
        setLoading(false);
        return;
      }

      try {
        const { data: locations, error } = await supabase
          .from('bus_locations')
          .select('*')
          .eq('bus_id', busId)
          .order('timestamp', { ascending: false })
          .limit(1);

        if (!error && locations && locations.length > 0) {
          const location = locations[0];
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
          currentPositionRef.current = {
            lat: location.lat,
            lng: location.lng,
            timestamp: Date.now()
          };
          setInterpolatedLocation({ ...currentPositionRef.current });
          setHistory([busLocation]);
          setLoading(false);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching initial bus location:', err);
        setLoading(false);
      }
    };

    fetchInitialLocation();
  }, [busId]);

  // Subscribe to realtime channel
  useEffect(() => {
    if (!supabase || !busId) return;

    const channelName = `bus_location_${busId}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: {
          self: false
        }
      }
    });

    channel.on('broadcast', { event: 'bus_location_update' }, handleBusLocationUpdate);

    channel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'bus_locations',
      filter: `bus_id=eq.${busId}`
    }, (payload) => {
      const newLoc = payload.new;
      handleBusLocationUpdate({
        payload: {
          busId: newLoc.bus_id,
          driverUid: newLoc.driver_uid,
          lat: newLoc.lat,
          lng: newLoc.lng,
          speed: newLoc.speed || 0,
          heading: newLoc.heading || 0,
          accuracy: newLoc.accuracy,
          ts: newLoc.timestamp
        }
      });
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setLoading(false);
      }
    });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [busId, handleBusLocationUpdate]);

  // Interpolation for smooth movement
  useEffect(() => {
    let lastAnimTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const deltaTime = now - lastAnimTime;
      lastAnimTime = now;

      if (targetPositionRef.current && currentPositionRef.current) {
        const elapsed = now - lastUpdateRef.current;
        const duration = 2500; // 2.5 seconds interpolation

        if (elapsed < duration) {
          // Use a simple lerp for smooth tracking
          // The 0.1 factor per frame (at 60fps) provides smooth movement
          const factor = 0.08;

          currentPositionRef.current = {
            lat: currentPositionRef.current.lat + (targetPositionRef.current.lat - currentPositionRef.current.lat) * factor,
            lng: currentPositionRef.current.lng + (targetPositionRef.current.lng - currentPositionRef.current.lng) * factor,
            timestamp: now
          };

          setInterpolatedLocation({ ...currentPositionRef.current });
        } else {
          currentPositionRef.current = { ...targetPositionRef.current };
          setInterpolatedLocation({ ...currentPositionRef.current });
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

  return {
    currentLocation,
    interpolatedLocation,
    history,
    loading,
    error
  };
};