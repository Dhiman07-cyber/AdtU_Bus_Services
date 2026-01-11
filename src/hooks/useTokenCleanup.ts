/**
 * useTokenCleanup Hook
 * 
 * Automatically handles cleanup of expired tokens and related documents
 * 
 * Features:
 * - Auto-cleanup after 45 seconds
 * - Cleanup on card close
 * - Cleanup on component unmount
 * - Manual cleanup trigger
 */

import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';

interface UseTokenCleanupOptions {
  tokenId: string | null;
  expiryMs?: number;           // Default: 45000 (45 seconds)
  autoCleanup?: boolean;        // Default: true
  onCleanupSuccess?: () => void;
  onCleanupError?: (error: Error) => void;
}

export function useTokenCleanup({
  tokenId,
  expiryMs = 45000,
  autoCleanup = true,
  onCleanupSuccess,
  onCleanupError
}: UseTokenCleanupOptions) {
  const { currentUser } = useAuth();
  const cleanupTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasCleanedUpRef = useRef<boolean>(false);

  /**
   * Execute cleanup via API
   */
  const executeCleanup = useCallback(async (
    reason: 'expired' | 'scanned' | 'cancelled' | 'closed'
  ) => {
    if (!tokenId || !currentUser || hasCleanedUpRef.current) {
      return;
    }

    console.log(`🧹 Executing token cleanup (reason: ${reason})...`);
    hasCleanedUpRef.current = true; // Prevent duplicate cleanup

    try {
      const idToken = await currentUser.getIdToken();

      const response = await fetch('/api/token/cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idToken,
          tokenId,
          reason
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Cleanup failed');
      }

      console.log('✅ Token cleanup successful:', data.stats);
      onCleanupSuccess?.();

    } catch (error: any) {
      console.error('❌ Token cleanup error:', error);
      onCleanupError?.(error);
      hasCleanedUpRef.current = false; // Allow retry on error
    }
  }, [tokenId, currentUser, onCleanupSuccess, onCleanupError]);

  /**
   * Schedule automatic cleanup after expiry
   */
  useEffect(() => {
    if (!tokenId || !autoCleanup) {
      return;
    }

    console.log(`⏰ Scheduling token cleanup in ${expiryMs}ms`);

    cleanupTimerRef.current = setTimeout(() => {
      executeCleanup('expired');
    }, expiryMs);

    return () => {
      if (cleanupTimerRef.current) {
        clearTimeout(cleanupTimerRef.current);
        cleanupTimerRef.current = null;
      }
    };
  }, [tokenId, expiryMs, autoCleanup, executeCleanup]);

  /**
   * Cleanup on component unmount (card closed)
   */
  useEffect(() => {
    return () => {
      if (tokenId && !hasCleanedUpRef.current) {
        console.log('🧹 Component unmounting, triggering cleanup...');
        executeCleanup('closed');
      }
    };
  }, [tokenId, executeCleanup]);

  /**
   * Manual cleanup trigger
   */
  const cleanupNow = useCallback((reason: 'cancelled' | 'scanned' | 'closed' = 'cancelled') => {
    // Clear any scheduled cleanup
    if (cleanupTimerRef.current) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }

    executeCleanup(reason);
  }, [executeCleanup]);

  /**
   * Cancel cleanup (e.g., token was successfully used)
   */
  const cancelCleanup = useCallback(() => {
    if (cleanupTimerRef.current) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
      console.log('⏸️ Token cleanup cancelled');
    }
  }, []);

  /**
   * Reset cleanup state
   */
  const resetCleanup = useCallback(() => {
    hasCleanedUpRef.current = false;
  }, []);

  return {
    cleanupNow,
    cancelCleanup,
    resetCleanup,
    hasCleanedUp: hasCleanedUpRef.current
  };
}

export default useTokenCleanup;
