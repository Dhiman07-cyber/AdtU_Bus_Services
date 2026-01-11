import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase-client';

interface WaitingFlag {
  id: string;
  studentUid: string;
  studentName: string;
  busId: string;
  routeId: string;
  stopId: string;
  stopName: string;
  stopLat: number | null;
  stopLng: number | null;
  status: 'raised' | 'acknowledged' | 'boarded' | 'expired' | 'cancelled';
  createdAt: string;
  expiresAt: string | null;
  ackByDriverUid: string | null;
}

/**
 * Hook to track real-time waiting flags on a route
 * Subscribes to route:routeId channel for live updates
 */
export const useWaitingFlagsFixed = (routeId: string) => {
  const [flags, setFlags] = useState<WaitingFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<any>(null);

  // Handle flag raised event
  const handleFlagRaised = useCallback((payload: any) => {
    console.log('[useWaitingFlags] Flag raised:', payload);
    
    const data = payload.payload || payload;
    
    const newFlag: WaitingFlag = {
      id: data.flagId || data.id,
      studentUid: data.studentUid,
      studentName: data.studentName || 'Unknown Student',
      busId: data.busId,
      routeId: data.routeId || routeId,
      stopId: data.stopId,
      stopName: data.stopName,
      stopLat: data.stopLat || null,
      stopLng: data.stopLng || null,
      status: 'raised',
      createdAt: data.timestamp || new Date().toISOString(),
      expiresAt: data.expiresAt || null,
      ackByDriverUid: null
    };
    
    setFlags(prev => {
      // Check if flag already exists
      if (prev.find(f => f.id === newFlag.id)) {
        return prev;
      }
      return [...prev, newFlag];
    });
  }, [routeId]);

  // Handle flag acknowledged event
  const handleFlagAcknowledged = useCallback((payload: any) => {
    console.log('[useWaitingFlags] Flag acknowledged:', payload);
    
    const data = payload.payload || payload;
    const flagId = data.flagId;
    
    setFlags(prev =>
      prev.map(flag =>
        flag.id === flagId
          ? { ...flag, status: 'acknowledged', ackByDriverUid: data.ackByDriverUid }
          : flag
      )
    );
  }, []);

  // Handle flag boarded event
  const handleFlagBoarded = useCallback((payload: any) => {
    console.log('[useWaitingFlags] Flag boarded:', payload);
    
    const data = payload.payload || payload;
    const flagId = data.flagId;
    
    setFlags(prev =>
      prev.map(flag =>
        flag.id === flagId
          ? { ...flag, status: 'boarded' }
          : flag
      )
    );
  }, []);

  // Handle flag removed event
  const handleFlagRemoved = useCallback((payload: any) => {
    console.log('[useWaitingFlags] Flag removed:', payload);
    
    const data = payload.payload || payload;
    const flagId = data.flagId;
    
    setFlags(prev => prev.filter(flag => flag.id !== flagId));
  }, []);

  // Fetch initial waiting flags
  useEffect(() => {
    const fetchInitialFlags = async () => {
      if (!supabase || !routeId) return;

      try {
        const { data, error: fetchError } = await supabase
          .from('waiting_flags')
          .select('*')
          .eq('route_id', routeId)
          .in('status', ['raised', 'acknowledged'])
          .order('created_at', { ascending: false });

        if (fetchError) {
          console.error('[useWaitingFlags] Error fetching initial flags:', fetchError);
          return;
        }

        if (data && data.length > 0) {
          // Map snake_case to camelCase
          const mappedFlags = data.map((flag: any) => ({
            id: flag.id,
            studentUid: flag.student_uid,
            studentName: flag.student_name,
            busId: flag.bus_id,
            routeId: flag.route_id,
            stopId: flag.stop_id,
            stopName: flag.stop_name,
            stopLat: flag.stop_lat,
            stopLng: flag.stop_lng,
            status: flag.status,
            createdAt: flag.created_at,
            expiresAt: flag.expires_at,
            ackByDriverUid: flag.ack_by_driver_uid
          }));
          setFlags(mappedFlags);
        }
      } catch (err) {
        console.error('[useWaitingFlags] Error in fetchInitialFlags:', err);
      }
    };

    fetchInitialFlags();
  }, [routeId]);

  // Subscribe to realtime channel
  useEffect(() => {
    if (!supabase || !routeId) {
      console.log('[useWaitingFlags] Supabase client or routeId not available');
      setError('Supabase not initialized');
      setLoading(false);
      return;
    }

    const channelName = `route_${routeId}`;
    console.log(`[useWaitingFlags] Creating Supabase channel: ${channelName}`);
    
    const channel = supabase.channel(channelName);
    
    // Subscribe to waiting flag events
    channel.on('broadcast', { event: 'waiting_flag_raised' }, handleFlagRaised);
    channel.on('broadcast', { event: 'waiting_flag_acknowledged' }, handleFlagAcknowledged);
    channel.on('broadcast', { event: 'waiting_flag_boarded' }, handleFlagBoarded);
    channel.on('broadcast', { event: 'waiting_flag_removed' }, handleFlagRemoved);

    // Subscribe to the channel
    channel.subscribe((status: string, err: any) => {
      console.log(`[useWaitingFlags] Channel status: ${status}`, err);
      
      if (status === 'SUBSCRIBED') {
        console.log(`[useWaitingFlags] Successfully subscribed to ${channelName}`);
        setLoading(false);
      } else if (status === 'CHANNEL_ERROR') {
        console.error(`[useWaitingFlags] Error subscribing to ${channelName}:`, err);
        setError(`Error subscribing to channel: ${err?.message || 'Unknown error'}`);
        setLoading(false);
      } else if (status === 'TIMED_OUT') {
        console.error(`[useWaitingFlags] Timeout subscribing to ${channelName}`);
        setError('Timeout subscribing to channel');
        setLoading(false);
      }
    });

    channelRef.current = channel;

    // Cleanup function
    return () => {
      if (channelRef.current) {
        console.log(`[useWaitingFlags] Unsubscribing from ${channelName}`);
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [routeId, handleFlagRaised, handleFlagAcknowledged, handleFlagBoarded, handleFlagRemoved]);

  return {
    flags,
    loading,
    error
  };
};

