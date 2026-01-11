/**
 * Session Device Service
 * 
 * Handles single-device session management for:
 * 1. Driver live location sharing (only one device can broadcast at a time)
 * 2. Student live location viewing (only one device can view at a time)
 * 
 * Uses Supabase to track active sessions per user/feature combination.
 */

import { supabase } from '@/lib/supabase-client';

interface DeviceSession {
    userId: string;
    deviceId: string;
    feature: 'driver_location_share' | 'student_location_view';
    createdAt: string;
    lastActiveAt: string;
}

/**
 * Generate a unique device ID for the current browser/device
 * Persists in localStorage to maintain consistency across page refreshes
 */
export function getOrCreateDeviceId(): string {
    if (typeof window === 'undefined') return 'server-side';

    const STORAGE_KEY = 'adtu_device_id';
    let deviceId = localStorage.getItem(STORAGE_KEY);

    if (!deviceId) {
        // Generate a unique ID using crypto API if available, fallback to Math.random
        if (window.crypto?.randomUUID) {
            deviceId = window.crypto.randomUUID();
        } else {
            deviceId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        }
        localStorage.setItem(STORAGE_KEY, deviceId);
    }

    return deviceId;
}

/**
 * Check if current device has an active session for a feature
 * Returns: { isCurrentDevice: boolean, hasActiveSession: boolean, otherDeviceId?: string }
 */
export async function checkDeviceSession(
    userId: string,
    feature: 'driver_location_share' | 'student_location_view'
): Promise<{ isCurrentDevice: boolean; hasActiveSession: boolean; otherDeviceId?: string; sessionAge?: number }> {
    const currentDeviceId = getOrCreateDeviceId();

    try {
        // Query for active sessions for this user and feature
        const { data, error } = await supabase
            .from('device_sessions')
            .select('*')
            .eq('user_id', userId)
            .eq('feature', feature)
            .order('last_active_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Error checking device session:', error);
            // On error, allow the operation to proceed (fail-open for better UX)
            return { isCurrentDevice: true, hasActiveSession: false };
        }

        if (!data) {
            // No active session found
            return { isCurrentDevice: true, hasActiveSession: false };
        }

        // Check if session is still valid (within last 30 seconds for location tracking)
        const sessionAge = Date.now() - new Date(data.last_active_at).getTime();
        const SESSION_TIMEOUT_MS = 30000; // 30 seconds

        if (sessionAge > SESSION_TIMEOUT_MS) {
            // Session expired, can take over
            return { isCurrentDevice: true, hasActiveSession: false };
        }

        // Active session exists
        const isCurrentDevice = data.device_id === currentDeviceId;

        return {
            isCurrentDevice,
            hasActiveSession: true,
            otherDeviceId: isCurrentDevice ? undefined : data.device_id,
            sessionAge
        };
    } catch (err) {
        console.error('Exception checking device session:', err);
        return { isCurrentDevice: true, hasActiveSession: false };
    }
}

/**
 * Register/update device session for a feature
 * This claims the session for the current device
 */
export async function registerDeviceSession(
    userId: string,
    feature: 'driver_location_share' | 'student_location_view'
): Promise<{ success: boolean; error?: string }> {
    const deviceId = getOrCreateDeviceId();
    const now = new Date().toISOString();

    try {
        // Upsert the session (creates or updates)
        const { error } = await supabase
            .from('device_sessions')
            .upsert({
                user_id: userId,
                device_id: deviceId,
                feature: feature,
                last_active_at: now,
                created_at: now
            }, {
                onConflict: 'user_id,feature',
                ignoreDuplicates: false
            });

        if (error) {
            console.error('Error registering device session:', error);
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (err: any) {
        console.error('Exception registering device session:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Keep session alive by updating last_active_at
 * Should be called periodically (every 5-10 seconds) while feature is active
 */
export async function heartbeatDeviceSession(
    userId: string,
    feature: 'driver_location_share' | 'student_location_view'
): Promise<boolean> {
    const deviceId = getOrCreateDeviceId();

    try {
        const { error } = await supabase
            .from('device_sessions')
            .update({ last_active_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('feature', feature)
            .eq('device_id', deviceId);

        if (error) {
            console.error('Error heartbeating session:', error);
            return false;
        }

        return true;
    } catch (err) {
        console.error('Exception heartbeating session:', err);
        return false;
    }
}

/**
 * Release device session when feature is no longer being used
 */
export async function releaseDeviceSession(
    userId: string,
    feature: 'driver_location_share' | 'student_location_view'
): Promise<void> {
    const deviceId = getOrCreateDeviceId();

    try {
        await supabase
            .from('device_sessions')
            .delete()
            .eq('user_id', userId)
            .eq('feature', feature)
            .eq('device_id', deviceId);
    } catch (err) {
        console.error('Exception releasing session:', err);
    }
}

/**
 * Hook to manage device session with automatic heartbeat
 * Usage: useDeviceSession(userId, 'driver_location_share', isActive)
 */
export function createDeviceSessionManager(
    userId: string,
    feature: 'driver_location_share' | 'student_location_view',
    onConflict?: (otherDeviceId: string) => void
) {
    let heartbeatInterval: NodeJS.Timeout | null = null;
    let isActive = false;

    const start = async () => {
        if (isActive) return true;

        // Check if another device is active
        const check = await checkDeviceSession(userId, feature);

        if (check.hasActiveSession && !check.isCurrentDevice) {
            // Another device is active
            if (onConflict && check.otherDeviceId) {
                onConflict(check.otherDeviceId);
            }
            return false;
        }

        // Register this device
        const result = await registerDeviceSession(userId, feature);
        if (!result.success) {
            return false;
        }

        isActive = true;

        // Start heartbeat (every 10 seconds)
        heartbeatInterval = setInterval(() => {
            heartbeatDeviceSession(userId, feature);
        }, 10000);

        return true;
    };

    const stop = async () => {
        isActive = false;

        if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
        }

        await releaseDeviceSession(userId, feature);
    };

    const checkStatus = async () => {
        return checkDeviceSession(userId, feature);
    };

    return { start, stop, checkStatus };
}
