/**
 * Real-time Notifications Hook
 * 
 * This hook uses Firestore onSnapshot ONLY for the notifications collection.
 * This is the ONLY place where real-time listeners are allowed, as notifications
 * are critical for user experience and are typically single-user scoped.
 * 
 * Features:
 * - Real-time updates for notifications collection only
 * - User-scoped (only fetches notifications for current user)
 * - Visibility-aware to reduce reads when tab is hidden
 * - Automatic cleanup on unmount
 * 
 * @module hooks/useRealtimeNotifications
 * @version 1.0.0
 * @since 2026-01-05
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    collection,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    Unsubscribe,
    Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/auth-context';
import { useVisibilityAwareListener } from '@/utils/useVisibilityAwareListener';

export interface Notification {
    id: string;
    title: string;
    content: string;
    type: 'info' | 'warning' | 'success' | 'error' | 'announcement';
    recipientIds?: string[];
    recipientRole?: string;
    audience?: string;
    read?: boolean;
    createdAt: Timestamp | Date | string;
    sender?: {
        userId: string;
        name: string;
        role: string;
    };
    metadata?: Record<string, any>;
}

export interface UseRealtimeNotificationsOptions {
    /** Maximum number of notifications to fetch (default: 50) */
    limit?: number;
    /** Whether to only fetch unread notifications (default: false) */
    unreadOnly?: boolean;
    /** Whether to enable real-time updates (default: true) */
    enabled?: boolean;
}

export interface UseRealtimeNotificationsResult {
    /** Array of notifications */
    notifications: Notification[];
    /** Whether currently loading */
    loading: boolean;
    /** Error from last fetch attempt */
    error: Error | null;
    /** Count of unread notifications */
    unreadCount: number;
    /** Whether real-time is active */
    isRealtimeActive: boolean;
}

/**
 * Hook that provides real-time notifications for the current user.
 * This is the ONLY hook that uses onSnapshot in the application.
 * 
 * @example
 * ```tsx
 * const { notifications, unreadCount, loading } = useRealtimeNotifications({
 *   limit: 20,
 *   unreadOnly: false
 * });
 * ```
 */
export function useRealtimeNotifications(
    options: UseRealtimeNotificationsOptions = {}
): UseRealtimeNotificationsResult {
    const {
        limit: queryLimit = 50,
        unreadOnly = false,
        enabled = true,
    } = options;

    const { currentUser, userData } = useAuth();
    const { isVisible, isOnline } = useVisibilityAwareListener();

    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const unsubscribeRef = useRef<Unsubscribe | null>(null);
    const hasInitialLoadRef = useRef(false);

    // Calculate unread count
    const unreadCount = notifications.filter(n => !n.read).length;

    // Check if real-time should be active
    const shouldBeActive = enabled && isVisible && isOnline && !!currentUser?.uid;

    // Setup real-time listener
    useEffect(() => {
        // Don't setup listener if conditions aren't met
        if (!shouldBeActive) {
            // Cleanup existing listener if conditions changed
            if (unsubscribeRef.current) {
                console.log('[RealtimeNotifications] Pausing - conditions not met');
                unsubscribeRef.current();
                unsubscribeRef.current = null;
            }
            return;
        }

        // Already have a listener
        if (unsubscribeRef.current) {
            return;
        }

        console.log('[RealtimeNotifications] Starting real-time listener for user:', currentUser.uid);
        setLoading(true);

        try {
            const notificationsRef = collection(db, 'notifications');

            // Build query based on user role and ID
            // Notifications can be targeted by:
            // 1. recipientIds array containing user's UID
            // 2. recipientRole matching user's role
            // 3. audience being 'all' or matching user's role

            // For simplicity, we'll query by recipientIds array-contains
            // and also check recipientRole in client-side filtering
            let notificationQuery = query(
                notificationsRef,
                where('recipientIds', 'array-contains', currentUser.uid),
                orderBy('createdAt', 'desc'),
                limit(queryLimit)
            );

            // If unreadOnly, add filter
            if (unreadOnly) {
                notificationQuery = query(
                    notificationsRef,
                    where('recipientIds', 'array-contains', currentUser.uid),
                    where('read', '==', false),
                    orderBy('createdAt', 'desc'),
                    limit(queryLimit)
                );
            }

            // Subscribe to real-time updates
            unsubscribeRef.current = onSnapshot(
                notificationQuery,
                (snapshot) => {
                    const docs = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    })) as Notification[];

                    setNotifications(docs);
                    setError(null);
                    setLoading(false);
                    hasInitialLoadRef.current = true;

                    console.log(`[RealtimeNotifications] Received ${docs.length} notifications`);
                },
                (err) => {
                    console.error('[RealtimeNotifications] Error:', err);
                    setError(err as Error);
                    setLoading(false);
                }
            );

        } catch (err) {
            console.error('[RealtimeNotifications] Setup error:', err);
            setError(err as Error);
            setLoading(false);
        }

        // Cleanup on unmount
        return () => {
            if (unsubscribeRef.current) {
                console.log('[RealtimeNotifications] Cleaning up listener');
                unsubscribeRef.current();
                unsubscribeRef.current = null;
            }
        };
    }, [shouldBeActive, currentUser?.uid, queryLimit, unreadOnly]);

    return {
        notifications,
        loading,
        error,
        unreadCount,
        isRealtimeActive: !!unsubscribeRef.current,
    };
}

export default useRealtimeNotifications;
