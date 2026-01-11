/**
 * Connection Status Indicator Component
 * Shows Firestore connection health in the UI
 */

import React from 'react';
import { useConnectionStatusMessages } from '@/hooks/useFirestoreConnectionStatus';
import { Wifi, WifiOff, AlertTriangle, Loader2 } from 'lucide-react';

interface ConnectionStatusIndicatorProps {
  showDetails?: boolean;
  className?: string;
}

export function ConnectionStatusIndicator({ 
  showDetails = false, 
  className = '' 
}: ConnectionStatusIndicatorProps) {
  const {
    isConnected,
    isHealthy,
    statusMessage,
    statusColor,
    shouldShowWarning,
    errorCount,
    retryCount,
    checkConnection,
    isChecking
  } = useConnectionStatusMessages();

  const getStatusIcon = () => {
    if (isChecking) {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    }
    
    if (isConnected && isHealthy) {
      return <Wifi className="h-4 w-4" />;
    }
    
    if (shouldShowWarning) {
      return <AlertTriangle className="h-4 w-4" />;
    }
    
    return <WifiOff className="h-4 w-4" />;
  };

  const getStatusColorClasses = () => {
    switch (statusColor) {
      case 'green':
        return 'text-green-600 dark:text-green-400';
      case 'yellow':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'red':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  if (!shouldShowWarning && !showDetails) {
    return null; // Don't show anything if connection is healthy and details aren't requested
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`flex items-center gap-1 ${getStatusColorClasses()}`}>
        {getStatusIcon()}
        <span className="text-sm font-medium">{statusMessage}</span>
      </div>
      
      {showDetails && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {errorCount > 0 && `Errors: ${errorCount}`}
          {retryCount > 0 && ` | Retries: ${retryCount}`}
        </div>
      )}
      
      {shouldShowWarning && (
        <button
          onClick={checkConnection}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          disabled={isChecking}
        >
          {isChecking ? 'Checking...' : 'Retry'}
        </button>
      )}
    </div>
  );
}

/**
 * Compact version for headers/navbars
 */
export function CompactConnectionStatus() {
  return (
    <ConnectionStatusIndicator 
      showDetails={false}
      className="text-xs"
    />
  );
}

/**
 * Detailed version for settings/debug pages
 */
export function DetailedConnectionStatus() {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
        Connection Status
      </h3>
      <ConnectionStatusIndicator 
        showDetails={true}
        className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
      />
    </div>
  );
}
