/**
 * Safe Real-time Document Hook
 * 
 * Provides real-time updates for a SINGLE Firestore document.
 * This is ALLOWED under Spark plan safety rules because:
 * - It only listens to exactly 1 document
 * - It includes visibility guards to prevent wasted reads
 * - It respects the ENABLE_FIRESTORE_REALTIME kill switch
 * 
 * @module hooks/useRealtimeDocument
 * @version 2.0.0
 * @since 2026-01-02
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { doc, onSnapshot, getDoc, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useVisibilityAwareListener } from '@/utils/useVisibilityAwareListener';
import {
  ENABLE_FIRESTORE_REALTIME,
  POLLING_INTERVAL_MS,
  UPDATE_DEBOUNCE_MS
} from '@/config/runtime';

// ============================================================================
// TYPES
// ============================================================================

export interface UseRealtimeDocumentOptions {
  /** Collection name in Firestore */
  collectionName: string;
  /** Document ID to listen to */
  documentId: string | null;
  /** Whether to enable the listener (default: true) */
  enabled?: boolean;
  /** Fallback polling interval when realtime is disabled (default: 120000ms) */
  pollingInterval?: number;
  /** Force realtime mode even when global flag is off (use sparingly) */
  forceRealtime?: boolean;
}

export interface UseRealtimeDocumentResult<T> {
  /** The document data, or null if not found/loading */
  data: T | null;
  /** Whether the initial load is in progress */
  loading: boolean;
  /** Error from the last operation */
  error: Error | null;
  /** Manually refresh the document */
  refresh: () => Promise<void>;
  /** Whether realtime mode is active */
  isRealtime: boolean;
}

// ============================================================================
// MAIN HOOK
// ============================================================================

/**
 * Hook for real-time single document listening with safety guards.
 * 
 * SAFETY FEATURES:
 * - Only listens to exactly 1 document (bounded)
 * - Respects visibility state (pauses when tab hidden)
 * - Respects ENABLE_FIRESTORE_REALTIME kill switch
 * - Falls back to polling if realtime is disabled
 * - Debounces rapid updates to prevent excessive re-renders
 * 
 * @example
 * ```tsx
 * const { data: student, loading } = useRealtimeDocument<Student>({
 *   collectionName: 'students',
 *   documentId: userId,
 *   enabled: !!userId
 * });
 * ```
 */
export function useRealtimeDocument<T = DocumentData>(
  options: UseRealtimeDocumentOptions
): UseRealtimeDocumentResult<T> {
  const {
    collectionName,
    documentId,
    enabled = true,
    pollingInterval = POLLING_INTERVAL_MS,
    forceRealtime = false,
  } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Visibility-aware listener management
  const { shouldMountListener, isVisible, isOnline } = useVisibilityAwareListener();

  // Refs for debouncing and cleanup
  const isMountedRef = useRef(true);
  const lastUpdateRef = useRef<number>(0);
  const pendingUpdateRef = useRef<T | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Determine if we should use realtime
  const useRealtime = (ENABLE_FIRESTORE_REALTIME || forceRealtime) && shouldMountListener;

  // Debounced state update
  const applyUpdate = useCallback((newData: T | null) => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;

    if (timeSinceLastUpdate < UPDATE_DEBOUNCE_MS) {
      // Store pending update and schedule debounced apply
      pendingUpdateRef.current = newData;

      if (!debounceTimeoutRef.current) {
        debounceTimeoutRef.current = setTimeout(() => {
          if (isMountedRef.current && pendingUpdateRef.current !== null) {
            setData(pendingUpdateRef.current);
            lastUpdateRef.current = Date.now();
          }
          pendingUpdateRef.current = null;
          debounceTimeoutRef.current = null;
        }, UPDATE_DEBOUNCE_MS - timeSinceLastUpdate);
      }
    } else {
      // Apply immediately
      setData(newData);
      lastUpdateRef.current = now;
    }
  }, []);

  // Fetch document once (for polling fallback)
  const fetchDocument = useCallback(async () => {
    if (!documentId || !enabled) {
      setLoading(false);
      return;
    }

    try {
      const docRef = doc(db, collectionName, documentId);
      const snapshot = await getDoc(docRef);

      if (!isMountedRef.current) return;

      if (snapshot.exists()) {
        applyUpdate({
          id: snapshot.id,
          ...snapshot.data()
        } as T);
      } else {
        applyUpdate(null);
      }
      setError(null);
    } catch (err) {
      console.error(`[useRealtimeDocument] Error fetching ${collectionName}/${documentId}:`, err);
      if (isMountedRef.current) {
        setError(err as Error);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [documentId, enabled, collectionName, applyUpdate]);

  // Realtime listener effect
  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled || !documentId) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // If realtime is enabled and we should mount
    if (useRealtime) {
      const docRef = doc(db, collectionName, documentId);

      const unsubscribe = onSnapshot(
        docRef,
        (snapshot) => {
          if (!isMountedRef.current) return;

          if (snapshot.exists()) {
            applyUpdate({
              id: snapshot.id,
              ...snapshot.data()
            } as T);
          } else {
            applyUpdate(null);
          }
          setLoading(false);
          setError(null);
        },
        (err) => {
          console.error(`[useRealtimeDocument] Listener error for ${collectionName}/${documentId}:`, err);
          if (isMountedRef.current) {
            setError(err as Error);
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
      fetchDocument();

      // Only poll if visible and online
      const pollIntervalId = setInterval(() => {
        if (isVisible && isOnline && isMountedRef.current) {
          fetchDocument();
        }
      }, pollingInterval);

      return () => {
        clearInterval(pollIntervalId);
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }
      };
    }
  }, [collectionName, documentId, enabled, useRealtime, fetchDocument, applyUpdate, isVisible, isOnline, pollingInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // Manual refresh function
  const refresh = useCallback(async () => {
    await fetchDocument();
  }, [fetchDocument]);

  return {
    data,
    loading,
    error,
    refresh,
    isRealtime: useRealtime,
  };
}

export default useRealtimeDocument;
