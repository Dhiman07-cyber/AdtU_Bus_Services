import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase-client';
import { RealtimeChannel } from '@supabase/supabase-js';

interface SubscriptionOptions {
  table: string;
  filter?: {
    column: string;
    value: string;
  };
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
}

export const useSupabaseSubscription = <T extends { id: string }>(options: SubscriptionOptions) => {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      let query = supabase.from(options.table).select('*');
      
      if (options.filter) {
        query = query.eq(options.filter.column, options.filter.value);
      }
      
      const { data: result, error } = await query;
      
      if (error) {
        throw new Error(error.message);
      }
      
      setData(result as T[]);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [options.table, options.filter]);

  useEffect(() => {
    // Fetch initial data
    fetchData();

    // Set up real-time subscription
    const channel = supabase
      .channel(`realtime:${options.table}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: options.table,
          ...(options.filter ? { filter: `${options.filter.column}=eq.${options.filter.value}` } : {})
        },
        (payload) => {
          // Handle INSERT events
          setData(prev => [...prev, payload.new as T]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: options.table,
          ...(options.filter ? { filter: `${options.filter.column}=eq.${options.filter.value}` } : {})
        },
        (payload) => {
          // Handle UPDATE events
          setData(prev => 
            prev.map(item => 
              (item as any).id === payload.new.id ? payload.new as T : item
            )
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: options.table,
          ...(options.filter ? { filter: `${options.filter.column}=eq.${options.filter.value}` } : {})
        },
        (payload) => {
          // Handle DELETE events
          setData(prev => 
            prev.filter(item => (item as any).id !== payload.old.id)
          );
        }
      )
      .subscribe();

    // Cleanup subscription
    return () => {
      supabase.removeChannel(channel);
    };
  }, [options, fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData
  };
};