/**
 * Driver Location Service - Production Optimized
 * 
 * Handles high-frequency GPS tracking from driver phones with:
 * - Movement-aware publishing (3s moving, 10s idle) 
 * - Single latest record pattern (upsert)
 * - Jitter to prevent synchronized bursts
 * - Anti-spoof validation
 * - Battery optimization
 */

import { supabase } from '@/lib/supabase-client';

interface LocationUpdate {
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  timestamp: string;
}

interface DriverLocationConfig {
  movingIntervalMs: number;    // Default: 3000
  idleIntervalMs: number;       // Default: 10000
  minDistanceMeters: number;    // Default: 5
  speedThresholdMs: number;     // Default: 1
  jitterMs: number;             // Default: 200
  maxAccuracy: number;          // Default: 50
  enableAntiSpoof: boolean;     // Default: true
  maxSpeedKmh: number;          // Default: 120
  maxJumpMeters: number;        // Default: 500
}

export class DriverLocationService {
  private watchId: number | null = null;
  private lastPublished: LocationUpdate | null = null;
  private publishTimer: NodeJS.Timeout | null = null;
  private isMoving: boolean = false;
  private busId: string;
  private driverUid: string;
  private routeId: string;
  private tripId: string;
  private config: DriverLocationConfig;
  private locationBuffer: LocationUpdate[] = [];
  private isOnline: boolean = true;

  constructor(
    busId: string, 
    driverUid: string, 
    routeId: string, 
    tripId: string,
    config?: Partial<DriverLocationConfig>
  ) {
    this.busId = busId;
    this.driverUid = driverUid;
    this.routeId = routeId;
    this.tripId = tripId;
    this.config = {
      movingIntervalMs: 3000,
      idleIntervalMs: 10000,
      minDistanceMeters: 5,
      speedThresholdMs: 1,
      jitterMs: 200,
      maxAccuracy: 50,
      enableAntiSpoof: true,
      maxSpeedKmh: 120,
      maxJumpMeters: 500,
      ...config
    };
  }

  /**
   * Start tracking with native GPS
   */
  public startTracking(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      // High accuracy options for driver tracking
      const options: PositionOptions = {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000
      };

      // Watch position with native API
      this.watchId = navigator.geolocation.watchPosition(
        (position) => this.handleLocationUpdate(position),
        (error) => this.handleLocationError(error),
        options
      );

      // Listen for online/offline events
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);

