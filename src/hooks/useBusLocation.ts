import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase-client';
import {
  isValidLatLng,
  isNewerTimestamp,
  isImpossibleJump,
  shouldEmitDisplayUpdate,
  type ThrottleState,
} from '@/lib/maps/location-display-guards';

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

  const lastAcceptedRef = useRef<{ lat: number; lng: number; atMs: number; ts: string } | null>(null);
  const lastUiTsRef = useRef<string | null>(null);
  const throttleRef = useRef<ThrottleState | null>(null);
  const pageHiddenRef = useRef(
    typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false
  );

  useEffect(() => {
    const onVis = () => {
      pageHiddenRef.current = document.visibilityState === 'hidden';
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const applyIncomingLocation = useCallback((newLocation: BusLocation, forceDisplay: boolean) => {
    if (!isValidLatLng(newLocation.lat, newLocation.lng)) return;

    setCurrentLocation(newLocation);
    setHistory((prev) => {
      const next = [...prev, newLocation];
      return next.slice(-50);
    });
    setLoading(false);
  }, []);

  const handleBusLocationUpdate = useCallback(
    (payload: any) => {
      const locationData = payload.payload;
      const newLocation: BusLocation = {
        busId: locationData.busId,
        driverUid: locationData.driverUid,
        lat: locationData.lat,
        lng: locationData.lng,
        speed: locationData.speed || 0,
        heading: locationData.heading || 0,
        accuracy: locationData.accuracy,
        timestamp: locationData.ts || locationData.timestamp || new Date().toISOString(),
      };
      applyIncomingLocation(newLocation, false);
    },
    [applyIncomingLocation]
  );

  useEffect(() => {
    lastAcceptedRef.current = null;
    throttleRef.current = null;

    if (!busId) {
      lastUiTsRef.current = null;
      setCurrentLocation(null);
      setHistory([]);
      setLoading(false);
      return;
    }

    // Always start fresh - no cache
    lastUiTsRef.current = null;
    setCurrentLocation(null);
    setHistory([]);

    const fetchInitialLocation = async () => {
      if (!supabase || !busId) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const { data: locations, error: qErr } = await supabase
          .from('bus_locations')
          .select('*')
          .eq('bus_id', busId)
          .order('timestamp', { ascending: false })
          .limit(1);

        if (!qErr && locations && locations.length > 0) {
          const location = locations[0];
          
          // CRITICAL: Check if the location is recent (within last 30 minutes)
          // This prevents showing stale markers from ended trips
          const locationTime = new Date(location.timestamp).getTime();
          const now = Date.now();
          const thirtyMinutesMs = 30 * 60 * 1000;

          if (now - locationTime < thirtyMinutesMs) {
            const busLocation: BusLocation = {
              busId: location.bus_id,
              driverUid: location.driver_uid,
              lat: location.lat,
              lng: location.lng,
              speed: location.speed || 0,
              heading: location.heading || 0,
              accuracy: location.accuracy,
              timestamp: location.timestamp || new Date().toISOString(),
            };
            if (isValidLatLng(busLocation.lat, busLocation.lng)) {
              applyIncomingLocation(busLocation, true);
              setHistory([busLocation]);
            }
          } else {
            console.log('ℹ️ Location found but too stale (>30m), ignoring.');
          }
        }
      } catch (err) {
        console.error('Error fetching initial bus location:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialLocation();
  }, [busId, applyIncomingLocation]);

  useEffect(() => {
    if (!supabase || !busId) return;

    const channelName = `bus_location_${busId}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: {
          self: false,
        },
      },
    });

    channel.on('broadcast', { event: 'bus_location_update' }, handleBusLocationUpdate);

    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'bus_locations',
        filter: `bus_id=eq.${busId}`,
      },
      (payload) => {
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
            ts: newLoc.timestamp,
          },
        });
      }
    );

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ Subscribed to realtime bus location changes');
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [busId, handleBusLocationUpdate]);

  return {
    currentLocation,
    interpolatedLocation: null,
    history,
    loading,
    error: null as string | null,
    /** @deprecated Legacy API — returns null (no interpolation). */
    getInterpolatedPosition: (): null => null,
  };
};
