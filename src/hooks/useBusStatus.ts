/**
 * Safe Bus Status Hook
 * 
 * Provides real-time bus status updates from a SINGLE Firestore document.
 * This is ALLOWED under Spark plan safety rules because:
 * - It only listens to exactly 1 document (buses/{busId})
 * - It includes visibility guards to prevent wasted reads
 * - It respects the ENABLE_FIRESTORE_REALTIME kill switch
 * - It debounces rapid updates to coalesce callbacks
 * 
 * @module hooks/useBusStatus
 * @version 2.0.0
 * @since 2026-01-02
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { supabase } from '@/lib/supabase-client';
import { useVisibilityAwareListener } from '@/utils/useVisibilityAwareListener';
import {
  ENABLE_FIRESTORE_REALTIME,
  POLLING_INTERVAL_MS,
  UPDATE_DEBOUNCE_MS
} from '@/config/runtime';
import { getSigningOutState } from '@/lib/firestore-error-handler';

// ============================================================================
// TYPES
// ============================================================================

export interface BusStatus {
  /** Bus operational status */
  status: 'idle' | 'enroute' | 'active' | 'inactive';
  /** Current active driver ID if on trip */
  activeDriverId?: string;
  /** Current trip ID if on trip */
  activeTripId?: string;
  /** Timestamp when last trip started */
  lastStartedAt?: any;
  /** Timestamp when last trip ended */
  lastEndedAt?: any;
}

export interface UseBusStatusResult {
  busStatus: BusStatus | null;
  loading: boolean;
  error: string | null;
  /** Whether realtime mode is active */
  isRealtime: boolean;
  /** Manually refresh the status */
  refresh: () => Promise<void>;
}

// ============================================================================
// MAIN HOOK
// ============================================================================

/**
 * Hook to get real-time bus status from Firestore with safety guards.
 * 
 * SAFETY FEATURES:
 * - Only listens to exactly 1 document (bounded)
 * - Respects visibility state (pauses when tab hidden)
 * - Respects ENABLE_FIRESTORE_REALTIME kill switch
 * - Debounces rapid updates (<2s) to prevent flapping
 * - Falls back to polling if realtime is disabled
 * 
 * @param busId - The bus ID to track
 * @returns Object containing bus status, loading state, and error
 * 
 * @example
 * ```tsx
 * const { busStatus, loading, isRealtime } = useBusStatus(student.busId);
 * 
 * if (busStatus?.status === 'enroute') {
 *   // Bus is on the way!
 * }
 * ```
 */
