/**
 * Marker Animation Utility
 * Provides smooth interpolation for map markers
 */

export interface Position {
  lat: number;
  lng: number;
}

export interface AnimationOptions {
  duration: number; // milliseconds
  onUpdate: (position: Position) => void;
  onComplete?: () => void;
  easing?: (t: number) => number;
}

/**
 * Linear easing function
 */
const linearEasing = (t: number): number => t;

/**
 * Ease-out cubic easing
 */
const easeOutCubic = (t: number): number => {
  return 1 - Math.pow(1 - t, 3);
};

/**
 * Animate marker from one position to another with smooth interpolation
 */
export class MarkerAnimator {
  private animationFrameId: number | null = null;
  private startTime: number | null = null;

  /**
   * Animate marker movement
   */
  animate(
    from: Position,
    to: Position,
    options: AnimationOptions
  ): void {
    // Cancel any existing animation
    this.cancel();

    const { duration, onUpdate, onComplete, easing = easeOutCubic } = options;
    this.startTime = performance.now();

    const animate = (currentTime: number) => {
      if (!this.startTime) return;

      const elapsed = currentTime - this.startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easing(progress);

      // Interpolate position
      const lat = from.lat + (to.lat - from.lat) * easedProgress;
      const lng = from.lng + (to.lng - from.lng) * easedProgress;

      onUpdate({ lat, lng });

      if (progress < 1) {
        this.animationFrameId = requestAnimationFrame(animate);
      } else {
        this.animationFrameId = null;
        this.startTime = null;
        if (onComplete) onComplete();
      }
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  /**
   * Cancel ongoing animation
   */
  cancel(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
      this.startTime = null;
    }
  }

  /**
   * Check if animation is in progress
   */
  isAnimating(): boolean {
    return this.animationFrameId !== null;
  }
}

/**
 * Interpolate heading/rotation smoothly
 */
export function interpolateHeading(from: number, to: number, progress: number): number {
  // Handle wrap-around (e.g., 350° to 10°)
  let diff = to - from;
  
  if (diff > 180) {
    diff -= 360;
  } else if (diff < -180) {
    diff += 360;
  }
  
  let result = from + diff * progress;
  
  // Normalize to 0-360
  while (result < 0) result += 360;
  while (result >= 360) result -= 360;
  
  return result;
}

/**
 * Create a throttled function that limits how often a function can be called
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  let lastResult: ReturnType<T>;

  return function(this: any, ...args: Parameters<T>): void {
    if (!inThrottle) {
      inThrottle = true;
      lastResult = func.apply(this, args);
      
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Debounce function to limit rapid calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function(this: any, ...args: Parameters<T>): void {
    const later = () => {
      timeout = null;
      func.apply(this, args);
    };

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}



