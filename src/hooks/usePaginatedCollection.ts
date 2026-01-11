/**
 * Safe Paginated Collection Hook
 * 
 * REPLACES: useRealtimeCollection (which uses unbounded onSnapshot)
 * 
 * This hook uses getDocs() with explicit pagination to prevent
 * Firestore quota exhaustion. It NEVER uses onSnapshot on collections.
 * 
 * Features:
 * - Explicit pagination with configurable page size (max 50)
 * - Optional auto-refresh with exponential backoff on failures
 * - Visibility-aware to prevent polling when tab is hidden
 * - TypeScript generics for type safety
 * - In-memory cache to prevent HMR/remount duplicate fetches
 * 
 * @module hooks/usePaginatedCollection
 * @version 1.1.0
 * @since 2026-01-02
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    getDocs,
    query,
    limit,
    startAfter,
    Query,
    DocumentData,
    QueryDocumentSnapshot,
    QueryConstraint,
    collection,
    orderBy
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/auth-context';
import {
    DEFAULT_PAGE_SIZE,
    MAX_QUERY_LIMIT,
    POLLING_INTERVAL_MS
} from '@/config/runtime';
import { useVisibilityAwareListener } from '@/utils/useVisibilityAwareListener';

// ============================================================================
// GLOBAL CACHE - Prevents duplicate fetches during HMR and rapid remounts
// ============================================================================
interface CacheEntry<T> {
    data: T[];
    timestamp: number;
}

const dataCache = new Map<string, CacheEntry<any>>();
// SPARK PLAN SAFETY: 10 minute cache to prevent excessive reads
// Data persists across page navigations, HMR reloads, and component remounts
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCacheKey(collectionName: string, orderByField: string, orderDirection: string): string {
    return `${collectionName}:${orderByField}:${orderDirection}`;
}

function getCachedData<T>(key: string): T[] | null {
    const entry = dataCache.get(key);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
        const ageSeconds = Math.round((Date.now() - entry.timestamp) / 1000);
        console.log(`[Cache] HIT for ${key} (age: ${ageSeconds}s, items: ${entry.data.length})`);
        return entry.data;
    }
    if (entry) {
        console.log(`[Cache] EXPIRED for ${key}`);
        dataCache.delete(key);
    }
    return null;
}

function setCachedData<T>(key: string, data: T[]): void {
    dataCache.set(key, { data, timestamp: Date.now() });
    console.log(`[Cache] SET for ${key} (${data.length} items, TTL: 10 min)`);
}

// Clear cache for a specific collection (call after mutations)
export function invalidateCollectionCache(collectionName: string): void {
    const keysToDelete: string[] = [];
    dataCache.forEach((_, key) => {
        if (key.startsWith(`${collectionName}:`)) {
            keysToDelete.push(key);
        }
    });
    keysToDelete.forEach(key => {
        dataCache.delete(key);
        console.log(`[Cache] INVALIDATED ${key}`);
    });
}

// Clear all cache (use sparingly)
export function clearAllCache(): void {
    dataCache.clear();
    console.log(`[Cache] ALL CLEARED`);
}


// ============================================================================
// TYPES
// ============================================================================

export interface UsePaginatedCollectionOptions {
    /** Number of documents per page (default: 50, max: 50) */
    pageSize?: number;
    /** Enable auto-refresh polling (default: false) */
    autoRefresh?: boolean;
    /** Auto-refresh interval in milliseconds (default: 120000 = 2 min) */
    autoRefreshInterval?: number;
    /** Initial sort field for cursor-based pagination */
    orderByField?: string;
    /** Sort direction */
    orderDirection?: 'asc' | 'desc';
    /** Whether to fetch on mount (default: true) */
    fetchOnMount?: boolean;
    /** Only fetch when this is true */
    enabled?: boolean;
}

export interface UsePaginatedCollectionResult<T> {
    /** Flattened array of all fetched documents */
    data: T[];
    /** Whether currently fetching */
    loading: boolean;
    /** Error from last fetch attempt */
    error: Error | null;
    /** Fetch the next page of results */
    fetchNextPage: () => Promise<void>;
    /** Refresh from the beginning (clears all pages) */
    refresh: () => Promise<void>;
    /** Whether there are more pages to fetch */
    hasMore: boolean;
    /** Total documents fetched so far */
    totalFetched: number;
    /** Whether auto-refresh is currently active */
    isAutoRefreshing: boolean;
    /** Toggle auto-refresh on/off */
    setAutoRefresh: (enabled: boolean) => void;
}

// ============================================================================
// MAIN HOOK
// ============================================================================

/**
 * Safe paginated collection hook that uses getDocs() instead of onSnapshot.
 * 
 * @example
 * ```tsx
 * // Basic usage
 * const { data: students, loading, fetchNextPage, refresh } = usePaginatedCollection<Student>(
 *   'students',
 *   { pageSize: 50, orderByField: 'updatedAt', orderDirection: 'desc' }
 * );
 * 
 * // With constraints
 * const { data } = usePaginatedCollectionWithQuery<Student>(
 *   () => query(
 *     collection(db, 'students'), 
 *     where('status', '==', 'active'),
 *     orderBy('updatedAt', 'desc')
 *   ),
 *   { pageSize: 50 }
 * );
 * ```
 */
