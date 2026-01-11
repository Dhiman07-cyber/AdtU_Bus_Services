/**
 * Event-Driven Collection Refresh Hook
 * 
 * This hook provides a way to refresh collection data when mutations occur.
 * Instead of polling/realtime, it only fetches data:
 * 1. On initial mount
 * 2. When a mutation flag is detected (via URL search params or sessionStorage)
 * 
 * Usage:
 * - After add/edit/delete operations, set sessionStorage.setItem('refresh_students', 'true')
 * - The list page will detect this and refresh automatically
 * 
 * @module hooks/useEventDrivenRefresh
 * @version 1.0.0
 * @since 2026-01-05
 */

import { useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { invalidateCollectionCache } from './usePaginatedCollection';

export interface UseEventDrivenRefreshOptions {
    /** Collection name to watch for refresh signals */
    collectionName: string;
    /** Callback to refresh the data */
    onRefresh: () => Promise<void> | void;
}

/**
 * Hook that watches for refresh signals from mutations and triggers data refresh.
 * 
 * The refresh is triggered when:
 * 1. URL has ?refresh=true parameter (set by add/edit pages on redirect)
 * 2. sessionStorage has `refresh_{collectionName}=true` flag
 * 
 * @example
 * ```tsx
 * // In the list page:
 * const { data, refresh } = usePaginatedCollection('students', { autoRefresh: false });
 * useEventDrivenRefresh({ collectionName: 'students', onRefresh: refresh });
 * 
 * // In the add/edit page (on success):
 * sessionStorage.setItem('refresh_students', 'true');
 * router.push('/admin/students');
 * ```
 */
export function useEventDrivenRefresh({ collectionName, onRefresh }: UseEventDrivenRefreshOptions) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const hasRefreshedRef = useRef(false);

    // Check for refresh signals and trigger refresh
    useEffect(() => {
        const checkAndRefresh = async () => {
            // Prevent double-refresh on strict mode
            if (hasRefreshedRef.current) return;

            const storageKey = `refresh_${collectionName}`;
            const needsRefreshFromStorage = sessionStorage.getItem(storageKey) === 'true';
            const needsRefreshFromURL = searchParams?.get('refresh') === 'true';

            if (needsRefreshFromStorage || needsRefreshFromURL) {
                hasRefreshedRef.current = true;

                // Clear the refresh signal
                sessionStorage.removeItem(storageKey);

                // Remove refresh param from URL without causing navigation
                if (needsRefreshFromURL && pathname) {
                    const newUrl = new URL(window.location.href);
                    newUrl.searchParams.delete('refresh');
                    window.history.replaceState({}, '', newUrl.toString());
                }

                // Invalidate cache first
                invalidateCollectionCache(collectionName);

                // Then trigger refresh
                console.log(`[EventDrivenRefresh] Refreshing ${collectionName} due to mutation signal`);
                await onRefresh();
            }
        };

        checkAndRefresh();
    }, [collectionName, onRefresh, searchParams, pathname]);

    // Reset the ref when pathname changes (navigating away and back)
    useEffect(() => {
        hasRefreshedRef.current = false;
    }, [pathname]);
}

/**
 * Utility to signal that a collection needs to be refreshed.
 * Call this after successful add/edit/delete operations.
 * 
 * @param collectionName - The collection that was modified
 */
export function signalCollectionRefresh(collectionName: string): void {
    const storageKey = `refresh_${collectionName}`;
    sessionStorage.setItem(storageKey, 'true');
    console.log(`[EventDrivenRefresh] Signaled refresh for ${collectionName}`);
}

/**
 * Utility to signal refresh and navigate to the list page.
 * Use this in add/edit pages after successful operations.
 * 
 * @param collectionName - The collection that was modified
 * @param listPath - The path to the list page
 * @param router - Next.js router instance
 */
export function signalRefreshAndNavigate(
    collectionName: string,
    listPath: string,
    router: ReturnType<typeof useRouter>
): void {
    signalCollectionRefresh(collectionName);
    router.push(listPath);
}

export default useEventDrivenRefresh;
