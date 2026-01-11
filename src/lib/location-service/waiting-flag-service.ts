/**
 * Waiting Flag Service - Production Optimized
 * 
 * Handles student waiting flags with:
 * - Throttled location updates (8-10s)
 * - Duplicate prevention
 * - Real-time broadcasts
 * - Automatic expiry (10-15 min)
 * - Event-driven cleanup
 */

import { supabase } from '@/lib/supabase-client';

interface WaitingFlag {
  id?: string;
  student_uid: string;
  student_name: string;
  bus_id: string;
  route_id: string;
  stop_id?: string;
  stop_name?: string;
  stop_lat: number;
  stop_lng: number;
  status: 'raised' | 'acknowledged' | 'boarded' | 'cancelled' | 'expired';
  message?: string;
  trip_id?: string;
  created_at?: string;
  expires_at?: string;
  ack_by_driver_uid?: string;
}

interface WaitingFlagConfig {
  updateIntervalMs: number;       // Default: 8000 (8 seconds)
  expiryMinutes: number;          // Default: 15
  maxUpdateDistance: number;      // Default: 50 meters
  enableLocationUpdates: boolean; // Default: true
  enableAutoExpiry: boolean;      // Default: true
}

export class WaitingFlagService {
  private currentFlag: WaitingFlag | null = null;
  private updateTimer: NodeJS.Timeout | null = null;
  private expiryTimer: NodeJS.Timeout | null = null;
  private locationWatchId: number | null = null;
  private lastLocation: { lat: number; lng: number } | null = null;
  private studentUid: string;
  private studentName: string;
  private busId: string;
  private routeId: string;
  private config: WaitingFlagConfig;

  constructor(
    studentUid: string,
    studentName: string,
    busId: string,
    routeId: string,
    config?: Partial<WaitingFlagConfig>
  ) {
    this.studentUid = studentUid;
    this.studentName = studentName;
    this.busId = busId;
    this.routeId = routeId;
    this.config = {
      updateIntervalMs: 8000,
      expiryMinutes: 15,
      maxUpdateDistance: 50,
      enableLocationUpdates: true,
      enableAutoExpiry: true,
      ...config
    };
  }

