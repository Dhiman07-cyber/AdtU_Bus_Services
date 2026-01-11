/**
 * Map Interpolation Service - Production Optimized
 * 
 * Provides smooth marker animations with:
 * - 60 FPS interpolation
 * - Teleport detection
 * - Confidence-based easing
 * - Memory-efficient buffering
 */

interface Position {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  timestamp: string;
  confidence?: 'high' | 'medium' | 'low';
}

interface InterpolationConfig {
  fps: number;                      // Default: 60
  easingFactor: number;             // Default: 0.15
  teleportThreshold: number;        // Default: 100 meters
  maxBufferSize: number;            // Default: 10
  enableRotation: boolean;          // Default: true
  enableSpeedBasedEasing: boolean;  // Default: true
  confidenceFactors: {
    high: number;    // Default: 1.0
    medium: number;  // Default: 0.7
    low: number;     // Default: 0.3
  };
}

export class MapInterpolationService {
  private currentPosition: Position | null = null;
  private targetPosition: Position | null = null;
  private positionBuffer: Position[] = [];
  private animationFrame: number | null = null;
  private lastUpdateTime: number = 0;
  private config: InterpolationConfig;
  private onPositionUpdate: (position: Position) => void;
  private isPaused: boolean = false;

  constructor(
    onPositionUpdate: (position: Position) => void,
    config?: Partial<InterpolationConfig>
  ) {
    this.onPositionUpdate = onPositionUpdate;
    this.config = {
      fps: 60,
      easingFactor: 0.15,
      teleportThreshold: 100,
      maxBufferSize: 10,
      enableRotation: true,
      enableSpeedBasedEasing: true,
      confidenceFactors: {
        high: 1.0,
        medium: 0.7,
        low: 0.3
      },
      ...config
    };
  }

  /**
   * Add a new position update
   */
  public updatePosition(position: Position): void {
    // Add to buffer
    this.positionBuffer.push(position);

    // Limit buffer size
    if (this.positionBuffer.length > this.config.maxBufferSize) {
      this.positionBuffer.shift();
    }

    // Set as target if not interpolating
    if (!this.animationFrame) {
      this.targetPosition = position;
      
      // Initialize current position if first update
      if (!this.currentPosition) {
        this.currentPosition = { ...position };
        this.onPositionUpdate(this.currentPosition);
      }

      // Start interpolation
      this.startInterpolation();
    } else {
      // Update target while interpolating
      this.targetPosition = position;
    }
  }

  /**
   * Start interpolation loop
   */
  private startInterpolation(): void {
    if (this.animationFrame || this.isPaused) return;

    const frameInterval = 1000 / this.config.fps;
    let lastFrameTime = performance.now();

    const animate = (currentTime: number) => {
      if (this.isPaused) {
        this.animationFrame = null;
        return;
      }

      // Limit frame rate
      const deltaTime = currentTime - lastFrameTime;
      if (deltaTime < frameInterval) {
        this.animationFrame = requestAnimationFrame(animate);
        return;
      }

      lastFrameTime = currentTime - (deltaTime % frameInterval);

      // Perform interpolation
      if (this.currentPosition && this.targetPosition) {
        const interpolated = this.interpolate(
          this.currentPosition,
          this.targetPosition,
          deltaTime / 1000 // Convert to seconds
        );

        if (interpolated) {
          this.currentPosition = interpolated;
          this.onPositionUpdate(this.currentPosition);

          // Check if reached target
          const distance = this.calculateDistance(
            this.currentPosition.lat,
            this.currentPosition.lng,
            this.targetPosition.lat,
            this.targetPosition.lng
          );

          if (distance < 0.5) {
            // Close enough, snap to target
            this.currentPosition = { ...this.targetPosition };
            this.onPositionUpdate(this.currentPosition);
            
            // Check for next position in buffer
            if (this.positionBuffer.length > 1) {
              this.targetPosition = this.positionBuffer[this.positionBuffer.length - 1];
              this.animationFrame = requestAnimationFrame(animate);
            } else {
              this.animationFrame = null;
            }
          } else {
            // Continue interpolation
            this.animationFrame = requestAnimationFrame(animate);
          }
        } else {
          this.animationFrame = null;
        }
      } else {
        this.animationFrame = null;
      }
    };

    this.animationFrame = requestAnimationFrame(animate);
  }

