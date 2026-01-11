import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase-client';

interface WaitingFlag {
  id: string;
  student_uid: string;
  bus_id: string;
  route_id: string;
  stop_name: string;
  status: 'waiting' | 'acknowledged' | 'boarded' | 'cancelled';
  created_at: string;
  acknowledged_at?: string;
  boarded_at?: string;
}

export const useWaitingFlagsSupabase = (busId: string | undefined) => {
  const [waitingFlags, setWaitingFlags] = useState<WaitingFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWaitingFlags = useCallback(async () => {
    if (!busId) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('waiting_flags')
        .select('*')
        .eq('bus_id', busId)
        .eq('status', 'waiting')
        .order('created_at', { ascending: false });
      
      if (error) {
        throw new Error(error.message);
      }
      
      setWaitingFlags(data || []);
    } catch (err: any) {
      console.error('Error fetching waiting flags:', err);
      setError(err.message || 'Failed to fetch waiting flags');
    } finally {
      setLoading(false);
    }
  }, [busId]);

  useEffect(() => {
    // Fetch initial waiting flags
    fetchWaitingFlags();

    // Set up real-time subscription
    if (busId) {
      const channel = supabase
        .channel(`waiting_flags:${busId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'waiting_flags',
            filter: `bus_id=eq.${busId}`
          },
          (payload) => {
            // Handle new waiting flags
            setWaitingFlags(prev => [...prev, payload.new as WaitingFlag]);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'waiting_flags',
            filter: `bus_id=eq.${busId}`
          },
          (payload) => {
            // Handle updates to waiting flags
            setWaitingFlags(prev => 
              prev.map(flag => 
                flag.id === payload.new.id ? payload.new as WaitingFlag : flag
              )
            );
          }
        )
        .subscribe();

      // Cleanup subscription
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [busId, fetchWaitingFlags]);

  return {
    waitingFlags,
    loading,
    error,
    refetch: fetchWaitingFlags
  };
};