export function usePaginatedCollection<T = DocumentData>(
    collectionName: string,
    options: UsePaginatedCollectionOptions = {}
): UsePaginatedCollectionResult<T> {
    const {
        pageSize = DEFAULT_PAGE_SIZE,
        autoRefresh: initialAutoRefresh = false,
        autoRefreshInterval = POLLING_INTERVAL_MS,
        orderByField = 'updatedAt',
        orderDirection = 'desc',
        fetchOnMount = true,
        enabled = true,
    } = options;

    // Enforce max page size
    const effectivePageSize = Math.min(pageSize, MAX_QUERY_LIMIT);

    const { currentUser } = useAuth();
    const { isVisible, isOnline } = useVisibilityAwareListener();

    // State
    const [pages, setPages] = useState<T[][]>([]);
    const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(initialAutoRefresh);

    // Refs for stable callbacks
    const retryCountRef = useRef(0);
    const maxRetries = 3;
    const isMountedRef = useRef(true);
    const lastFetchRef = useRef<number>(0);

    // Memoized query factory
    const createQuery = useCallback(() => {
        const collRef = collection(db, collectionName);
        // SPARK PLAN SAFETY: Removed secondary documentId() sort to avoid requiring composite indexes
        // Pagination still works correctly via cursor using startAfter()
        return query(collRef, orderBy(orderByField, orderDirection));
    }, [collectionName, orderByField, orderDirection]);

    // Fetch a page of documents
    const fetchPage = useCallback(async (isNextPage: boolean = false, bypassCache: boolean = false) => {
        if (!currentUser || !enabled) {
            setLoading(false);
            return;
        }

        // Prevent duplicate fetches within 1 second
        const now = Date.now();
        if (now - lastFetchRef.current < 1000 && !isNextPage && !bypassCache) {
            return;
        }
        lastFetchRef.current = now;

        // Check cache for initial page load (not pagination)
        const cacheKey = getCacheKey(collectionName, orderByField, orderDirection);
        if (!isNextPage && !bypassCache) {
            const cached = getCachedData<T>(cacheKey);
            if (cached) {
                setPages([cached]);
                setLoading(false);
                setHasMore(cached.length >= effectivePageSize);
                return;
            }
        }

        setLoading(true);
        setError(null);

        try {
            let q = createQuery();

            // Apply pagination
            const constraints: QueryConstraint[] = [limit(effectivePageSize)];

            if (isNextPage && cursor) {
                constraints.push(startAfter(cursor));
            }

            q = query(q, ...constraints);

            const snapshot = await getDocs(q);

            if (!isMountedRef.current) return;

            const docs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as T[];

            // Update cursor for next page
            const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
            setCursor(lastDoc);

            // Check if there are more results
            setHasMore(snapshot.docs.length === effectivePageSize);

            // Update pages and cache (only for initial page, not pagination)
            setPages(prev => isNextPage ? [...prev, docs] : [docs]);
            if (!isNextPage) {
                setCachedData(cacheKey, docs);
            }

            // Reset retry count on success
            retryCountRef.current = 0;
            setError(null);

        } catch (err) {
            console.error(`[usePaginatedCollection] Error fetching ${collectionName}:`, err);

            if (!isMountedRef.current) return;

            setError(err as Error);

            // Exponential backoff retry for transient errors
            if (retryCountRef.current < maxRetries) {
                retryCountRef.current++;
                const backoffMs = Math.min(1000 * Math.pow(2, retryCountRef.current), 30000);
                console.log(`[usePaginatedCollection] Retrying in ${backoffMs}ms (attempt ${retryCountRef.current}/${maxRetries})`);

                setTimeout(() => {
                    if (isMountedRef.current) {
                        fetchPage(isNextPage);
                    }
                }, backoffMs);
            }
        } finally {
            if (isMountedRef.current) {
                setLoading(false);
            }
        }
    }, [currentUser, enabled, createQuery, effectivePageSize, cursor, collectionName]);

    // Public methods
    const fetchNextPage = useCallback(async () => {
        if (!hasMore || loading) return;
        await fetchPage(true);
    }, [hasMore, loading, fetchPage]);

    const refresh = useCallback(async () => {
        setCursor(null);
        setHasMore(true);
        // SPARK PLAN FIX: Don't clear pages immediately to prevent UI flash
        // setPages([]); 
        await fetchPage(false, true); // bypassCache = true for manual refresh
    }, [fetchPage]);

    // Initial fetch
    useEffect(() => {
        isMountedRef.current = true;

        if (fetchOnMount && enabled && currentUser) {
            fetchPage(false);
        }

        return () => {
            isMountedRef.current = false;
        };
    }, [fetchOnMount, enabled, currentUser?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-refresh with visibility awareness
    useEffect(() => {
        if (!autoRefresh || !enabled || !isVisible || !isOnline) {
            return;
        }

        const intervalId = setInterval(() => {
            if (isVisible && isOnline && isMountedRef.current) {
                refresh();
            }
        }, autoRefreshInterval);

        return () => clearInterval(intervalId);
    }, [autoRefresh, enabled, isVisible, isOnline, autoRefreshInterval, refresh]);

    // Memoized flattened data
    const data = useMemo(() => pages.flat(), [pages]);

    return {
        data,
        loading,
        error,
        fetchNextPage,
        refresh,
        hasMore,
        totalFetched: data.length,
        isAutoRefreshing: autoRefresh && isVisible && isOnline,
        setAutoRefresh,
    };
}

// ============================================================================
// ADVANCED HOOK WITH CUSTOM QUERY
// ============================================================================

/**
 * Paginated collection hook that accepts a custom query factory.
 * Use this when you need WHERE clauses or complex ordering.
 * 
 * IMPORTANT: Your query MUST include orderBy() for pagination to work correctly.
 */
export function usePaginatedCollectionWithQuery<T = DocumentData>(
    queryFactory: () => Query<DocumentData>,
    options: Omit<UsePaginatedCollectionOptions, 'orderByField' | 'orderDirection'> = {}
): UsePaginatedCollectionResult<T> {
    const {
        pageSize = DEFAULT_PAGE_SIZE,
        autoRefresh: initialAutoRefresh = false,
        autoRefreshInterval = POLLING_INTERVAL_MS,
        fetchOnMount = true,
        enabled = true,
    } = options;

    const effectivePageSize = Math.min(pageSize, MAX_QUERY_LIMIT);

    const { currentUser } = useAuth();
    const { isVisible, isOnline } = useVisibilityAwareListener();

    const [pages, setPages] = useState<T[][]>([]);
    const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(initialAutoRefresh);

    const isMountedRef = useRef(true);
    const retryCountRef = useRef(0);

    const fetchPage = useCallback(async (isNextPage: boolean = false) => {
        if (!currentUser || !enabled) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            let q = queryFactory();

            const constraints: QueryConstraint[] = [limit(effectivePageSize)];
            if (isNextPage && cursor) {
                constraints.push(startAfter(cursor));
            }

            q = query(q, ...constraints);

            const snapshot = await getDocs(q);

            if (!isMountedRef.current) return;

            const docs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as T[];

            const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
            setCursor(lastDoc);
            setHasMore(snapshot.docs.length === effectivePageSize);
            setPages(prev => isNextPage ? [...prev, docs] : [docs]);
            retryCountRef.current = 0;

        } catch (err) {
            console.error('[usePaginatedCollectionWithQuery] Fetch error:', err);
            if (isMountedRef.current) {
                setError(err as Error);
            }
        } finally {
            if (isMountedRef.current) {
                setLoading(false);
            }
        }
    }, [currentUser, enabled, queryFactory, effectivePageSize, cursor]);

    const fetchNextPage = useCallback(async () => {
        if (!hasMore || loading) return;
        await fetchPage(true);
    }, [hasMore, loading, fetchPage]);

    const refresh = useCallback(async () => {
        setCursor(null);
        setHasMore(true);
        setPages([]);
        await fetchPage(false);
    }, [fetchPage]);

    useEffect(() => {
        isMountedRef.current = true;
        if (fetchOnMount && enabled && currentUser) {
            fetchPage(false);
        }
        return () => { isMountedRef.current = false; };
    }, [fetchOnMount, enabled, currentUser?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!autoRefresh || !enabled || !isVisible || !isOnline) return;
        const id = setInterval(() => {
            if (isVisible && isOnline && isMountedRef.current) {
                refresh();
            }
        }, autoRefreshInterval);
        return () => clearInterval(id);
    }, [autoRefresh, enabled, isVisible, isOnline, autoRefreshInterval, refresh]);

    const data = useMemo(() => pages.flat(), [pages]);

    return {
        data,
        loading,
        error,
        fetchNextPage,
        refresh,
        hasMore,
        totalFetched: data.length,
        isAutoRefreshing: autoRefresh && isVisible && isOnline,
        setAutoRefresh,
    };
}

// ============================================================================
// DEPRECATED COMPATIBILITY EXPORT
// ============================================================================

/**
 * @deprecated Use usePaginatedCollection instead. This export exists only
 * for migration compatibility and will be removed in a future version.
 * 
 * This function THROWS an error to force migration away from unbounded listeners.
 */
export function useRealtimeCollection(): never {
    throw new Error(
        '[FIRESTORE SAFETY] useRealtimeCollection has been disabled to prevent quota exhaustion. ' +
        'Please migrate to usePaginatedCollection or usePaginatedCollectionWithQuery. ' +
        'See: https://firebase.google.com/docs/firestore/quotas'
    );
}

export default usePaginatedCollection;
