/**
 * Hook for animating map markers
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { MarkerAnimator, Position, interpolateHeading } from '@/lib/marker-animation';

export function useMarkerAnimation(duration: number = 1000) {
  const [position, setPosition] = useState<Position | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const animator = useRef(new MarkerAnimator());
  const currentHeading = useRef<number | null>(null);

  const animateTo = useCallback((
    newPosition: Position,
    newHeading?: number | null,
    immediate: boolean = false
  ) => {
    if (!position || immediate) {
      // First position or immediate update
      setPosition(newPosition);
      if (newHeading !== undefined && newHeading !== null) {
        setHeading(newHeading);
        currentHeading.current = newHeading;
      }
      return;
    }

    // Animate position
    const startHeading = currentHeading.current;
    const startTime = performance.now();

    animator.current.animate(position, newPosition, {
      duration,
      onUpdate: (pos) => {
        setPosition(pos);
        
        // Also animate heading if provided
        if (newHeading !== undefined && newHeading !== null && startHeading !== null) {
          const elapsed = performance.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const interpolatedHeading = interpolateHeading(startHeading, newHeading, progress);
          setHeading(interpolatedHeading);
          currentHeading.current = interpolatedHeading;
        }
      },
      onComplete: () => {
        setPosition(newPosition);
        if (newHeading !== undefined && newHeading !== null) {
          setHeading(newHeading);
          currentHeading.current = newHeading;
        }
      },
    });
  }, [position, duration]);

  const cancel = useCallback(() => {
    animator.current.cancel();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      animator.current.cancel();
    };
  }, []);

  return {
    position,
    heading,
    animateTo,
    cancel,
    isAnimating: () => animator.current.isAnimating(),
  };
}



