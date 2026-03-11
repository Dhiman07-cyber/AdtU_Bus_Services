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

export const useBusLocation = (busId: string) => {
  const [currentLocation, setCurrentLocation] = useState<BusLocation | null>(null);
  const [history, setHistory] = useState<BusLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      timestamp: locationData.ts || locationData.timestamp || new Date().toISOString()
    };

    console.log('Received bus location update:', locationData);
    setCurrentLocation(newLocation);

    // Add to history
    setHistory(prev => {
      // Keep only the last 50 locations
      const newHistory = [...prev, newLocation];
      return newHistory.slice(-50);
    });

    setLoading(false);
  }, []);

  // Fetch initial bus location data
  useEffect(() => {
    const fetchInitialLocation = async () => {
      if (!supabase || !busId) {
        setLoading(false);
        return;
      }

      setLoading(true);

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
          setHistory([busLocation]);
        }
      } catch (err) {
        console.error('Error fetching initial bus location:', err);
      } finally {
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
        // Only resolve loading if we don't already have one from initial fetch
        console.log('✅ Subscribed to realtime bus location changes');
      }
    });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [busId, handleBusLocationUpdate]);

  return {
    currentLocation,
    interpolatedLocation: null, // Removed for performance
    history,
    loading,
    error
  };
};