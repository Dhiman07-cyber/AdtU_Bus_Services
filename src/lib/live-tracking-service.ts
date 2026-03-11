/**
 * Live Tracking Service
 * Handles real-time location updates with smooth animations and robust error handling
 */

import { supabase } from './supabase-client';

export interface BusLocation {
  bus_id: string;
  driver_uid: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number | null;
  accuracy: number;
  timestamp: string;
}

export interface WaitingFlag {
  id?: string;
  student_uid: string;
  student_name: string;
  bus_id: string;
  route_id: string;
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lng: number;
  student_lat: number;
  student_lng: number;
  accuracy: number | null;
  status: 'raised' | 'acknowledged' | 'boarded' | 'expired';
  created_at: string;
  expires_at: string;
  source?: 'gps' | 'manual';
}



class LiveTrackingService {
  private watchId: number | null = null;
  private locationUpdateInterval: NodeJS.Timeout | null = null;
  private isOnline: boolean = true;
  private bufferedLocation: BusLocation | null = null;
  private lastUpdateTime: number = 0;
  private updateIntervalMs: number = 5000; // Default 5 seconds

  /**
   * Start watching driver location
   */
  startLocationWatch(
    onSuccess: (position: GeolocationPosition) => void,
    onError: (error: GeolocationPositionError) => void
  ): void {
    if (!navigator.geolocation) {
      const error = {
        code: 0,
        message: 'Geolocation not supported',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError;
      onError(error);
      return;
    }

    // Stop any existing watch
    this.stopLocationWatch();

    // Request high accuracy location
    this.watchId = navigator.geolocation.watchPosition(
      onSuccess,
      onError,
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      }
    );

    console.log('🌍 Location watch started with ID:', this.watchId);
  }

  /**
   * Stop watching location
   */
  stopLocationWatch(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
      console.log('🛑 Location watch stopped');
    }

    if (this.locationUpdateInterval) {
      clearInterval(this.locationUpdateInterval);
      this.locationUpdateInterval = null;
    }
  }

  /**
   * Send location update to server with throttling
   * PERFORMANCE: Uses adaptive throttling based on speed
   */
  async sendLocationUpdate(location: BusLocation, force: boolean = false): Promise<boolean> {
    const now = Date.now();

    // SECURITY: Validate required fields
    if (!location.bus_id || !location.driver_uid || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
      return false;
    }

    // SECURITY: Validate coordinate ranges
    if (location.lat < -90 || location.lat > 90 || location.lng < -180 || location.lng > 180) {
      return false;
    }

    // PERFORMANCE: Adaptive throttle based on speed
    const effectiveInterval = location.speed < 2
      ? 15000 // 15s when stopped/crawling — saves bandwidth
      : location.speed > 40
        ? 3000  // 3s at high speed — more frequent for accuracy
        : this.updateIntervalMs; // 5s default when moving

    if (!force && (now - this.lastUpdateTime) < effectiveInterval) {
      return false; // Skip this update (throttled)
    }

    // Check if online
    if (!this.isOnline) {
      this.bufferedLocation = location;
      return false;
    }

    try {
      const { error } = await supabase
        .from('bus_locations')
        .insert({
          bus_id: location.bus_id,
          driver_uid: location.driver_uid,
          lat: location.lat,
          lng: location.lng,
          speed: Math.max(0, location.speed || 0),
          heading: location.heading,
          accuracy: location.accuracy,
          timestamp: location.timestamp,
        });

      if (error) {
        console.error('Location update failed:', error.message);
        return false;
      }

      this.lastUpdateTime = now;
      this.bufferedLocation = null;
      return true;
    } catch (error) {
      this.bufferedLocation = location;
      return false;
    }
  }

  /**
   * Fetch latest bus location
   */
  async getLatestLocation(busId: string): Promise<BusLocation | null> {
    try {
      const { data, error } = await supabase
        .from('bus_locations')
        .select('*')
        .eq('bus_id', busId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error('Error fetching latest location:', error);
        return null;
      }

      return data as BusLocation;
    } catch (error) {
      console.error('Error fetching latest location:', error);
      return null;
    }
  }

  /**
   * Subscribe to real-time bus location updates
   */
  subscribeToBusLocation(
    busId: string,
    onLocationUpdate: (location: BusLocation) => void
  ) {
    const channel = supabase
      .channel(`bus_location_${busId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bus_locations',
          filter: `bus_id=eq.${busId}`,
        },
        (payload) => {
          console.log('📍 New location received:', payload.new);
          onLocationUpdate(payload.new as BusLocation);
        }
      )
      .subscribe((status) => {
        console.log('📡 Bus location channel status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }

  /**
   * Create waiting flag with student GPS
   */
  async createWaitingFlag(flag: WaitingFlag): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      // Set expiry time (10 minutes from now)
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('waiting_flags')
        .insert({
          student_uid: flag.student_uid,
          student_name: flag.student_name,
          bus_id: flag.bus_id,
          route_id: flag.route_id,
          stop_id: flag.stop_id,
          stop_name: flag.stop_name,
          stop_lat: flag.stop_lat,
          stop_lng: flag.stop_lng,
          student_lat: flag.student_lat,
          student_lng: flag.student_lng,
          accuracy: flag.accuracy,
          status: 'raised',
          created_at: new Date().toISOString(),
          expires_at: expiresAt,
          source: flag.source || 'gps',
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Error creating waiting flag:', error);
        return { success: false, error: error.message };
      }

      console.log('✅ Waiting flag created:', data);
      return { success: true, id: data.id };
    } catch (error: any) {
      console.error('❌ Error creating waiting flag:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update waiting flag status
   */
  async updateWaitingFlagStatus(
    flagId: string,
    status: 'acknowledged' | 'boarded' | 'expired'
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('waiting_flags')
        .update({ status })
        .eq('id', flagId);

      if (error) {
        console.error('❌ Error updating waiting flag:', error);
        return false;
      }

      console.log('✅ Waiting flag updated:', flagId, status);
      return true;
    } catch (error) {
      console.error('❌ Error updating waiting flag:', error);
      return false;
    }
  }

  /**
   * Subscribe to waiting flags for a bus
   */
  subscribeToWaitingFlags(
    busId: string,
    onFlagUpdate: (flag: WaitingFlag, event: 'INSERT' | 'UPDATE' | 'DELETE') => void
  ) {
    const channel = supabase
      .channel(`waiting_flags_${busId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'waiting_flags',
          filter: `bus_id=eq.${busId}`,
        },
        (payload) => {
          console.log('🚩 Waiting flag update:', payload);
          const event = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
          const flag = (payload.new || payload.old) as WaitingFlag;
          onFlagUpdate(flag, event);
        }
      )
      .subscribe((status) => {
        console.log('📡 Waiting flags channel status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }


  /**
   * Calculate distance between two points (Haversine formula)
   */
  calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  /**
   * Set online status
   */
  setOnlineStatus(isOnline: boolean): void {
    this.isOnline = isOnline;

    // Try to flush buffered location when coming back online
    if (isOnline && this.bufferedLocation) {
      this.sendLocationUpdate(this.bufferedLocation, true);
    }
  }

  /**
   * Get buffered location (for offline handling)
   */
  getBufferedLocation(): BusLocation | null {
    return this.bufferedLocation;
  }
}

// Export singleton instance
export const liveTrackingService = new LiveTrackingService();