  /**
   * Raise a waiting flag
   */
  public async raiseFlag(
    stopName?: string,
    message?: string
  ): Promise<{ success: boolean; flagId?: string; error?: string }> {
    console.log(`🚩 Raising waiting flag for student ${this.studentUid}...`);

    // Check if flag already exists
    if (this.currentFlag && this.currentFlag.status === 'raised') {
      return { 
        success: false, 
        error: 'Waiting flag already active' 
      };
    }

    try {
      // Get current location
      const location = await this.getCurrentLocation();
      if (!location) {
        return { 
          success: false, 
          error: 'Unable to get current location' 
        };
      }

      // Check for duplicate flags
      const { data: existingFlags } = await supabase
        .from('waiting_flags')
        .select('id')
        .eq('student_uid', this.studentUid)
        .eq('bus_id', this.busId)
        .eq('status', 'raised')
        .limit(1);

      if (existingFlags && existingFlags.length > 0) {
        return { 
          success: false, 
          error: 'Duplicate flag detected' 
        };
      }

      // Create flag
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.config.expiryMinutes * 60000);

      const flagData: WaitingFlag = {
        student_uid: this.studentUid,
        student_name: this.studentName,
        bus_id: this.busId,
        route_id: this.routeId,
        stop_name: stopName,
        stop_lat: location.lat,
        stop_lng: location.lng,
        status: 'raised',
        message: message,
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString()
      };

      const { data, error } = await supabase
        .from('waiting_flags')
        .insert(flagData)
        .select()
        .single();

      if (error) {
        console.error('❌ Failed to create waiting flag:', error);
        return { 
          success: false, 
          error: error.message 
        };
      }

      this.currentFlag = data;
      this.lastLocation = location;

      // Broadcast to driver
      await this.broadcastToDriver('waiting_flag_created', {
        flagId: data.id,
        studentName: this.studentName,
        stopName: stopName || 'Current Location',
        lat: location.lat,
        lng: location.lng,
        message
      });

      // Start location updates if enabled
      if (this.config.enableLocationUpdates) {
        this.startLocationUpdates();
      }

      // Set expiry timer if enabled
      if (this.config.enableAutoExpiry) {
        this.setExpiryTimer();
      }

      console.log(`✅ Waiting flag created: ${data.id}`);
      return { 
        success: true, 
        flagId: data.id 
      };

    } catch (error: any) {
      console.error('❌ Error raising flag:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to raise flag' 
      };
    }
  }

  /**
   * Cancel waiting flag
   */
  public async cancelFlag(): Promise<{ success: boolean; error?: string }> {
    if (!this.currentFlag || this.currentFlag.status !== 'raised') {
      return { 
        success: false, 
        error: 'No active waiting flag' 
      };
    }

    try {
      const { error } = await supabase
        .from('waiting_flags')
        .update({ status: 'cancelled' })
        .eq('id', this.currentFlag.id);

      if (error) {
        throw error;
      }

      // Broadcast to driver
      await this.broadcastToDriver('waiting_flag_removed', {
        flagId: this.currentFlag.id,
        reason: 'cancelled'
      });

      // Cleanup
      this.cleanup();

      console.log(`✅ Waiting flag cancelled`);
      return { success: true };

    } catch (error: any) {
      console.error('❌ Error cancelling flag:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to cancel flag' 
      };
    }
  }

  /**
   * Update flag location (throttled)
   */
  private async updateFlagLocation(): Promise<void> {
    if (!this.currentFlag || this.currentFlag.status !== 'raised') {
      return;
    }

    try {
      const location = await this.getCurrentLocation();
      if (!location) return;

      // Check if moved significantly
      if (this.lastLocation) {
        const distance = this.calculateDistance(
          this.lastLocation.lat,
          this.lastLocation.lng,
          location.lat,
          location.lng
        );

        if (distance < this.config.maxUpdateDistance) {
          console.log(`📍 Location unchanged (${distance.toFixed(0)}m), skipping update`);
          return;
        }
      }

      // Update in database
      const { error } = await supabase
        .from('waiting_flags')
        .update({
          stop_lat: location.lat,
          stop_lng: location.lng
        })
        .eq('id', this.currentFlag.id);

      if (error) {
        console.error('❌ Failed to update flag location:', error);
        return;
      }

      this.lastLocation = location;

      // Broadcast update to driver
      await this.broadcastToDriver('waiting_flag_updated', {
        flagId: this.currentFlag.id,
        lat: location.lat,
        lng: location.lng
      });

      console.log(`📍 Flag location updated: (${location.lat.toFixed(6)}, ${location.lng.toFixed(6)})`);

    } catch (error) {
      console.error('❌ Error updating flag location:', error);
    }
  }

  /**
   * Start throttled location updates
   */
  private startLocationUpdates(): void {
    // Add random jitter (0-2 seconds)
    const jitter = Math.random() * 2000;
    const interval = this.config.updateIntervalMs + jitter;

    this.updateTimer = setInterval(() => {
      this.updateFlagLocation();
    }, interval);

    console.log(`📍 Location updates started (every ${(interval / 1000).toFixed(1)}s)`);
  }

  /**
   * Set expiry timer
   */
  private setExpiryTimer(): void {
    const expiryMs = this.config.expiryMinutes * 60000;

    this.expiryTimer = setTimeout(() => {
      this.expireFlag();
    }, expiryMs);

    console.log(`⏰ Flag will expire in ${this.config.expiryMinutes} minutes`);
  }

  /**
   * Expire the flag
   */
  private async expireFlag(): Promise<void> {
    if (!this.currentFlag) return;

    try {
      await supabase
        .from('waiting_flags')
        .update({ status: 'expired' })
        .eq('id', this.currentFlag.id);

      // Broadcast to driver
      await this.broadcastToDriver('waiting_flag_removed', {
        flagId: this.currentFlag.id,
        reason: 'expired'
      });

      // Broadcast to student
      await this.broadcastToStudent('flag_expired', {
        flagId: this.currentFlag.id
      });

      console.log(`⏰ Waiting flag expired`);
      this.cleanup();

    } catch (error) {
      console.error('❌ Error expiring flag:', error);
    }
  }

  /**
   * Listen for acknowledgment from driver
   */
  public subscribeToAcknowledgment(
    onAcknowledged: (driverUid: string) => void
  ): () => void {
    const channel = supabase
      .channel(`student_${this.studentUid}`)
      .on('broadcast', { event: 'flag_acknowledged' }, (payload) => {
        if (payload.payload.flagId === this.currentFlag?.id) {
          console.log(`🎉 Flag acknowledged by driver`);
          
          // Update local state
          if (this.currentFlag) {
            this.currentFlag.status = 'acknowledged';
            this.currentFlag.ack_by_driver_uid = payload.payload.driverUid;
          }

          // Stop location updates
          if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
          }

          onAcknowledged(payload.payload.driverUid);
        }
      })
      .subscribe();

    // Return unsubscribe function
    return () => {
      supabase.removeChannel(channel);
    };
  }

  /**
   * Get current location
   */
  private getCurrentLocation(): Promise<{ lat: number; lng: number } | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.error('❌ Location error:', error);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      );
    });
  }

  /**
   * Broadcast to driver channel
   */
  private async broadcastToDriver(event: string, payload: any): Promise<void> {
    try {
      const channel = supabase.channel(`waiting_flags_${this.busId}`);
      await channel.send({
        type: 'broadcast',
        event,
        payload
      });
      console.log(`📢 Broadcast to driver: ${event}`);
    } catch (error) {
      console.error('❌ Failed to broadcast to driver:', error);
    }
  }

  /**
   * Broadcast to student channel
   */
  private async broadcastToStudent(event: string, payload: any): Promise<void> {
    try {
      const channel = supabase.channel(`student_${this.studentUid}`);
      await channel.send({
        type: 'broadcast',
        event,
        payload
      });
      console.log(`📢 Broadcast to student: ${event}`);
    } catch (error) {
      console.error('❌ Failed to broadcast to student:', error);
    }
  }

  /**
   * Calculate distance between two points
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Cleanup timers and subscriptions
   */
  private cleanup(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }

    if (this.locationWatchId !== null) {
      navigator.geolocation.clearWatch(this.locationWatchId);
      this.locationWatchId = null;
    }

    this.currentFlag = null;
    this.lastLocation = null;
  }

  /**
   * Destroy service and cleanup
   */
  public destroy(): void {
    this.cleanup();
  }
}

export default WaitingFlagService;
