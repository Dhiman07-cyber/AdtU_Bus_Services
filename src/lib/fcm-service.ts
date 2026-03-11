// Firebase Cloud Messaging service (client-side)
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { app } from '@/lib/firebase';

// Initialize Firebase Messaging (only in browser)
let messaging: any = null;
try {
  if (typeof window !== 'undefined') {
    messaging = getMessaging(app);
  }
} catch (error) {
  // Silently fail - FCM not available (e.g., unsupported browser)
  console.warn('Firebase Messaging not available:', error);
}

// Request permission for notifications
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  
  if (Notification.permission === 'granted') {
    return true;
  }
  
  if (Notification.permission !== 'denied') {
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch {
      return false;
    }
  }
  
  return false;
};

// Get FCM token for the current device
export const getFCMToken = async (): Promise<string | null> => {
  if (!messaging) return null;
  
  try {
    // Ensure service worker is registered before requesting token
    let swRegistration: ServiceWorkerRegistration | undefined;
    try {
      // Build dynamic URL with secure env
      const swUrl = new URL('/firebase-messaging-sw.js', window.location.href);
      swUrl.searchParams.append('apiKey', process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '');
      swUrl.searchParams.append('authDomain', process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '');
      swUrl.searchParams.append('projectId', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '');
      swUrl.searchParams.append('storageBucket', process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '');
      swUrl.searchParams.append('messagingSenderId', process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '');
      swUrl.searchParams.append('appId', process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '');

      swRegistration = await navigator.serviceWorker.register(swUrl.toString());
      // Wait briefly for the SW to be ready
      await navigator.serviceWorker.ready;
    } catch (swError) {
      console.warn('Service worker registration failed, trying without explicit SW:', swError);
    }

    const tokenOptions: any = {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    };

    // Pass explicit SW registration if available
    if (swRegistration) {
      tokenOptions.serviceWorkerRegistration = swRegistration;
    }

    const currentToken = await getToken(messaging, tokenOptions);
    
    if (currentToken) {
      return currentToken;
    } else {
      console.log('No FCM token available.');
      return null;
    }
  } catch (error: any) {
    // Gracefully handle push service errors (common in dev/localhost)
    const message = error?.message || '';
    if (
      message.includes('push service') ||
      message.includes('AbortError') ||
      message.includes('Failed to register')
    ) {
      console.warn('⚠️ FCM push service unavailable (this is normal in dev):', message);
    } else {
      console.error('Error retrieving FCM token:', error);
    }
    return null;
  }
};

// Save FCM token to Firestore via API
export const saveFCMToken = async (
  userUid: string, 
  fcmToken: string, 
  platform: string = 'web', 
  idToken: string
): Promise<boolean> => {
  try {
    const response = await fetch('/api/save-fcm-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ userUid, token: fcmToken, platform }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to save FCM token. Status: ${response.status}, Details:`, errorText);
      return false;
    }
    
    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error('Error saving FCM token:', error);
    return false;
  }
};

// Listen for incoming messages (foreground only)
export const onForegroundMessage = (callback: (payload: any) => void) => {
  if (!messaging) return () => {};
  
  try {
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Message received in foreground:', payload);
      callback(payload);
    });
    return unsubscribe;
  } catch {
    // If onMessage fails, return a no-op cleanup function
    return () => {};
  }
};