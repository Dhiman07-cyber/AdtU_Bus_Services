import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase-client';

type EventCallback = (payload: any) => void;

interface ChannelCallbacks {
  [event: string]: EventCallback;
}

export const useSupabaseRealtimeChannel = (
  routeId: string,
  callbacks: ChannelCallbacks
) => {
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!supabase || !routeId) {
      console.log('Supabase client or routeId not available');
      return;
    }

    // Create channel
    const channelName = `route_${routeId}`;
    console.log(`Creating Supabase channel: ${channelName}`);
    const channel = supabase.channel(channelName);
    
    // Subscribe to all events in the callbacks object
    Object.entries(callbacks).forEach(([event, callback]) => {
      console.log(`Subscribing to event: ${event}`);
      channel.on('broadcast', { event }, (payload: any) => {
        console.log(`Received ${event} event:`, payload);
        callback(payload);
      });
    });

    // Subscribe to the channel
    channel.subscribe((status: string, error: any) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Successfully subscribed to ${channelName} channel`);
      } else if (status === 'CHANNEL_ERROR') {
        console.error(`Error subscribing to ${channelName} channel:`, error);
      } else if (status === 'TIMED_OUT') {
        console.error(`Timeout subscribing to ${channelName} channel`);
      } else {
        console.log(`Channel status: ${status}`, error);
      }
    });

    channelRef.current = channel;

    // Cleanup function
    return () => {
      if (channelRef.current) {
        console.log(`Unsubscribing from ${channelName} channel`);
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [routeId]);

  return channelRef.current;
};