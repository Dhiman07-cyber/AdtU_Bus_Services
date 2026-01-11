/**
 * Student Subscription Service - Production Optimized
 * 
 * Handles real-time bus location subscriptions with:
 * - Minimal listeners (subscribe only to assigned bus)
 * - Automatic reconnection on disconnect
 * - Background/foreground state management
 * - Message interpolation for smooth animations
 * - Compact message format (<300 bytes)
 */

import { supabase } from '@/lib/supabase-client';
import { RealtimeChannel } from '@supabase/supabase-js';

interface BusLocation {
  busId: string;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  timestamp: string;
  confidence?: 'high' | 'medium' | 'low';
}

interface SubscriptionConfig {
  backgroundTimeoutMs: number;      // Default: 300000 (5 min)
  reconnectDelayMs: number;         // Default: 1000
  maxReconnectAttempts: number;     // Default: 5
  interpolationFps: number;         // Default: 60
  maxInterpolationDistance: number; // Default: 100 meters
  enableSmoothing: boolean;         // Default: true
  compressMessages: boolean;        // Default: true
}

export class StudentSubscriptionService {
  private channel: RealtimeChannel | null = null;
  private currentLocation: BusLocation | null = null;
  private targetLocation: BusLocation | null = null;
  private interpolationFrame: number | null = null;
  private reconnectAttempts: number = 0;
  private backgroundTimer: NodeJS.Timeout | null = null;
  private isBackground: boolean = false;
  private busId: string;
  private studentUid: string;
  private config: SubscriptionConfig;
  private onLocationUpdate: (location: BusLocation) => void;
  private onStatusChange: (status: 'connected' | 'disconnected' | 'error') => void;

  constructor(
    busId: string,
    studentUid: string,
    onLocationUpdate: (location: BusLocation) => void,
    onStatusChange: (status: 'connected' | 'disconnected' | 'error') => void,
    config?: Partial<SubscriptionConfig>
  ) {
    this.busId = busId;
    this.studentUid = studentUid;
    this.onLocationUpdate = onLocationUpdate;
    this.onStatusChange = onStatusChange;
    this.config = {
      backgroundTimeoutMs: 300000,
      reconnectDelayMs: 1000,
      maxReconnectAttempts: 5,
      interpolationFps: 60,
      maxInterpolationDistance: 100,
      enableSmoothing: true,
      compressMessages: true,
      ...config
    };

    // Listen for visibility changes
    this.setupVisibilityHandlers();
  }

  /**
   * Subscribe to bus location updates
   */
  public async subscribe(): Promise<void> {
    console.log(`📡 Subscribing to bus ${this.busId} location updates...`);

    // Create subscription channel (single channel per bus)
    this.channel = supabase.channel(`bus_location_${this.busId}`, {
      config: {
        broadcast: { 
          ack: false,  // Don't wait for acknowledgment
          self: false  // Don't receive own broadcasts
        }
      }
    });

    // Subscribe to location broadcasts
    this.channel
      .on('broadcast', { event: 'location_update' }, (payload) => {
        this.handleLocationUpdate(payload.payload as BusLocation);
      })
      .on('presence', { event: 'sync' }, () => {
        console.log('✅ Presence synced');
      });

    // Subscribe to the channel
    const subscription = await this.channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`✅ Subscribed to bus ${this.busId}`);
        this.onStatusChange('connected');
        this.reconnectAttempts = 0;
        
