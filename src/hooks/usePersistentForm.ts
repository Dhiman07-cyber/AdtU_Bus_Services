/**
 * usePersistentForm - Production-grade form hook with localStorage persistence
 * 
 * Features:
 * - Zero-lag typing (uncontrolled inputs via React Hook Form)
 * - Debounced localStorage writes (non-blocking)
 * - Single hydration on mount
 * - No re-render storms
 * - React 19 + Next.js 16 App Router compatible
 */

"use client";

import { useForm, UseFormProps, UseFormReturn, FieldValues } from 'react-hook-form';
import { useEffect, useRef, useCallback } from 'react';

interface PersistentFormOptions<T extends FieldValues> extends UseFormProps<T> {
  storageKey: string;
  excludeFields?: (keyof T)[];
  debounceMs?: number;
  onHydrate?: (data: Partial<T>) => void;
  onPersist?: (data: Partial<T>) => void;
}

interface StorageAdapter {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

/**
 * Safe storage adapter with error handling
 */
const createStorageAdapter = (): StorageAdapter => {
  if (typeof window === 'undefined') {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
  }

  return {
    getItem: (key: string) => {
      try {
        return localStorage.getItem(key);
      } catch (error) {
        console.warn(`[usePersistentForm] Failed to read from localStorage:`, error);
        return null;
      }
    },
    setItem: (key: string, value: string) => {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        console.warn(`[usePersistentForm] Failed to write to localStorage:`, error);
      }
    },
    removeItem: (key: string) => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.warn(`[usePersistentForm] Failed to remove from localStorage:`, error);
      }
    },
  };
};

/**
 * Batched storage writer using requestIdleCallback
 */
class StorageQueue {
  private queue = new Map<string, string>();
  private scheduled = false;
  private storage: StorageAdapter;

  constructor(storage: StorageAdapter) {
    this.storage = storage;
  }

  enqueue(key: string, value: string) {
    this.queue.set(key, value);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.scheduled) return;
    this.scheduled = true;

    const flush = () => {
      this.queue.forEach((value, key) => {
        this.storage.setItem(key, value);
      });
      this.queue.clear();
      this.scheduled = false;
    };

    // Use requestIdleCallback if available, otherwise setTimeout
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(flush, { timeout: 1000 });
    } else {
      setTimeout(flush, 100);
    }
  }

  clear() {
    this.queue.clear();
    this.scheduled = false;
  }
}

export function usePersistentForm<T extends FieldValues>(
  options: PersistentFormOptions<T>
): UseFormReturn<T> & {
  clearStorage: () => void;
  isHydrated: boolean;
} {
  const {
    storageKey,
    excludeFields = [],
    debounceMs = 500,
    onHydrate,
    onPersist,
    defaultValues,
    ...formOptions
  } = options;

  const storage = useRef(createStorageAdapter()).current;
  const storageQueue = useRef(new StorageQueue(storage)).current;
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const isHydratedRef = useRef(false);
  const isMountedRef = useRef(false);

  // Initialize form with default values
  const form = useForm<T>({
    ...formOptions,
    defaultValues,
  });

  const { watch, reset } = form;

  /**
   * Hydrate form from localStorage (runs once on mount)
   */
  useEffect(() => {
    if (isHydratedRef.current) return;

    const savedData = storage.getItem(storageKey);
    if (!savedData) {
      isHydratedRef.current = true;
      return;
    }

    try {
      const parsed = JSON.parse(savedData) as Partial<T>;
      
      // Filter out excluded fields and blob URLs
      const filtered = Object.entries(parsed).reduce((acc, [key, value]) => {
        if (excludeFields.includes(key as keyof T)) return acc;
        
        // Skip blob URLs (they're session-specific)
        if (typeof value === 'string' && value.startsWith('blob:')) return acc;
        
        acc[key as keyof T] = value as T[keyof T];
        return acc;
      }, {} as Partial<T>);

      // Merge with default values
      const merged = { ...defaultValues, ...filtered } as T;
      
      reset(merged, { keepDefaultValues: true });
      onHydrate?.(filtered);
      
      console.log(`[usePersistentForm] Hydrated from storage:`, storageKey);
    } catch (error) {
      console.warn(`[usePersistentForm] Failed to parse stored data:`, error);
    } finally {
      isHydratedRef.current = true;
    }
  }, [storageKey, reset, defaultValues, excludeFields, onHydrate, storage]);

  /**
   * Debounced persistence (non-blocking)
   */
  useEffect(() => {
    if (!isHydratedRef.current) return;

    const subscription = watch((data) => {
      // Clear existing timer
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      // Schedule new save
      debounceTimer.current = setTimeout(() => {
        // Filter out excluded fields and blob URLs
        const filtered = Object.entries(data).reduce((acc, [key, value]) => {
          if (excludeFields.includes(key as keyof T)) return acc;
          if (typeof value === 'string' && value.startsWith('blob:')) return acc;
          
          acc[key] = value;
          return acc;
        }, {} as Record<string, any>);

        // Enqueue for batched write
        storageQueue.enqueue(storageKey, JSON.stringify(filtered));
        onPersist?.(filtered as Partial<T>);
      }, debounceMs);
    });

    return () => {
      subscription.unsubscribe();
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [watch, storageKey, excludeFields, debounceMs, onPersist, storageQueue]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      storageQueue.clear();
    };
  }, [storageQueue]);

  /**
   * Clear storage helper
   */
  const clearStorage = useCallback(() => {
    storage.removeItem(storageKey);
    storageQueue.clear();
    console.log(`[usePersistentForm] Cleared storage:`, storageKey);
  }, [storageKey, storage, storageQueue]);

  return {
    ...form,
    clearStorage,
    isHydrated: isHydratedRef.current,
  };
}