export function useBusStatus(busId: string | null | undefined): UseBusStatusResult {
  const [busStatus, setBusStatus] = useState<BusStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Visibility-aware listener management
  const { shouldMountListener, isVisible, isOnline } = useVisibilityAwareListener();

  // Refs for debouncing
  const isMountedRef = useRef(true);
  const lastUpdateRef = useRef<number>(0);
  const pendingUpdateRef = useRef<BusStatus | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Determine if we should use realtime
  const useRealtime = ENABLE_FIRESTORE_REALTIME && shouldMountListener;

  // Debounced state update to coalesce rapid changes
  const applyUpdate = useCallback((newStatus: BusStatus | null) => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;

    if (timeSinceLastUpdate < UPDATE_DEBOUNCE_MS) {
      // Store pending update and schedule debounced apply
      pendingUpdateRef.current = newStatus;

      if (!debounceTimeoutRef.current) {
        debounceTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current && pendingUpdateRef.current !== null) {
            setBusStatus(pendingUpdateRef.current);
            lastUpdateRef.current = Date.now();
          }
          pendingUpdateRef.current = null;
          debounceTimeoutRef.current = null;
        }, UPDATE_DEBOUNCE_MS - timeSinceLastUpdate);
      }
    } else {
      // Apply immediately
      setBusStatus(newStatus);
      lastUpdateRef.current = now;
    }
  }, []);

  // Parse bus data from snapshot
  const parseBusData = useCallback((data: any): BusStatus => {
    return {
      status: data.status || 'idle',
      activeDriverId: data.activeDriverId,
      activeTripId: data.activeTripId,
      lastStartedAt: data.lastStartedAt,
      lastEndedAt: data.lastEndedAt,
    };
  }, []);

  // Fetch bus status once (for polling fallback)
  const fetchBusStatus = useCallback(async () => {
    if (!busId) {
      setBusStatus(null);
      setLoading(false);
      return;
    }

    try {
      const docRef = doc(db, 'buses', busId);
      const snapshot = await getDoc(docRef);

      if (!isMountedRef.current) return;

      if (snapshot.exists()) {
        applyUpdate(parseBusData(snapshot.data()));
        setError(null);
      } else {
        applyUpdate(null);
        setError('Bus not found');
      }
    } catch (err: any) {
      console.error('[useBusStatus] Error fetching bus status:', err);
      if (isMountedRef.current) {
        setError(err.message || 'Failed to fetch bus status');
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [busId, applyUpdate, parseBusData]);

  // Main effect for listener/polling
  useEffect(() => {
    isMountedRef.current = true;

    if (!busId) {
      setBusStatus(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // If realtime is enabled and conditions are met
    if (useRealtime) {
      const unsubscribe = onSnapshot(
        doc(db, 'buses', busId),
        (docSnapshot) => {
          if (!isMountedRef.current) return;

          if (docSnapshot.exists()) {
            applyUpdate(parseBusData(docSnapshot.data()));
            setError(null);
          } else {
            applyUpdate(null);
            setError('Bus not found');
          }
          setLoading(false);
        },
        (err) => {
          // Suppress errors during sign-out
          if (getSigningOutState()) return;

          console.error('[useBusStatus] Listener error:', err);
          if (isMountedRef.current) {
            setError(err.message);
            setLoading(false);
          }
        }
      );

      return () => {
        unsubscribe();
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }
      };
    } else {
      // Fallback to polling
      fetchBusStatus();

      const pollIntervalId = setInterval(() => {
        if (isVisible && isOnline && isMountedRef.current) {
          fetchBusStatus();
        }
      }, POLLING_INTERVAL_MS);

      return () => {
        clearInterval(pollIntervalId);
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }
      };
    }
  }, [busId, useRealtime, fetchBusStatus, applyUpdate, parseBusData, isVisible, isOnline]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  return {
    busStatus,
    loading,
    error,
    isRealtime: useRealtime,
    refresh: fetchBusStatus,
  };
}

// ============================================================================
// HELPER FUNCTIONS (unchanged)
// ============================================================================

/**
 * Hook to get real-time driver status from Supabase
 * @param busId - The bus ID to track
 * @returns Object containing driver status and loading state
 */
export function useDriverStatus(busId: string | null | undefined) {
  const [driverStatus, setDriverStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!busId) {
      setDriverStatus(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    // Initial fetch
    const fetchDriverStatus = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('driver_status')
          .select('*')
          .eq('bus_id', busId)
          .maybeSingle();

        if (fetchError) {
          console.error('[useDriverStatus] Fetch error:', fetchError);
          if (isMounted) setError(fetchError.message);
        } else if (isMounted) {
          setDriverStatus(data);
          setError(null);
        }
      } catch (err: any) {
        console.error('[useDriverStatus] Error:', err);
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchDriverStatus();

    // Set up real-time subscription
    const channel = supabase
      .channel(`driver_status_${busId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_status',
          filter: `bus_id=eq.${busId}`
        },
        (payload) => {
          console.log('[useDriverStatus] Real-time update:', payload);
          if (isMounted) {
            if (payload.eventType === 'DELETE') {
              setDriverStatus(null);
            } else {
              setDriverStatus(payload.new);
            }
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [busId]);

  return { driverStatus, loading, error };
}

/**
 * Determine if a bus is currently on an active trip
 * NOTE: Only checks Supabase driver_status. The Firestore buses collection's
 * status field is for bus condition (maintenance, active, etc.) - NOT trip status.
 * @param busStatus - Bus status from Firestore (kept for backward compatibility but not used for trip detection)
 * @param driverStatus - Driver status from Supabase (authoritative source for trip status)
 * @returns boolean indicating if trip is active
 */
export function isTripActive(busStatus: BusStatus | null, driverStatus: any): boolean {
  // Trip status is ONLY tracked in Supabase driver_status table
  // The Firestore buses.status field is for bus condition (maintenance, active, etc.)
  if (driverStatus?.status === 'on_trip' || driverStatus?.status === 'enroute') {
    return true;
  }
  return false;
}

/**
 * Get normalized bus status for display
 * @param busStatus - Bus status from Firestore
 * @param driverStatus - Driver status from Supabase
 * @returns Normalized status object
 */
export function getNormalizedBusStatus(busStatus: BusStatus | null, driverStatus: any): {
  label: string;
  variant: 'default' | 'secondary' | 'success';
  isActive: boolean;
} {
  const isActive = isTripActive(busStatus, driverStatus);

  if (isActive) {
    return {
      label: 'EnRoute',
      variant: 'success',
      isActive: true
    };
  }

  return {
    label: 'Idle',
    variant: 'secondary',
    isActive: false
  };
}
