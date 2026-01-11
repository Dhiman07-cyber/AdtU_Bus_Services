/**
 * Safe User Notifications Hook
 * 
 * Provides real-time notification updates for the current user.
 * This is ALLOWED under Spark plan safety rules because:
 * - Queries are user-scoped (recipientIds contains userId)
 * - Includes visibility guards to prevent wasted reads
 * - Respects the ENABLE_FIRESTORE_REALTIME kill switch
 * - Falls back to polling when realtime is disabled
 * 
 * ⚠️ NOTE: For admin/moderator roles, this queries all notifications.
 * Consider adding a limit() for very large notification volumes.
 * 
 * @module hooks/useUserNotifications
 * @version 2.0.0
 * @since 2026-01-02
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  limit,
  or,
  Unsubscribe
} from 'firebase/firestore';
import { notificationService } from '@/lib/notifications/NotificationService';
import { UserNotificationView, SYSTEM_SENDER } from '@/lib/notifications/types';
import { useVisibilityAwareListener } from '@/utils/useVisibilityAwareListener';
import {
  ENABLE_FIRESTORE_REALTIME,
  NOTIFICATION_POLLING_INTERVAL_MS,
  MAX_QUERY_LIMIT
} from '@/config/runtime';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum notifications to fetch per query for admin/mod (safety limit) */
const ADMIN_NOTIFICATION_LIMIT = 50;

/** Maximum notifications to fetch for regular users */
const USER_NOTIFICATION_LIMIT = 50;

// ============================================================================
// TYPES
// ============================================================================

export interface UseUserNotificationsResult {
  notifications: UserNotificationView[];
  unreadCount: number;
  loading: boolean;
  error: Error | null;
  markAsRead: (notificationId: string) => Promise<void>;
  deleteGlobally: (notificationId: string) => Promise<void>;
  editNotification: (notificationId: string, updates: { title?: string, content: string, metadata?: any }) => Promise<void>;
  refresh: () => void;
  /** Whether realtime mode is active */
  isRealtime: boolean;
}

// ============================================================================
// MAIN HOOK
// ============================================================================

/**
 * Hook for user-specific notifications with safety guards.
 * 
 * SAFETY FEATURES:
 * - User-scoped queries (bounded by recipientIds or sender.userId)
 * - Explicit limit() on all queries
 * - Respects visibility state (pauses when tab hidden)
 * - Respects ENABLE_FIRESTORE_REALTIME kill switch
 * - Falls back to polling if realtime is disabled
 * - 30-day expiry filter for automatic cleanup
 * 
 * @example
 * ```tsx
 * const { notifications, unreadCount, markAsRead } = useUserNotifications();
 * ```
 */
