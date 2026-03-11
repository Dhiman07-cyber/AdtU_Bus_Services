"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/contexts/toast-context";
import { 
  requestNotificationPermission, 
  getFCMToken, 
  saveFCMToken,
  onForegroundMessage
} from "@/lib/fcm-service";

/**
 * FCMTokenManager — Handles FCM token lifecycle
 * 
 * Key design decisions for token stability:
 * 1. Firebase's getToken() already returns a STABLE token for the same
 *    browser + service worker pair. It only changes when:
 *    - The user deletes the service worker registration
 *    - The user clears browser storage/IndexedDB
 *    - Firebase rotates the token (rare, weeks/months apart)
 * 
 * 2. We cache the last-known token in localStorage to avoid redundant
 *    server-side saves when the token hasn't changed.
 * 
 * 3. On each app load, we check: has the token changed since last save?
 *    If yes → save to Firestore. If no → skip.
 * 
 * 4. Token is persisted to the user's Firestore document (students/{uid}.fcmToken),
 *    NOT a separate collection. This makes it trivially queryable from server-side
 *    notification senders.
 */
export function FCMTokenManager() {
  const { currentUser } = useAuth();
  const { addToast } = useToast();
  const [isSupported, setIsSupported] = useState(true);
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Prevent double initialization in React Strict Mode
    if (hasInitialized.current) return;

    const initializeFCM = async () => {
      // Check if FCM is supported in browser
      if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        setIsSupported(false);
        console.log('⚠️ FCM not supported in this browser environment');
        return;
      }

      if (!currentUser?.uid) return;

      hasInitialized.current = true;

      try {
        // Step 1: Request notification permission
        const hasPermission = await requestNotificationPermission();
        if (!hasPermission) {
          console.log('📵 Notification permission not granted');
          return;
        }

        // Step 2: Get FCM token from Firebase  
        // This token is STABLE for the same browser+SW pair.
        // Firebase SDK uses IndexedDB internally to persist it.
        const fcmToken = await getFCMToken();
        if (!fcmToken) {
          console.log('⚠️ FCM token not available (push service may be unavailable in dev)');
          return;
        }

        // Step 3: Check local cache — skip server call if token unchanged
        const lsKey = `fcm_device_token_${currentUser.uid}`;
        const cachedToken = localStorage.getItem(lsKey);

        if (cachedToken === fcmToken) {
          console.log('✅ FCM token unchanged — already synced with database');
          return;
        }

        // Token is new or changed → save it
        console.log('🔑 FCM token obtained/changed, saving to database...');
        if (cachedToken) {
          console.log('ℹ️ Previous token existed — token was refreshed by Firebase');
        } else {
          console.log('ℹ️ First time saving FCM token for this user/device');
        }

        // Step 4: Get auth ID token for API call
        const idToken = await currentUser.getIdToken();

        // Step 5: Save FCM token to Firestore via API
        const saved = await saveFCMToken(currentUser.uid, fcmToken, 'web', idToken);
        if (saved) {
          console.log('✅ FCM token saved to database successfully');
          localStorage.setItem(lsKey, fcmToken); // Update local cache
        } else {
          console.warn('⚠️ Could not save FCM token (user doc may not exist yet)');
          // Don't cache — will retry on next page load
        }
      } catch (error) {
        // CRITICAL: Never let FCM errors crash the host page
        console.warn('⚠️ FCM initialization failed (non-critical):', error);
      }
    };

    if (currentUser) {
      initializeFCM();
    }

    return () => {
      // Allow re-init if user changes (logout + login as different user)
      if (!currentUser) {
        hasInitialized.current = false;
      }
    };
  }, [currentUser]);

  // Listen for token refresh events
  useEffect(() => {
    if (!isSupported || !currentUser?.uid) return;

    // Firebase SDK fires onMessage for foreground messages
    // The token refresh is handled automatically by getToken() 
    // returning a new value on next call
    let unsubscribe: (() => void) | null = null;

    try {
      unsubscribe = onForegroundMessage((payload) => {
        console.log('📩 Foreground message received:', payload);
      });
    } catch {
      // Silently fail - foreground messaging not critical
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [isSupported, currentUser, addToast]);

  // This component doesn't render any UI
  return null;
}