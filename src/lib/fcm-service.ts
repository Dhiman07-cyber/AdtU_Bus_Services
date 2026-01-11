// Firebase Cloud Messaging service
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { app } from '@/lib/firebase';

// Initialize Firebase Messaging
let messaging: any;
try {
  messaging = typeof window !== 'undefined' ? getMessaging(app) : null;
} catch (error) {
  console.warn('Firebase Messaging not available:', error);
  messaging = null;
}

// Get FCM token for the current device
export const getFCMToken = async (): Promise<string | null> => {
  if (!messaging) return null;
  
  try {
    const currentToken = await getToken(messaging, { 
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY 
    });
    
    if (currentToken) {
      return currentToken;
    } else {
      console.log('No registration token available. Request permission to generate one.');
      return null;
    }
  } catch (error) {
    console.error('An error occurred while retrieving token. ', error);
    return null;
  }
};

// Request permission for notifications
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.log('This browser does not support desktop notification');
    return false;
  }
  
  if (Notification.permission === 'granted') {
    return true;
  }
  
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  
  return false;
};

// Listen for incoming messages
export const onForegroundMessage = (callback: (payload: any) => void) => {
  if (!messaging) return () => {};
  
  const unsubscribe = onMessage(messaging, (payload) => {
    console.log('Message received in foreground: ', payload);
    callback(payload);
  });
  
  return unsubscribe;
};

// Save FCM token to Firestore
export const saveFCMToken = async (userUid: string, token: string, platform: string = 'web') => {
  try {
    const response = await fetch('/api/save-fcm-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userUid, token, platform }),
    });
    
    const data = await response.json();
    return data.success;
  } catch (error) {
    console.error('Error saving FCM token:', error);
    return false;
  }
};

// Send notification to a specific user
export const sendNotification = async (
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>
) => {
  try {
    const response = await fetch('/api/send-fcm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, title, body, data }),
    });
    
    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('Error sending notification:', error);
    return false;
  }
};