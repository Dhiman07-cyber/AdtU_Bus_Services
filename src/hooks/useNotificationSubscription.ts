import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/auth-context';

interface NotificationDoc {
    id: string;
    type: 'trip' | 'notice' | 'pickup' | 'dropoff';
    title: string;
    message: string;
    audience: {
        scope: 'all' | 'shift' | 'route';
        shift: string | null;
        routes: string[];
    };
    routesSummary?: Array<{
        busId: string;
        busNumber: string;
        routeId: string;
        routeName: string;
        stops: Array<{ name: string }>;
    }>;
    author: {
        uid: string;
        name: string;
        role: string;
        employeeId: string;
    };
    createdAt: any;
    sendMode?: string;
    meta?: any;
}

/**
 * Real-time subscription hook for student notifications
 * 
 * Subscribes to notifications based on student's shift and route
 * Returns notifications filtered for the current user
 */
export function useNotificationSubscription(
    studentShift: string | null,
    studentRoute: string | null,
    enabled: boolean = true
) {
    const { currentUser } = useAuth();
    const [notifications, setNotifications] = useState<NotificationDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!enabled || !studentShift || !studentRoute || !currentUser) {
            setLoading(false);
            return;
        }

        const notificationsRef = collection(db, 'notifications');

        // Filter server-side by recipientIds to fix permission errors
        const q = query(
            notificationsRef,
            where('recipientIds', 'array-contains', currentUser.uid),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const docs: NotificationDoc[] = [];

                snapshot.forEach((doc) => {
                    const data = doc.data();

                    // Handle schema compatibility (Old 'audience' vs New 'target')
                    // Query already filters by recipientIds, so we trust these differ

                    const notification: NotificationDoc = {
                        id: doc.id,
                        type: data.type || 'notice',
                        title: data.title || '',
                        message: data.message || data.content || '',
                        // Fallback for audience to prevent crashes in legacy components
                        audience: data.audience || {
                            scope: 'all',
                            shift: null,
                            routes: []
                        },
                        routesSummary: data.routesSummary,
                        // Handle author mapping
                        author: data.author || (data.sender ? {
                            uid: data.sender.userId,
                            name: data.sender.userName,
                            role: data.sender.userRole,
                            employeeId: ''
                        } : { uid: '', name: 'System', role: 'admin', employeeId: '' }),
                        createdAt: data.createdAt,
                        sendMode: data.sendMode,
                        meta: data.meta || data.metadata
                    };

                    docs.push(notification);
                });

                setNotifications(docs);
                setLoading(false);
                setError(null);
            },
            (err) => {
                console.error('Error in notification subscription:', err);
                setError(err as Error);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [studentShift, studentRoute, enabled, currentUser]);

    return { notifications, loading, error };
}

/**
 * Real-time subscription for a specific notification type
 */
export function useNotificationsByType(
    type: 'trip' | 'notice' | 'pickup' | 'dropoff',
    studentShift: string | null,
    studentRoute: string | null,
    enabled: boolean = true
) {
    const { notifications, loading, error } = useNotificationSubscription(
        studentShift,
        studentRoute,
        enabled
    );

    const filtered = notifications.filter(n => n.type === type);

    return { notifications: filtered, loading, error };
}