      resolve();
    });
  }

  /**
   * Stop tracking and cleanup
   */
  public stopTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.publishTimer) {
      clearTimeout(this.publishTimer);
      this.publishTimer = null;
    }

    // Flush any buffered updates
    this.flushBuffer();

    // Remove event listeners
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }

  /**
   * Handle location update from GPS
   */
  private handleLocationUpdate(position: GeolocationPosition): void {
    const update: LocationUpdate = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      speed: position.coords.speed || undefined,
      heading: position.coords.heading || undefined,
      accuracy: position.coords.accuracy,
      timestamp: new Date(position.timestamp).toISOString()
    };

    // Filter out low quality points
    if (update.accuracy && update.accuracy > this.config.maxAccuracy) {
      console.warn(`📍 Low accuracy location ignored: ${update.accuracy}m`);
      return;
    }

    // Anti-spoofing validation
    if (this.config.enableAntiSpoof && this.lastPublished) {
      const validation = this.validateMovement(this.lastPublished, update);
      if (!validation.valid) {
        console.error(`⚠️ Suspicious movement detected: ${validation.reason}`);
        this.bufferUpdate(update); // Buffer suspicious updates for review
        return;
      }
    }

    // Determine if moving based on speed
    const speedMs = update.speed || 0;
    this.isMoving = speedMs >= this.config.speedThresholdMs;

    // Check if we should publish based on movement and distance
    if (this.shouldPublish(update)) {
      this.schedulePublish(update);
    }
  }

  /**
   * Check if we should publish this update
   */
  private shouldPublish(update: LocationUpdate): boolean {
    if (!this.lastPublished) return true;

    // Calculate distance moved
    const distance = this.calculateDistance(
      this.lastPublished.lat,
      this.lastPublished.lng,
      update.lat,
      update.lng
    );

    // Only publish if moved minimum distance
    return distance >= this.config.minDistanceMeters;
  }

  /**
   * Schedule publish with appropriate interval and jitter
   */
  private schedulePublish(update: LocationUpdate): void {
    // Clear existing timer
    if (this.publishTimer) {
      clearTimeout(this.publishTimer);
    }

    // Determine interval based on movement
    const baseInterval = this.isMoving 
      ? this.config.movingIntervalMs 
      : this.config.idleIntervalMs;

    // Add random jitter to prevent synchronized bursts
    const jitter = Math.random() * this.config.jitterMs * 2 - this.config.jitterMs;
    const interval = Math.max(100, baseInterval + jitter);

    this.publishTimer = setTimeout(() => {
      this.publishLocation(update);
    }, interval);
  }

  /**
   * Publish location to Supabase (single latest record pattern)
   */
  private async publishLocation(update: LocationUpdate): Promise<void> {
    if (!this.isOnline) {
      this.bufferUpdate(update);
      return;
    }

    try {
      // Upsert to bus_locations (single latest record per bus)
      const { error } = await supabase
        .from('bus_locations')
        .upsert({
          bus_id: this.busId,
          driver_uid: this.driverUid,
          route_id: this.routeId,
          trip_id: this.tripId,
          lat: update.lat,
          lng: update.lng,
          speed: update.speed,
          heading: update.heading,
          timestamp: update.timestamp,
          is_snapshot: false
        }, {
          onConflict: 'bus_id',
          ignoreDuplicates: false
        });

      if (error) {
        console.error('❌ Failed to publish location:', error);
        this.bufferUpdate(update);
      } else {
        this.lastPublished = update;
        console.log(`✅ Location published: (${update.lat.toFixed(6)}, ${update.lng.toFixed(6)})`);
        
        // Also broadcast on realtime channel for instant updates
        const channel = supabase.channel(`bus_location_${this.busId}`);
        await channel.send({
          type: 'broadcast',
          event: 'location_update',
          payload: {
            busId: this.busId,
            lat: update.lat,
            lng: update.lng,
            speed: update.speed,
            heading: update.heading,
            timestamp: update.timestamp
          }
        });
      }
    } catch (error) {
      console.error('❌ Location publish error:', error);
      this.bufferUpdate(update);
    }
  }

  /**
   * Buffer updates when offline
   */
  private bufferUpdate(update: LocationUpdate): void {
    this.locationBuffer.push(update);
    
    // Keep only last 50 updates to prevent memory issues
    if (this.locationBuffer.length > 50) {
      this.locationBuffer = this.locationBuffer.slice(-50);
    }
  }

  /**
   * Flush buffered updates when back online
   */
  private async flushBuffer(): Promise<void> {
    if (this.locationBuffer.length === 0) return;

    console.log(`📤 Flushing ${this.locationBuffer.length} buffered updates...`);

    // Only send the most recent buffered update (single latest record pattern)
    const latestUpdate = this.locationBuffer[this.locationBuffer.length - 1];
    
    try {
      await this.publishLocation(latestUpdate);
      this.locationBuffer = [];
    } catch (error) {
      console.error('❌ Failed to flush buffer:', error);
    }
  }

  /**
   * Validate movement for anti-spoofing
   */
  private validateMovement(
    previous: LocationUpdate, 
    current: LocationUpdate
  ): { valid: boolean; reason?: string } {
    const timeDiff = new Date(current.timestamp).getTime() - new Date(previous.timestamp).getTime();
    const distance = this.calculateDistance(previous.lat, previous.lng, current.lat, current.lng);
    
    // Check for teleportation
    if (distance > this.config.maxJumpMeters && timeDiff < 1000) {
      return { 
        valid: false, 
        reason: `Impossible jump: ${distance.toFixed(0)}m in ${timeDiff}ms` 
      };
    }

    // Check for impossible speed
    const speedKmh = (distance / 1000) / (timeDiff / 3600000);
    if (speedKmh > this.config.maxSpeedKmh) {
      return { 
        valid: false, 
        reason: `Impossible speed: ${speedKmh.toFixed(0)} km/h` 
      };
    }

    return { valid: true };
  }

  /**
   * Calculate distance between two points (Haversine formula)
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
   * Handle location error
   */
  private handleLocationError(error: GeolocationPositionError): void {
    console.error(`❌ Location error: ${error.message}`);
    
    // Notify UI about error
    const channel = supabase.channel(`driver_${this.driverUid}_status`);
    channel.send({
      type: 'broadcast',
      event: 'location_error',
      payload: {
        code: error.code,
        message: error.message
      }
    });
  }

  /**
   * Handle online event
   */
  private handleOnline = (): void => {
    console.log('📶 Back online, flushing buffer...');
    this.isOnline = true;
    this.flushBuffer();
  };

  /**
   * Handle offline event
   */
  private handleOffline = (): void => {
    console.log('📵 Went offline, buffering updates...');
    this.isOnline = false;
  };
}

export default DriverLocationService;
