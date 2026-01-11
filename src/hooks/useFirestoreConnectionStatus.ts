/**
 * Hook to monitor connection status
 * SPARK PLAN SAFETY: Disabled Firestore health checks to prevent quota exhaustion
 * Uses simple navigator.onLine detection instead
 */

import { useState, useEffect, useCallback } from 'react';

export interface ConnectionStatus {
  isConnected: boolean;
  isHealthy: boolean;
  lastError: Error | null;
  errorCount: number;
  lastSuccessfulConnection: number | null;
  retryCount: number;
}

/**
 * SPARK PLAN SAFETY: Health checks DISABLED to prevent quota exhaustion
 * The original implementation was querying Firestore every 30 seconds
 * which caused 1-2K reads per minute across all logged-in users.
 * 
 * This version just uses navigator.onLine for basic connectivity detection.
 */
export function useFirestoreConnectionStatus(
  checkInterval: number = 30000,
  healthCheckCollection: string = 'notifications'
) {
  const [status, setStatus] = useState<ConnectionStatus>({
    isConnected: true,
    isHealthy: true,
    lastError: null,
    errorCount: 0,
    lastSuccessfulConnection: Date.now(),
    retryCount: 0
  });

  // Use simple online/offline detection instead of Firestore queries
  useEffect(() => {
    const handleOnline = () => {
      setStatus(prev => ({
        ...prev,
        isConnected: true,
        isHealthy: true,
        lastSuccessfulConnection: Date.now()
      }));
    };

    const handleOffline = () => {
      setStatus(prev => ({
        ...prev,
        isConnected: false,
        isHealthy: false
      }));
    };

    // Set initial state based on navigator.onLine
    if (typeof navigator !== 'undefined') {
      setStatus(prev => ({
        ...prev,
        isConnected: navigator.onLine,
        isHealthy: navigator.onLine
      }));
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, []);

  // Manual check function (no-op for safety)
  const checkConnection = useCallback(() => {
    // No-op: We don't want to trigger Firestore reads
    console.log('[ConnectionStatus] Health check disabled for Spark plan safety');
  }, []);

  return {
    ...status,
    isChecking: false,
    checkConnection
  };
}

/**
 * Hook for connection status with UI-friendly messages
 */
export function useConnectionStatusMessages() {
  const connectionStatus = useFirestoreConnectionStatus();

  const getStatusMessage = () => {
    if (connectionStatus.isConnected && connectionStatus.isHealthy) {
      return 'Connected';
    }
    return 'Offline';
  };

  const getStatusColor = () => {
    if (connectionStatus.isConnected && connectionStatus.isHealthy) {
      return 'green';
    }
    return 'red';
  };

  const shouldShowWarning = () => {
    return !connectionStatus.isConnected;
  };

  return {
    ...connectionStatus,
    statusMessage: getStatusMessage(),
    statusColor: getStatusColor(),
    shouldShowWarning: shouldShowWarning()
  };
}

