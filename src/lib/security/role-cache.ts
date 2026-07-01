/**
 * Canonical Role Cache for ADTU Bus Services
 * 
 * Single source of truth for caching user role lookups.
 * Used by both verifyApiAuth and withSecurity to avoid duplicate caches.
 */

import { adminDb } from '@/lib/firebase-admin';

// ============================================================================
// CONFIGURATION
// ============================================================================

const ROLE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const ROLE_CACHE_MAX = 2000;

// ============================================================================
// TYPES
// ============================================================================

interface RoleCacheEntry {
    role: string;
    name: string;
    employeeId: string;
    expiresAt: number;
}

// ============================================================================
// CACHE INSTANCE
// ============================================================================

const _roleCache = new Map<string, RoleCacheEntry>();

/** Periodic cleanup every 10 min */
if (typeof setInterval !== 'undefined' && !(globalThis as any).__roleCacheCleanupStarted) {
    (globalThis as any).__roleCacheCleanupStarted = true;
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of _roleCache) {
            if (now > entry.expiresAt) _roleCache.delete(key);
        }
    }, 10 * 60 * 1000);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get cached role data for a user.
 * Returns null if not cached or expired.
 */
export function getCachedRole(uid: string): { role: string; name: string; employeeId: string } | null {
    const cached = _roleCache.get(uid);
    if (cached && Date.now() < cached.expiresAt) {
        return { role: cached.role, name: cached.name, employeeId: cached.employeeId };
    }
    return null;
}

/**
 * Resolve user role from Firestore (with cache).
 * Checks users collection first, then parallel fallback across role-specific collections.
 */
export async function resolveUserRole(uid: string): Promise<{ role: string; name: string; employeeId: string }> {
    // Check cache first
    const cached = getCachedRole(uid);
    if (cached) {
        return cached;
    }

    if (!adminDb) {
        return { role: '', name: '', employeeId: '' };
    }

    // PERF: Check users collection first (fastest, most common case)
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (userDoc.exists) {
        const data = userDoc.data();
        const result = {
            role: data?.role || 'student',
            name: data?.name || data?.fullName || '',
            employeeId: '',
        };
        setCachedRole(uid, result);
        return result;
    }

    // PERF: Parallel lookup across all role-specific collections
    const [adminDoc, modDoc, driverDoc, studentDoc] = await Promise.all([
        adminDb.collection('admins').doc(uid).get(),
        adminDb.collection('moderators').doc(uid).get(),
        adminDb.collection('drivers').doc(uid).get(),
        adminDb.collection('students').doc(uid).get(),
    ]);

    let result = { role: '', name: '', employeeId: '' };
    if (adminDoc.exists) {
        result = {
            role: 'admin',
            name: adminDoc.data()?.name || adminDoc.data()?.fullName || '',
            employeeId: adminDoc.data()?.employeeId || '',
        };
    } else if (modDoc.exists) {
        result = {
            role: 'moderator',
            name: modDoc.data()?.fullName || modDoc.data()?.name || '',
            employeeId: modDoc.data()?.employeeId || modDoc.data()?.staffId || '',
        };
    } else if (driverDoc.exists) {
        result = {
            role: 'driver',
            name: driverDoc.data()?.fullName || driverDoc.data()?.name || '',
            employeeId: driverDoc.data()?.driverId || '',
        };
    } else if (studentDoc.exists) {
        result = {
            role: 'student',
            name: studentDoc.data()?.fullName || studentDoc.data()?.name || '',
            employeeId: '',
        };
    }

    if (result.role) {
        setCachedRole(uid, result);
    }
    return result;
}

/**
 * Set cached role data for a user.
 * Handles LRU eviction when cache reaches max size.
 */
export function setCachedRole(uid: string, entry: { role: string; name: string; employeeId: string }): void {
    // Evict oldest if at capacity
    if (_roleCache.size >= ROLE_CACHE_MAX) {
        const firstKey = _roleCache.keys().next().value;
        if (firstKey) _roleCache.delete(firstKey);
    }
    _roleCache.set(uid, { ...entry, expiresAt: Date.now() + ROLE_CACHE_TTL });
}

/**
 * Invalidate cached role for a user (e.g., after role change).
 */
export function invalidateCachedRole(uid: string): void {
    _roleCache.delete(uid);
}

/**
 * Clear entire role cache (for testing/admin).
 */
export function clearRoleCache(): void {
    _roleCache.clear();
}