export function useUserNotifications(): UseUserNotificationsResult {
  const { currentUser, userData } = useAuth();
  const [notifications, setNotifications] = useState<UserNotificationView[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Visibility-aware listener management
  const { shouldMountListener, isVisible, isOnline } = useVisibilityAwareListener();

  // Refs
  const isMountedRef = useRef(true);
  const unsubscribeRef = useRef<Unsubscribe | null>(null);

  // Determine if we should use realtime
  // ADMIN/MODERATOR: Always disabled (manual refresh only) to save quota
  // OTHERS: Enabled if global flag is true and tab is visible
  const isPrivilegedUser = userData?.role === 'admin' || userData?.role === 'moderator';
  const useRealtime = ENABLE_FIRESTORE_REALTIME && shouldMountListener && !isPrivilegedUser;

  // Process notification snapshot/docs into UserNotificationView[]
  const processNotifications = useCallback(async (docs: any[]): Promise<{ notifications: UserNotificationView[], unread: number }> => {
    if (!currentUser || !userData) {
      return { notifications: [], unread: 0 };
    }

    const userNotifications: UserNotificationView[] = [];
    let unread = 0;

    for (const docData of docs) {
      const data = docData.data ? docData.data() : docData;
      const notificationId = docData.id;

      // VALIDATION: Ensure required fields exist
      let sender = data.sender;
      if (!sender || !sender.userId || !sender.userName || !sender.userRole) {
        sender = SYSTEM_SENDER;
      }

      // BACKWARD COMPATIBILITY: Handle old notification format
      let target = data.target;
      let content = data.content;
      let recipientIds = data.recipientIds;

      if (!target && data.audience) {
        target = {
          type: 'specific_users',
          specificUserIds: data.audience || []
        };
        content = data.message || data.content || '';
        recipientIds = data.audience || [];

        if (data.createdBy === 'system' && (!sender || sender.userId !== 'system')) {
          sender = SYSTEM_SENDER;
        }
      }

      // Skip invalid notifications
      if (!target || !target.type) continue;
      if (!data.title || !content || typeof content !== 'string') continue;

      const normalizedData = {
        ...data,
        sender,
        target,
        content,
        recipientIds: recipientIds || data.recipientIds || []
      };

      let visibility;
      try {
        visibility = notificationService.isNotificationVisibleToUser(
          normalizedData,
          currentUser.uid,
          userData.role,
          userData.routeId || userData.assignedRouteId || null
        );
      } catch (e) {
        continue;
      }

      if (visibility.visible) {
        const isRead = data.readByUserIds?.includes(currentUser.uid) || false;

        const canEdit = sender.userId !== 'system' &&
          (userData.role === 'admin' || userData.role === 'moderator')
          ? sender.userId === currentUser.uid
          : false;

        const canDeleteGlobally = sender.userId !== 'system' &&
          (userData.role === 'admin' ||
            (userData.role === 'moderator' && sender.userId === currentUser.uid));

        const userNotificationView: UserNotificationView = {
          id: notificationId,
          title: data.isDeletedGlobally ? 'Deleted Message' : data.title,
          content: data.isDeletedGlobally ? 'This message was deleted.' : content,
          type: data.type || 'announcement',
          sender,
          target,
          isRead,
          isEdited: data.isEdited || false,
          isDeletedGlobally: data.isDeletedGlobally || false,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          canEdit: canEdit && !data.isDeletedGlobally,
          canDeleteGlobally,
          metadata: data.metadata,
        };

        userNotifications.push(userNotificationView);

        const isSender = sender.userId === currentUser.uid;
        if (!isRead && !data.isDeletedGlobally && !isSender) {
          unread++;
        }
      }
    }

    // Filter out notifications older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentNotifications = userNotifications.filter(n => {
      const createdAt = n.createdAt?.toDate ? n.createdAt.toDate() : new Date(n.createdAt);
      return createdAt >= thirtyDaysAgo;
    });

    return { notifications: recentNotifications, unread };
  }, [currentUser?.uid, userData?.role, userData?.routeId, userData?.assignedRouteId]);

  // Fetch notifications once (for polling fallback)
  const fetchNotifications = useCallback(async () => {
    if (!currentUser || !userData) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    try {
      const notificationsRef = collection(db, 'notifications');
      let q;

      const queryLimit = (userData.role === 'admin' || userData.role === 'moderator')
        ? ADMIN_NOTIFICATION_LIMIT
        : USER_NOTIFICATION_LIMIT;

      // Query Logic:
      // - Admins/Mods use the same scoped query as regular users.
      // - Relies on auto-injection (recipientIds) for visibility.
      q = query(
        notificationsRef,
        or(
          where('recipientIds', 'array-contains', currentUser.uid),
          where('sender.userId', '==', currentUser.uid)
        ),
        orderBy('createdAt', 'desc'),
        limit(queryLimit)
      );

      const snapshot = await getDocs(q);

      if (!isMountedRef.current) return;

      const result = await processNotifications(snapshot.docs);
      setNotifications(result.notifications);
      setUnreadCount(result.unread);
      setError(null);
    } catch (err) {
      console.error('[useUserNotifications] Fetch error:', err);
      if (isMountedRef.current) {
        setError(err as Error);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [currentUser?.uid, userData?.role, processNotifications]);

  // Main effect for listener/polling
  useEffect(() => {
    isMountedRef.current = true;

    if (!currentUser || !userData) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Clean up any existing listener
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    if (useRealtime) {
      // Set up real-time listener
      const notificationsRef = collection(db, 'notifications');
      let q;

      const queryLimit = (userData.role === 'admin' || userData.role === 'moderator')
        ? ADMIN_NOTIFICATION_LIMIT
        : USER_NOTIFICATION_LIMIT;

      // Query Logic:
      // - Admins/Mods use the same scoped query as regular users (recipientIds check).
      // - This relies on 'auto-injection' in NotificationService to ensure they are recipients.
      // - This is safer than querying the whole collection.
      q = query(
        notificationsRef,
        or(
          where('recipientIds', 'array-contains', currentUser.uid),
          where('sender.userId', '==', currentUser.uid)
        ),
        orderBy('createdAt', 'desc'),
        limit(queryLimit)
      );

      unsubscribeRef.current = onSnapshot(
        q,
        async (snapshot) => {
          if (!isMountedRef.current) return;

          try {
            const result = await processNotifications(snapshot.docs);
            setNotifications(result.notifications);
            setUnreadCount(result.unread);
            setLoading(false);
            setError(null);
          } catch (err) {
            console.error('[useUserNotifications] Processing error:', err);
            setError(err as Error);
            setLoading(false);
          }
        },
        (err) => {
          console.error('[useUserNotifications] Listener error:', err);
          if (isMountedRef.current) {
            setError(err as Error);
            setLoading(false);
          }
        }
      );

      return () => {
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
          unsubscribeRef.current = null;
        }
      };
    } else {
      // Fallback to polling
      fetchNotifications();

      const pollIntervalId = setInterval(() => {
        if (isVisible && isOnline && isMountedRef.current) {
          fetchNotifications();
        }
      }, NOTIFICATION_POLLING_INTERVAL_MS);

      return () => {
        clearInterval(pollIntervalId);
      };
    }
  }, [currentUser?.uid, userData?.role, refreshTrigger, useRealtime, processNotifications, fetchNotifications, isVisible, isOnline]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    if (!currentUser) return;

    try {
      await notificationService.markAsRead(currentUser.uid, notificationId);

      // Update local state immediately
      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, isRead: true } : n
        )
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }, [currentUser]);

  // Delete notification globally
  const deleteGlobally = useCallback(async (notificationId: string) => {
    if (!currentUser || !userData) return;

    try {
      await notificationService.deleteNotificationGlobally(
        currentUser.uid,
        userData.role,
        notificationId
      );
    } catch (error) {
      console.error('Error deleting notification globally:', error);
      throw error;
    }
  }, [currentUser, userData]);

  // Edit notification
  const editNotification = useCallback(async (notificationId: string, updates: { title?: string, content: string, metadata?: any }) => {
    if (!currentUser || !userData) return;

    try {
      await notificationService.editNotification(
        currentUser.uid,
        userData.role,
        notificationId,
        updates
      );
    } catch (error) {
      console.error('Error editing notification:', error);
      throw error;
    }
  }, [currentUser, userData]);

  // Refresh notifications
  const refresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    deleteGlobally,
    editNotification,
    refresh,
    isRealtime: useRealtime,
  };
}

export default useUserNotifications;
