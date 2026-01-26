"use client";

import { useState, useEffect, useCallback } from 'react';
import { getFCMToken, requestNotificationPermission } from '@/lib/fcm-service';

export const useFCMToken = () => {
    const [fcmToken, setFcmToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const requestPermission = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const granted = await requestNotificationPermission();
            if (granted) {
                const token = await getFCMToken();
                setFcmToken(token);
                return token;
            } else {
                setError('Notification permission denied');
                return null;
            }
        } catch (err: any) {
            console.error('Error requesting notification permission:', err);
            setError(err.message || 'Failed to get notification permission');
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const fetchToken = async () => {
            try {
                const token = await getFCMToken();
                if (token) {
                    setFcmToken(token);
                }
            } catch (err) {
                console.error('Error fetching initial FCM token:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchToken();
    }, []);

    return {
        fcmToken,
        loading,
        error,
        requestPermission
    };
};
