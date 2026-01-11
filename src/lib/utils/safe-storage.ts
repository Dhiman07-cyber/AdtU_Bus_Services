/**
 * Safe localStorage wrapper for mobile compatibility
 * Handles quota exceeded, incognito mode, and other mobile storage issues
 */

interface StorageResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Check if localStorage is available and working
 */
export function isLocalStorageAvailable(): boolean {
  try {
    const test = '__storage_test__';
    window.localStorage.setItem(test, test);
    window.localStorage.removeItem(test);
    return true;
  } catch (e) {
    console.warn('⚠️ localStorage not available:', e);
    return false;
  }
}

/**
 * Safely set item to localStorage
 */
export function safeSetItem(key: string, value: string): StorageResult<void> {
  try {
    if (!isLocalStorageAvailable()) {
      return {
        success: false,
        error: 'localStorage not available'
      };
    }

    // Check size (mobile browsers have lower limits)
    const size = new Blob([value]).size;
    if (size > 4 * 1024 * 1024) { // 4MB limit
      console.warn(`⚠️ Data too large for localStorage: ${size} bytes`);
      return {
        success: false,
        error: 'Data too large'
      };
    }

    window.localStorage.setItem(key, value);
    return { success: true };
  } catch (e: any) {
    console.error('❌ localStorage.setItem error:', e);
    
    // Handle QuotaExceededError
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      // Try to clear old data and retry
      try {
        clearOldData();
        window.localStorage.setItem(key, value);
        return { success: true };
      } catch (retryError) {
        return {
          success: false,
          error: 'Storage quota exceeded'
        };
      }
    }
    
    return {
      success: false,
      error: e.message || 'Failed to save to localStorage'
    };
  }
}

/**
 * Safely get item from localStorage
 */
export function safeGetItem<T = string>(key: string): StorageResult<T> {
  try {
    if (!isLocalStorageAvailable()) {
      return {
        success: false,
        error: 'localStorage not available'
      };
    }

    const value = window.localStorage.getItem(key);
    if (value === null) {
      return {
        success: false,
        error: 'Item not found'
      };
    }

    return {
      success: true,
      data: value as T
    };
  } catch (e: any) {
    console.error('❌ localStorage.getItem error:', e);
    return {
      success: false,
      error: e.message || 'Failed to read from localStorage'
    };
  }
}

/**
 * Safely remove item from localStorage
 */
export function safeRemoveItem(key: string): StorageResult<void> {
  try {
    if (!isLocalStorageAvailable()) {
      return {
        success: false,
        error: 'localStorage not available'
      };
    }

    window.localStorage.removeItem(key);
    return { success: true };
  } catch (e: any) {
    console.error('❌ localStorage.removeItem error:', e);
    return {
      success: false,
      error: e.message || 'Failed to remove from localStorage'
    };
  }
}

/**
 * Clear old/unused data to free up space
 */
function clearOldData() {
  try {
    const keysToKeep = [
      'applicationDraft',
      'currentPaymentSession',
      'paymentSessions'
    ];

    const allKeys = Object.keys(window.localStorage);
    
    // Remove old payment receipts (older than 7 days)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    
    allKeys.forEach(key => {
      if (!keysToKeep.includes(key)) {
        // Check if it's an old payment receipt
        if (key.startsWith('payment_receipt_')) {
          try {
            const data = JSON.parse(window.localStorage.getItem(key) || '{}');
            if (data.timestamp && new Date(data.timestamp).getTime() < sevenDaysAgo) {
              window.localStorage.removeItem(key);
              console.log('🧹 Cleared old data:', key);
            }
          } catch {
            // If we can't parse it, remove it
            window.localStorage.removeItem(key);
          }
        }
      }
    });
  } catch (e) {
    console.error('❌ Error clearing old data:', e);
  }
}

/**
 * Safely set JSON object to localStorage
 */
export function safeSetJSON<T>(key: string, value: T): StorageResult<void> {
  try {
    const jsonString = JSON.stringify(value);
    return safeSetItem(key, jsonString);
  } catch (e: any) {
    console.error('❌ JSON stringify error:', e);
    return {
      success: false,
      error: e.message || 'Failed to stringify JSON'
    };
  }
}

/**
 * Safely get JSON object from localStorage
 */
export function safeGetJSON<T>(key: string): StorageResult<T> {
  const result = safeGetItem(key);
  
  if (!result.success || !result.data) {
    return {
      success: false,
      error: result.error
    };
  }

  try {
    const parsed = JSON.parse(result.data);
    return {
      success: true,
      data: parsed
    };
  } catch (e: any) {
    console.error('❌ JSON parse error:', e);
    return {
      success: false,
      error: e.message || 'Failed to parse JSON'
    };
  }
}

/**
 * Get localStorage usage info (for debugging)
 */
export function getStorageInfo(): {
  available: boolean;
  used: number;
  itemCount: number;
  items: Record<string, number>;
} {
  if (!isLocalStorageAvailable()) {
    return {
      available: false,
      used: 0,
      itemCount: 0,
      items: {}
    };
  }

  try {
    const items: Record<string, number> = {};
    let totalSize = 0;

    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key) {
        const value = window.localStorage.getItem(key) || '';
        const size = new Blob([value]).size;
        items[key] = size;
        totalSize += size;
      }
    }

    return {
      available: true,
      used: totalSize,
      itemCount: window.localStorage.length,
      items
    };
  } catch (e) {
    console.error('❌ Error getting storage info:', e);
    return {
      available: true,
      used: 0,
      itemCount: 0,
      items: {}
    };
  }
}
