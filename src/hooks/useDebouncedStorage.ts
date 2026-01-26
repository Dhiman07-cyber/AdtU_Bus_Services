/**
 * useDebouncedStorage - Non-blocking localStorage with debouncing
 * 
 * Prevents input lag by:
 * - Batching writes using requestIdleCallback
 * - Debouncing to reduce write frequency
 * - Never blocking the main thread
 */

"use client";

import { useRef, useCallback, useEffect, useMemo } from 'react';

interface StorageOptions {
  debounceMs?: number;
  excludeFields?: string[];
}

export function useDebouncedStorage<T extends Record<string, any>>(
  key: string,
  options: StorageOptions = {}
) {
  const { debounceMs = 500, excludeFields = [] } = options;
  
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const pendingData = useRef<Partial<T> | null>(null);
  const isScheduled = useRef(false);

  /**
   * Flush pending data to localStorage using requestIdleCallback
   */
  const flush = useCallback(() => {
    if (!pendingData.current) return;

    const dataToSave = { ...pendingData.current };
    
    // Helper function to check if a path should be excluded
    const shouldExclude = (path: string, value: any): boolean => {
      // Check if this exact path is in excludeFields
      if (excludeFields.includes(path)) {
        return true;
      }
      // Check if value is a blob URL
      if (typeof value === 'string' && value.startsWith('blob:')) {
        return true;
      }
      return false;
    };

    // Helper function to recursively filter nested objects
    const filterObject = (obj: any, parentPath: string = ''): any => {
      if (obj === null || obj === undefined) return obj;
      
      if (Array.isArray(obj)) {
        return obj.map((item, index) => filterObject(item, `${parentPath}[${index}]`));
      }
      
      if (typeof obj === 'object') {
        const filtered: any = {};
        Object.keys(obj).forEach((key) => {
          const currentPath = parentPath ? `${parentPath}.${key}` : key;
          const value = obj[key];
          
          if (!shouldExclude(currentPath, value)) {
            filtered[key] = filterObject(value, currentPath);
          }
        });
        return filtered;
      }
      
      return obj;
    };

    const filteredData = filterObject(dataToSave);

    const writeToStorage = () => {
      try {
        localStorage.setItem(key, JSON.stringify(filteredData));
        console.log(`✅ [useDebouncedStorage] Saved to localStorage key: ${key}`, Object.keys(filteredData).length, 'fields');
      } catch (error) {
        console.warn(`[useDebouncedStorage] Failed to write to localStorage:`, error);
      }
      isScheduled.current = false;
    };

    // Use requestIdleCallback if available, otherwise setTimeout
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(writeToStorage, { timeout: 1000 });
    } else {
      setTimeout(writeToStorage, 0);
    }

    pendingData.current = null;
  }, [key, excludeFields]);

  /**
   * Save data with debouncing
   */
  const save = useCallback((data: Partial<T>) => {
    // Update pending data
    pendingData.current = { ...pendingData.current, ...data };

    // Clear existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Schedule flush
    debounceTimer.current = setTimeout(() => {
      if (!isScheduled.current) {
        isScheduled.current = true;
        flush();
      }
    }, debounceMs);
  }, [debounceMs, flush]);

  /**
   * Load data from localStorage
   */
  const load = useCallback((): T | null => {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) {
        console.log(`📭 [useDebouncedStorage] No data found for key: ${key}`);
        return null;
      }
      const parsed = JSON.parse(stored) as T;
      console.log(`📬 [useDebouncedStorage] Loaded from localStorage key: ${key}`, Object.keys(parsed).length, 'fields');
      return parsed;
    } catch (error) {
      console.warn(`[useDebouncedStorage] Failed to read from localStorage:`, error);
      return null;
    }
  }, [key]);

  /**
   * Clear storage
   */
  const clear = useCallback(() => {
    try {
      localStorage.removeItem(key);
      pendingData.current = null;
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    } catch (error) {
      console.warn(`[useDebouncedStorage] Failed to clear localStorage:`, error);
    }
  }, [key]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      // Flush any pending data before unmount
      if (pendingData.current) {
        flush();
      }
    };
  }, [flush]);

  // Return stable object reference using useMemo
  return useMemo(() => ({ save, load, clear }), [save, load, clear]);
}
