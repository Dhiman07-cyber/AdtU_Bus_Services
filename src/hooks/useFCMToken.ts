"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { getToken, onMessage } from 'firebase/messaging';
import { messaging } from '@/lib/firebase';

export const useFCMToken = () => {
  const { currentUser } = useAuth();
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const isRequestingRef = useRef(false);
  const messagingRef = useRef<any>(null);

  // Use the already initialized messaging instance
  useEffect(() => {
    if (messaging && messaging !== null) {
      messagingRef.current = messaging;
      console.log('🔔 Using Firebase Messaging instance');
    } else {
      console.warn('⚠️ Firebase Messaging not available');
    }
  }, [messaging]);

  // Request notification permission and get FCM token
  const requestPermission = useCallback(async () => {
    if (isRequestingRef.current) {
      console.log('🔔 Permission request already in progress');
      return fcmToken;
    }

    try {
      isRequestingRef.current = true;
      setLoading(true);
      setError(null);

      console.log('🔔 Starting FCM token request...');

      // Check if messaging is available
      if (!messagingRef.current) {
        throw new Error('Firebase Messaging not available in this environment');
      }

      // Check browser support
      if (!('Notification' in window)) {
        throw new Error('This browser does not support notifications');
      }

      if (!('serviceWorker' in navigator)) {
        throw new Error('This browser does not support service workers');
      }

      // Check current permission
      const currentPermission = Notification.permission;
      setPermission(currentPermission);
      console.log('🔔 Current notification permission:', currentPermission);

      if (currentPermission === 'denied') {
        // Don't throw - this is user choice, not a critical error
        console.warn('⚠️ Notifications are blocked by user. They can enable later.');
        setError('Notifications blocked - enable in browser settings to receive alerts');
        return null; // Return null instead of throwing
      }

      // Request permission if needed
      if (currentPermission !== 'granted') {
        console.log('🔔 Requesting notification permission...');
        const permission = await Notification.requestPermission();
        setPermission(permission);
        console.log('🔔 Permission result:', permission);

        if (permission !== 'granted') {
          throw new Error('Notification permission denied');
        }
      }

      // Get FCM token
      console.log('🔔 Getting FCM token...');
      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

      if (!vapidKey) {
        console.warn('⚠️ VAPID key not configured - FCM may not work properly');
        throw new Error('Firebase VAPID key not configured. Please contact administrator.');
      }

      const token = await getToken(messagingRef.current, {
        vapidKey: vapidKey
      });

      if (token) {
        console.log('✅ FCM token obtained:', token.substring(0, 50) + '...');
        setFcmToken(token);

        // Register with server
        if (currentUser) {
          try {
            await registerTokenWithServer(token);
          } catch (serverError) {
            console.warn('⚠️ Failed to register token with server:', serverError);
            // Don't throw - token generation was successful
          }
        }

        return token;
      } else {
        throw new Error('Failed to get FCM token');
      }

    } catch (error: any) {
      // Only log errors that aren't user permission denials
      if (!error.message?.includes('blocked') && !error.message?.includes('denied')) {
        console.error('❌ Error getting FCM token:', error);
      } else {
        console.log('ℹ️ FCM not available:', error.message);
      }

      let errorMessage = 'Failed to enable notifications';
      if (error.message.includes('blocked') || error.message.includes('denied')) {
        errorMessage = 'Enable notifications in browser settings for trip alerts';
      } else if (error.message.includes('service worker')) {
        errorMessage = 'Service worker unavailable - try Chrome or Firefox';
      } else if (error.message.includes('not support')) {
        errorMessage = 'Browser does not support notifications';
      }

      setError(errorMessage);
      // Don't re-throw for permission errors - they're not critical
      if (error.message.includes('blocked') || error.message.includes('denied')) {
        return null;
      }
      throw error;
    } finally {
      setLoading(false);
      isRequestingRef.current = false;
    }
  }, [currentUser, fcmToken]);

  // Register token with server
  const registerTokenWithServer = async (token: string) => {
    if (!currentUser) {
      console.warn('⚠️ No authenticated user, skipping token registration');
      return;
    }

    try {
      console.log('🔔 Registering FCM token with server...');

      const idToken = await currentUser.getIdToken();
      const response = await fetch('/api/student/register-fcm-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          idToken,
          fcmToken: token
        })
      });

      const result = await response.json();

      if (response.ok) {
        console.log('✅ FCM token registered with server');
      } else {
        console.error('❌ Failed to register FCM token:', result.error);
        throw new Error(result.error || 'Failed to register FCM token');
      }

    } catch (error: any) {
      console.error('❌ Error registering FCM token with server:', error);
      throw error;
    }
  };

  // Listen for foreground messages
  useEffect(() => {
    if (!messagingRef.current) return;

    try {
      const unsubscribe = onMessage(messagingRef.current, (payload) => {
        console.log('🔔 Received foreground message:', payload);

        // Show notification if permission is granted
        if (Notification.permission === 'granted') {
          const notification = new Notification(payload.notification?.title || 'Bus Notification', {
            body: payload.notification?.body || 'You have a new notification',
            icon: '/icons/icon-192x192.svg',
            badge: '/icons/icon-72x72.svg',
            tag: 'bus-notification',
            data: payload.data
          });

          notification.onclick = () => {
            window.focus();
            notification.close();
          };
        }
      });

      return unsubscribe;
    } catch (error) {
      console.error('❌ Failed to set up foreground message listener:', error);
      return () => {}; // Return empty cleanup function
    }
  }, []);

  // Auto-request permission when user is authenticated (only once)
  useEffect(() => {
    if (
      currentUser &&
      !fcmToken &&
      !loading &&
      !isRequestingRef.current &&
      permission === 'default'
    ) {
      // Silently auto-request FCM permission
      requestPermission().catch(error => {
        // Suppress all FCM auto-request errors - not critical
        // Users can manually enable notifications if needed
        if (error) {
          console.log('ℹ️ FCM auto-request skipped:', error.message || 'User preference');
        }
      });
    }
  }, [currentUser, fcmToken, loading, permission, requestPermission]);

  return {
    fcmToken,
    loading,
    error,
    permission,
    requestPermission,
    registerTokenWithServer
  };
};