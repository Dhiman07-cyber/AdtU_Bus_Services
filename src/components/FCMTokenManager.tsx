"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/contexts/toast-context";
import { 
  requestNotificationPermission, 
  getFCMToken, 
  saveFCMToken,
  onForegroundMessage
} from "@/lib/fcm-service";

export function FCMTokenManager() {
  const { currentUser } = useAuth();
  const { addToast } = useToast();
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    const initializeFCM = async () => {
      // Check if FCM is supported
      if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        setIsSupported(false);
        return;
      }

      try {
        // Request notification permission
        const hasPermission = await requestNotificationPermission();
        if (!hasPermission) {
          console.log('Notification permission not granted');
          return;
        }

        // Get FCM token
        const token = await getFCMToken();
        if (token && currentUser?.uid) {
          console.log('FCM token obtained:', token);
          // Save token to Firestore
          const saved = await saveFCMToken(currentUser.uid, token, 'web');
          if (saved) {
            console.log('FCM token saved successfully');
          } else {
            console.error('Failed to save FCM token');
          }
        }
      } catch (error) {
        console.error('Error initializing FCM:', error);
      }
    };

    if (currentUser) {
      initializeFCM();
    }
  }, [currentUser]);

  // Handle foreground messages
  useEffect(() => {
    if (!isSupported) return;

    const unsubscribe = onForegroundMessage((payload) => {
      console.log('Foreground message received:', payload);
      
      // DISABLED: Auto-toast for all FCM notifications (was causing spam on login)
      // Users can check notifications via the bell icon in navbar
      // Only log to console for debugging
      
      // Optionally show toast only for critical notifications
      // if (payload.data?.priority === 'high') {
      //   addToast(
      //     `${payload.notification?.title || 'New Notification'}: ${payload.notification?.body || 'You have a new notification'}`,
      //     'info'
      //   );
      // }
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [isSupported, addToast]);

  // We don't render anything, this component is just for managing FCM
  return null;
}