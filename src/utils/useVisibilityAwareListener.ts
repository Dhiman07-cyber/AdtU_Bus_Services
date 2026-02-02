/**
 * Visibility-Aware Listener Utility
 * 
 * Provides utilities for managing Firestore listeners based on:
 * - Page visibility state
 * - Network connectivity
 * - Runtime configuration flags
 * 
 * This prevents wasted reads when users tab away or lose connection.
 * 
 * @module utils/useVisibilityAwareListener
 * @version 1.0.0
 * @since 2026-01-02
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    ENABLE_FIRESTORE_REALTIME,
    VISIBILITY_DEBOUNCE_MS,
    isRealtimeEnabledSync
} from '@/config/runtime';

// ============================================================================
// TYPES
// ============================================================================

export interface VisibilityState {
    isVisible: boolean;
    isOnline: boolean;
    shouldMountListener: boolean;
    realtimeEnabled: boolean;
}

export interface UseVisibilityAwareListenerOptions {
    /** Custom debounce time for visibility changes (default: 3000ms) */
    debounceMs?: number;
    /** Callback when visibility state changes */
    onVisibilityChange?: (visible: boolean) => void;
}

// ============================================================================
// SINGLETON STATE MANAGER
// ============================================================================

let globalVisibilityState = {
    isVisible: typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
};

const visibilityListeners: Set<(state: typeof globalVisibilityState) => void> = new Set();

// Initialize global listeners once
if (typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        globalVisibilityState = {
            ...globalVisibilityState,
            isVisible: document.visibilityState === 'visible',
        };
        visibilityListeners.forEach(cb => cb(globalVisibilityState));
    });

    window.addEventListener('online', () => {
        globalVisibilityState = {
            ...globalVisibilityState,
            isOnline: true,
        };
        visibilityListeners.forEach(cb => cb(globalVisibilityState));
    });

    window.addEventListener('offline', () => {
        globalVisibilityState = {
            ...globalVisibilityState,
            isOnline: false,
        };
        visibilityListeners.forEach(cb => cb(globalVisibilityState));
    });
}

// ============================================================================
// HOOK: useVisibilityAwareListener
// ============================================================================

/**
 * Hook that determines whether a Firestore listener should be mounted.
 * 
 * Returns `shouldMountListener: true` only when ALL of:
 * - Page is visible (document.visibilityState === 'visible')
 * - User is online (navigator.onLine === true)
 * - ENABLE_FIRESTORE_REALTIME env flag is true
 * 
 * Includes debouncing to prevent flapping on rapid visibility changes.
 * 
 * @example
 * ```tsx
 * const { shouldMountListener } = useVisibilityAwareListener();
 * 
 * useEffect(() => {
 *   if (!shouldMountListener) return;
 *   const unsubscribe = onSnapshot(docRef, callback);
 *   return () => unsubscribe();
 * }, [shouldMountListener]);
 * ```
 */
export function useVisibilityAwareListener(
    options: UseVisibilityAwareListenerOptions = {}
): VisibilityState {
    const {
        debounceMs = VISIBILITY_DEBOUNCE_MS,
        onVisibilityChange,
    } = options;

    const [state, setState] = useState<VisibilityState>(() => ({
        isVisible: globalVisibilityState.isVisible,
        isOnline: globalVisibilityState.isOnline,
        shouldMountListener: false, // Start false, compute after mount
        realtimeEnabled: isRealtimeEnabledSync(),
    }));

    const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastVisibleRef = useRef(globalVisibilityState.isVisible);

    // Initial check on mount to set correct state
    useEffect(() => {
        setState(prev => ({
            ...prev,
            shouldMountListener: prev.isVisible && prev.isOnline && prev.realtimeEnabled
        }));
    }, []);

    // Subscribe to global visibility changes
    useEffect(() => {
        const handleStateChange = (newGlobalState: typeof globalVisibilityState) => {
            // Clear any pending debounce
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }

            // If becoming visible, debounce to prevent flapping
            if (newGlobalState.isVisible && !lastVisibleRef.current) {
                debounceTimeoutRef.current = setTimeout(() => {
                    lastVisibleRef.current = true;
                    setState(prev => {
                        const shouldMount = newGlobalState.isVisible && newGlobalState.isOnline && prev.realtimeEnabled;
                        if (onVisibilityChange && prev.isVisible !== newGlobalState.isVisible) {
                            onVisibilityChange(newGlobalState.isVisible);
                        }
                        return {
                            ...prev,
                            isVisible: newGlobalState.isVisible,
                            isOnline: newGlobalState.isOnline,
                            shouldMountListener: shouldMount,
                        };
                    });
                }, debounceMs);
            } else {
                // Immediate update when going hidden/offline
                lastVisibleRef.current = newGlobalState.isVisible;
                setState(prev => {
                    const shouldMount = newGlobalState.isVisible && newGlobalState.isOnline && prev.realtimeEnabled;
                    if (onVisibilityChange && prev.isVisible !== newGlobalState.isVisible) {
                        onVisibilityChange(newGlobalState.isVisible);
                    }
                    return {
                        ...prev,
                        isVisible: newGlobalState.isVisible,
                        isOnline: newGlobalState.isOnline,
                        shouldMountListener: shouldMount,
                    };
                });
            }
        };

        visibilityListeners.add(handleStateChange);

        // Initial computation
        setState(prev => ({
            ...prev,
            shouldMountListener: globalVisibilityState.isVisible && globalVisibilityState.isOnline && prev.realtimeEnabled,
        }));

        return () => {
            visibilityListeners.delete(handleStateChange);
            if (debounceTimeoutRef.current) {
                clearTimeout(debounceTimeoutRef.current);
            }
        };
    }, [debounceMs, onVisibilityChange]);

    return state;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Synchronous check if listener should be mounted.
 * Use this for quick checks outside of React hooks.
 */
export function shouldMountListenerSync(): boolean {
    if (typeof document === 'undefined') return false;
    return (
        document.visibilityState === 'visible' &&
        navigator.onLine &&
        isRealtimeEnabledSync()
    );
}

/**
 * Creates a debounced callback for handling rapid updates.
 * Useful for coalescing multiple Firestore document updates.
 */
export function createDebouncedCallback<T extends (...args: any[]) => void>(
    callback: T,
    delayMs: number
): T {
    let timeoutId: NodeJS.Timeout | null = null;
    let lastArgs: Parameters<T> | null = null;

    const debouncedFn = ((...args: Parameters<T>) => {
        lastArgs = args;

        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
            if (lastArgs) {
                callback(...lastArgs);
            }
            timeoutId = null;
            lastArgs = null;
        }, delayMs);
    }) as T;

    return debouncedFn;
}

/**
 * Cleanup function for debounced callbacks.
 * Call this in useEffect cleanup.
 */
export function createCancellableDebounce<T extends (...args: any[]) => void>(
    callback: T,
    delayMs: number
): { fn: T; cancel: () => void } {
    let timeoutId: NodeJS.Timeout | null = null;

    const fn = ((...args: Parameters<T>) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            callback(...args);
            timeoutId = null;
        }, delayMs);
    }) as T;

    const cancel = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    return { fn, cancel };
}

export default useVisibilityAwareListener;