        // Fetch initial location
        this.fetchInitialLocation();
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        console.log(`❌ Subscription error: ${status}`);
        this.onStatusChange('disconnected');
        this.handleReconnect();
      }
    });
  }

  /**
   * Unsubscribe from updates
   */
  public async unsubscribe(): Promise<void> {
    if (this.channel) {
      await supabase.removeChannel(this.channel);
      this.channel = null;
    }

    // Stop interpolation
    if (this.interpolationFrame) {
      cancelAnimationFrame(this.interpolationFrame);
      this.interpolationFrame = null;
    }

    // Clear background timer
    if (this.backgroundTimer) {
      clearTimeout(this.backgroundTimer);
      this.backgroundTimer = null;
    }
  }

  /**
   * Fetch initial location from database
   */
  private async fetchInitialLocation(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('bus_locations')
        .select('bus_id, lat, lng, speed, heading, timestamp')
        .eq('bus_id', this.busId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (data && !error) {
        const location: BusLocation = {
          busId: data.bus_id,
          lat: data.lat,
          lng: data.lng,
          speed: data.speed,
          heading: data.heading,
          timestamp: data.timestamp,
          confidence: 'high'
        };

        this.currentLocation = location;
        this.onLocationUpdate(location);
        console.log(`📍 Initial location: (${location.lat.toFixed(6)}, ${location.lng.toFixed(6)})`);
      }
    } catch (error) {
      console.error('❌ Failed to fetch initial location:', error);
    }
  }

  /**
   * Handle incoming location update
   */
  private handleLocationUpdate(location: BusLocation): void {
    // Decompress message if needed
    if (this.config.compressMessages) {
      location = this.decompressLocation(location);
    }

    // Validate location
    const confidence = this.validateLocation(location);
    location.confidence = confidence;

    if (confidence === 'low') {
      console.warn('⚠️ Low confidence location update ignored');
      return;
    }

    // Update target location for interpolation
    this.targetLocation = location;

    // Start or continue interpolation
    if (this.config.enableSmoothing) {
      this.startInterpolation();
    } else {
      // Direct update without smoothing
      this.currentLocation = location;
      this.onLocationUpdate(location);
    }
  }

  /**
   * Interpolate between current and target location
   */
  private startInterpolation(): void {
    if (this.interpolationFrame) return; // Already running

    const interpolate = () => {
      if (!this.currentLocation || !this.targetLocation) {
        this.interpolationFrame = null;
        return;
      }

      // Calculate distance to target
      const distance = this.calculateDistance(
        this.currentLocation.lat,
        this.currentLocation.lng,
        this.targetLocation.lat,
        this.targetLocation.lng
      );

      // If distance is too large, jump to target (teleport)
      if (distance > this.config.maxInterpolationDistance) {
        console.log(`⚡ Large jump detected (${distance.toFixed(0)}m), teleporting...`);
        this.currentLocation = this.targetLocation;
        this.onLocationUpdate(this.currentLocation);
        this.interpolationFrame = null;
        return;
      }

      // Interpolation factor (smooth easing)
      const factor = 0.15; // Adjust for smoother/snappier movement

      // Linear interpolation with easing
      this.currentLocation = {
        ...this.currentLocation,
        lat: this.currentLocation.lat + (this.targetLocation.lat - this.currentLocation.lat) * factor,
        lng: this.currentLocation.lng + (this.targetLocation.lng - this.currentLocation.lng) * factor,
        heading: this.interpolateAngle(
          this.currentLocation.heading || 0,
          this.targetLocation.heading || 0,
          factor
        ),
        speed: this.targetLocation.speed,
        timestamp: this.targetLocation.timestamp,
        confidence: this.targetLocation.confidence
      };

      // Check if we're close enough to target
      const remainingDistance = this.calculateDistance(
        this.currentLocation.lat,
        this.currentLocation.lng,
        this.targetLocation.lat,
        this.targetLocation.lng
      );

      if (remainingDistance < 0.5) {
        // Close enough, snap to target
        this.currentLocation = this.targetLocation;
        this.interpolationFrame = null;
      } else {
        // Continue interpolation
        this.interpolationFrame = requestAnimationFrame(interpolate);
      }

      // Update UI
      this.onLocationUpdate(this.currentLocation);
    };

    interpolate();
  }

  /**
   * Validate location for confidence scoring
   */
  private validateLocation(location: BusLocation): 'high' | 'medium' | 'low' {
    if (!this.currentLocation) return 'high'; // First location

    const timeDiff = new Date(location.timestamp).getTime() - 
                     new Date(this.currentLocation.timestamp).getTime();
    const distance = this.calculateDistance(
      this.currentLocation.lat,
      this.currentLocation.lng,
      location.lat,
      location.lng
    );

    // Check for impossible movement
    const speedKmh = (distance / 1000) / (timeDiff / 3600000);
    
    if (speedKmh > 120) {
      return 'low'; // Impossible speed
    } else if (speedKmh > 80) {
      return 'medium'; // High speed, possible but suspicious
    }

    return 'high';
  }

  /**
   * Handle reconnection logic
   */
  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      this.onStatusChange('error');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
    
    setTimeout(() => {
      this.subscribe();
    }, delay);
  }

  /**
   * Setup visibility change handlers
   */
  private setupVisibilityHandlers(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.handleBackground();
      } else {
        this.handleForeground();
      }
    });

    // Also handle focus/blur
    window.addEventListener('blur', () => this.handleBackground());
    window.addEventListener('focus', () => this.handleForeground());
  }

  /**
   * Handle app going to background
   */
  private handleBackground(): void {
    if (this.isBackground) return;
    
    console.log('📱 App backgrounded');
    this.isBackground = true;

    // Set timer to disconnect after timeout
    this.backgroundTimer = setTimeout(() => {
      console.log('⏰ Background timeout, disconnecting...');
      this.unsubscribe();
    }, this.config.backgroundTimeoutMs);
  }

  /**
   * Handle app coming to foreground
   */
  private handleForeground(): void {
    if (!this.isBackground) return;

    console.log('📱 App foregrounded');
    this.isBackground = false;

    // Clear background timer
    if (this.backgroundTimer) {
      clearTimeout(this.backgroundTimer);
      this.backgroundTimer = null;
    }

    // Reconnect if disconnected
    if (!this.channel) {
      this.subscribe();
    }
  }

  /**
   * Compress location for smaller payload
   */
  private compressLocation(location: BusLocation): any {
    return {
      b: location.busId,
      la: Math.round(location.lat * 1000000) / 1000000, // 6 decimal places
      ln: Math.round(location.lng * 1000000) / 1000000,
      s: location.speed ? Math.round(location.speed * 10) / 10 : undefined,
      h: location.heading ? Math.round(location.heading) : undefined,
      t: location.timestamp.slice(-8) // Just time part
    };
  }

  /**
   * Decompress location from compact format
   */
  private decompressLocation(compressed: any): BusLocation {
    if (compressed.busId) return compressed as BusLocation; // Already decompressed

    return {
      busId: compressed.b || this.busId,
      lat: compressed.la,
      lng: compressed.ln,
      speed: compressed.s,
      heading: compressed.h,
      timestamp: compressed.t?.includes('T') ? compressed.t : new Date().toISOString().split('T')[0] + 'T' + compressed.t
    };
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
   * Interpolate angle (handle wrap around)
   */
  private interpolateAngle(current: number, target: number, factor: number): number {
    let delta = target - current;
    
    // Handle wrap around
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    
    return (current + delta * factor + 360) % 360;
  }
}

export default StudentSubscriptionService;
