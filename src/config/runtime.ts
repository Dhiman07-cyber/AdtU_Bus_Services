/**
 * Runtime Configuration for Firestore Safety
 * 
 * This module provides runtime configuration for controlling Firestore realtime listeners.
 * It includes both environment-based and Firestore-based kill switches for emergency control.
 * 
 * @module config/runtime
 * @version 1.0.0
 * @since 2026-01-02
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ============================================================================
// CORE CONFIGURATION FLAGS
// ============================================================================

/**
 * Master kill switch for Firestore realtime listeners.
 * When false, all realtime listeners MUST fall back to polling/getDocs.
 * 
 * Set via environment variable NEXT_PUBLIC_ENABLE_FIRESTORE_REALTIME=true
 * Default: false (safe mode)
 */
export const ENABLE_FIRESTORE_REALTIME =
    process.env.NEXT_PUBLIC_ENABLE_FIRESTORE_REALTIME === 'true';

/**
 * Maximum documents allowed per query (enforced at code level)
 * Firestore rules also enforce this at the database level
 */
export const MAX_QUERY_LIMIT = 50;

/**
 * Default page size for paginated queries
 */
export const DEFAULT_PAGE_SIZE = 50;

/**
 * Polling interval for non-realtime fallback mode (in milliseconds)
 */
export const POLLING_INTERVAL_MS = 300_000; // 5 minutes (was 2 min, increased for Spark safety)

/**
 * Fast polling interval for notifications (in milliseconds)
 */
export const NOTIFICATION_POLLING_INTERVAL_MS = 600_000; // 10 minutes (was 5 min, increased for Spark safety)

/**
 * Auto-refresh interval for admin/moderator management pages (in milliseconds)
 * Set to 10 minutes to conserve Firestore Spark plan quota while still providing near-realtime updates
 * Pages using this: Student Management, Driver Management, Applications, View Applications
 */
export const MANAGEMENT_PAGE_REFRESH_INTERVAL_MS = 600_000; // 10 minutes - Spark plan safe

/**
 * System signals polling interval (in milliseconds)
 * Set to 60s to balance responsiveness with quota safety
 */
export const SYSTEM_SIGNALS_INTERVAL_MS = 60_000; // 60 seconds

/**
 * Debounce time for visibility-based listener reattach (in milliseconds)
 */
export const VISIBILITY_DEBOUNCE_MS = 3_000; // 3 seconds

/**
 * Debounce time for coalescing rapid document updates (in milliseconds)
 */
export const UPDATE_DEBOUNCE_MS = 2_000; // 2 seconds

// ============================================================================
// RUNTIME CONFIG CACHE
// ============================================================================

interface RuntimeConfig {
    firestoreRealtimeEnabled: boolean;
    maxQueryLimit: number;
    lastFetched: number;
}

let cachedRuntimeConfig: RuntimeConfig | null = null;
const RUNTIME_CONFIG_CACHE_TTL_MS = 60_000; // 1 minute cache

/**
 * Fetches runtime configuration from Firestore config/runtime/firestoreRealtime doc.
 * This allows ops to disable realtime listeners without deployment.
 * 
 * @returns Promise<boolean> - Whether realtime is enabled (env && Firestore doc)
 */
export async function fetchRuntimeRealtimeConfig(): Promise<boolean> {
    // If env flag is false, skip Firestore check entirely
    if (!ENABLE_FIRESTORE_REALTIME) {
        return false;
    }

    // Check cache validity
    const now = Date.now();
    if (cachedRuntimeConfig && (now - cachedRuntimeConfig.lastFetched) < RUNTIME_CONFIG_CACHE_TTL_MS) {
        return cachedRuntimeConfig.firestoreRealtimeEnabled;
    }

    try {
        const configRef = doc(db, 'config', 'runtime');
        const configSnap = await getDoc(configRef);

        if (configSnap.exists()) {
            const data = configSnap.data();
            const enabled = data?.firestoreRealtimeEnabled !== false; // Default true if not set

            cachedRuntimeConfig = {
                firestoreRealtimeEnabled: enabled,
                maxQueryLimit: data?.maxQueryLimit || MAX_QUERY_LIMIT,
                lastFetched: now,
            };

            return enabled;
        }

        // If doc doesn't exist, respect env flag
        cachedRuntimeConfig = {
            firestoreRealtimeEnabled: true,
            maxQueryLimit: MAX_QUERY_LIMIT,
            lastFetched: now,
        };

        return true;
    } catch (error) {
        console.warn('[RuntimeConfig] Failed to fetch runtime config, using env defaults:', error);
        return ENABLE_FIRESTORE_REALTIME;
    }
}

/**
 * Synchronous check for realtime enabled status.
 * Uses cached value if available, otherwise returns env flag.
 */
export function isRealtimeEnabledSync(): boolean {
    if (!ENABLE_FIRESTORE_REALTIME) return false;
    if (cachedRuntimeConfig) return cachedRuntimeConfig.firestoreRealtimeEnabled;
    return ENABLE_FIRESTORE_REALTIME;
}

/**
 * Invalidates the runtime config cache, forcing a fresh fetch on next call.
 */
export function invalidateRuntimeConfigCache(): void {
    cachedRuntimeConfig = null;
}

// ============================================================================
// QUOTA SAFETY CONSTANTS
// ============================================================================

/**
 * Spark plan daily read quota
 */
export const SPARK_DAILY_READ_QUOTA = 50_000;

/**
 * Safety margin (target is 40k to leave 10k buffer)
 */
export const SAFETY_MARGIN_READS = 40_000;

/**
 * Estimated reads per admin page refresh (50 docs paginated)
 */
export const READS_PER_ADMIN_REFRESH = 50;

/**
 * Estimated reads per student single-doc listener mount
 */
export const READS_PER_STUDENT_MOUNT = 1;

/**
 * Estimated daily reconnects per client (conservative)
 */
export const ESTIMATED_DAILY_RECONNECTS = 10;
