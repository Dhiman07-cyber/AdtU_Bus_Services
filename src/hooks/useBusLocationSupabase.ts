import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase-client';

interface BusLocation {
  bus_id: string;
  driver_uid: string;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  updated_at: string;
}

export const useBusLocationSupabase = (busId: string | undefined) => {
  const [location, setLocation] = useState<BusLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInitialLocation = useCallback(async () => {
    if (!busId) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('bus_locations')
        .select('*')
        .eq('bus_id', busId)
        .limit(1);
      
      if (error) {
        throw new Error(error.message);
      }
      
      if (data && data.length > 0) {
        setLocation(data[0]);
      } else {
        setLocation(null);
      }
    } catch (err: any) {
      console.error('Error fetching initial bus location:', err);
      setError(err.message || 'Failed to fetch bus location');
    } finally {
      setLoading(false);
    }
  }, [busId]);

  useEffect(() => {
    // Fetch initial location
    fetchInitialLocation();

    // Set up real-time subscription
    if (busId) {
      const channel = supabase
        .channel(`bus_location:${busId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'bus_locations',
            filter: `bus_id=eq.${busId}`
          },
          (payload) => {
            // Handle location updates
            setLocation(payload.new as BusLocation);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'bus_locations',
            filter: `bus_id=eq.${busId}`
          },
          (payload) => {
            // Handle initial location insert
            setLocation(payload.new as BusLocation);
          }
        )
        .subscribe();

      // Cleanup subscription
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [busId, fetchInitialLocation]);

  return {
    location,
    loading,
    error,
    refetch: fetchInitialLocation
  };
};