  /**
   * Interpolate between positions
   */
  private interpolate(
    current: Position,
    target: Position,
    deltaTime: number
  ): Position | null {
    // Calculate distance
    const distance = this.calculateDistance(
      current.lat,
      current.lng,
      target.lat,
      target.lng
    );

    // Check for teleportation
    if (distance > this.config.teleportThreshold) {
      console.log(`⚡ Teleport detected (${distance.toFixed(0)}m), jumping to target`);
      return { ...target };
    }

    // Calculate easing factor based on confidence
    let easingFactor = this.config.easingFactor;
    
    if (target.confidence) {
      easingFactor *= this.config.confidenceFactors[target.confidence];
    }

    // Adjust easing based on speed if enabled
    if (this.config.enableSpeedBasedEasing && target.speed !== undefined) {
      const speedFactor = Math.min(1, target.speed / 10); // Normalize to 0-1
      easingFactor = easingFactor * (0.5 + speedFactor * 0.5); // Scale 50%-100%
    }

    // Apply time-based easing
    const timeFactor = Math.min(1, deltaTime * 10); // Cap at 1
    easingFactor *= timeFactor;

    // Interpolate position
    const newLat = current.lat + (target.lat - current.lat) * easingFactor;
    const newLng = current.lng + (target.lng - current.lng) * easingFactor;

    // Interpolate heading if available
    let newHeading = current.heading;
    if (this.config.enableRotation && 
        current.heading !== undefined && 
        target.heading !== undefined) {
      newHeading = this.interpolateAngle(
        current.heading,
        target.heading,
        easingFactor
      );
    }

    return {
      lat: newLat,
      lng: newLng,
      heading: newHeading,
      speed: target.speed,
      timestamp: target.timestamp,
      confidence: target.confidence
    };
  }

  /**
   * Calculate bearing between two points
   */
  public calculateBearing(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;

    const y = Math.sin(dLng) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  /**
   * Smooth path through multiple points (Catmull-Rom spline)
   */
  public smoothPath(points: Position[], resolution: number = 10): Position[] {
    if (points.length < 2) return points;
    if (points.length === 2) {
      // Linear interpolation for 2 points
      return this.linearInterpolate(points[0], points[1], resolution);
    }

    const smoothed: Position[] = [];

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      for (let t = 0; t < resolution; t++) {
        const tNorm = t / resolution;
        const interpolated = this.catmullRomInterpolate(
          p0, p1, p2, p3, tNorm
        );
        smoothed.push(interpolated);
      }
    }

    // Add last point
    smoothed.push(points[points.length - 1]);

    return smoothed;
  }

  /**
   * Catmull-Rom spline interpolation
   */
  private catmullRomInterpolate(
    p0: Position,
    p1: Position,
    p2: Position,
    p3: Position,
    t: number
  ): Position {
    const t2 = t * t;
    const t3 = t2 * t;

    const lat = 0.5 * (
      2 * p1.lat +
      (-p0.lat + p2.lat) * t +
      (2 * p0.lat - 5 * p1.lat + 4 * p2.lat - p3.lat) * t2 +
      (-p0.lat + 3 * p1.lat - 3 * p2.lat + p3.lat) * t3
    );

    const lng = 0.5 * (
      2 * p1.lng +
      (-p0.lng + p2.lng) * t +
      (2 * p0.lng - 5 * p1.lng + 4 * p2.lng - p3.lng) * t2 +
      (-p0.lng + 3 * p1.lng - 3 * p2.lng + p3.lng) * t3
    );

    return {
      lat,
      lng,
      timestamp: p1.timestamp,
      confidence: p1.confidence
    };
  }

  /**
   * Linear interpolation between two points
   */
  private linearInterpolate(
    p1: Position,
    p2: Position,
    steps: number
  ): Position[] {
    const result: Position[] = [];
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      result.push({
        lat: p1.lat + (p2.lat - p1.lat) * t,
        lng: p1.lng + (p2.lng - p1.lng) * t,
        heading: p1.heading !== undefined && p2.heading !== undefined
          ? this.interpolateAngle(p1.heading, p2.heading, t)
          : undefined,
        timestamp: p1.timestamp,
        confidence: p1.confidence
      });
    }

    return result;
  }

  /**
   * Calculate distance between two points (Haversine)
   */
  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
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
   * Interpolate angle with wrap-around handling
   */
  private interpolateAngle(
    current: number,
    target: number,
    factor: number
  ): number {
    let delta = target - current;
    
    // Handle wrap-around
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    
    return (current + delta * factor + 360) % 360;
  }

  /**
   * Pause interpolation
   */
  public pause(): void {
    this.isPaused = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Resume interpolation
   */
  public resume(): void {
    this.isPaused = false;
    if (this.targetPosition && this.currentPosition) {
      this.startInterpolation();
    }
  }

  /**
   * Get current interpolated position
   */
  public getCurrentPosition(): Position | null {
    return this.currentPosition;
  }

  /**
   * Get position buffer
   */
  public getBuffer(): Position[] {
    return [...this.positionBuffer];
  }

  /**
   * Clear buffer and reset
   */
  public reset(): void {
    this.currentPosition = null;
    this.targetPosition = null;
    this.positionBuffer = [];
    
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Destroy service
   */
  public destroy(): void {
    this.pause();
    this.reset();
  }
}

export default MapInterpolationService;
