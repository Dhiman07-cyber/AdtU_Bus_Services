// Firebase Cloud Messaging Service Worker
// This file MUST be accessible at /firebase-messaging-sw.js (root path)

// Import Firebase SDK - version MUST match client firebase package (check package.json)
importScripts('https://www.gstatic.com/firebasejs/12.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.8.0/firebase-messaging-compat.js');

// Firebase configuration - Extract dynamically from URL params to prevent leaking in source code
const urlParams = new URL(location).searchParams;
const firebaseConfig = {
  apiKey: urlParams.get("apiKey"),
  authDomain: urlParams.get("authDomain"),
  projectId: urlParams.get("projectId"),
  storageBucket: urlParams.get("storageBucket"),
  messagingSenderId: urlParams.get("messagingSenderId"),
  appId: urlParams.get("appId"),
};

// Initialize Firebase safely
try {
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    firebase.initializeApp(firebaseConfig);
    console.log('🔔 Firebase initialized in service worker');
  } else {
    console.warn('⚠️ Firebase config missing in SW url params. Push notifications might fail.');
  }
} catch (error) {
  console.error('❌ Firebase initialization failed in service worker:', error);
}

// Retrieve Firebase Messaging object
let messaging;
try {
  messaging = firebase.messaging();
  console.log('🔔 Firebase Messaging initialized in service worker');
} catch (error) {
  console.error('❌ Firebase Messaging initialization failed:', error);
}

// Handle background messages
if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    console.log('🔔 Received background message:', payload);
    
    try {
      const notificationTitle = payload.notification?.title || 'Bus Notification';
      const notificationBody = payload.notification?.body || 'You have a new notification';
      
      // Build click URL from data payload
      const data = payload.data || {};
      let clickUrl = '/';
      if ((data.type === 'TRIP_STARTED' || data.type === 'trip_started')) {
        clickUrl = `/student/track-bus`;
      }

      const notificationOptions = {
        body: notificationBody,
        icon: '/icons/icon-192x192.svg',
        badge: '/icons/icon-72x72.svg',
        tag: data.tripId || 'bus-notification',
        requireInteraction: true,
        data: {
          ...data,
          click_action: clickUrl,
        }
      };

      // Only add Track Bus action for trip start events
      if (data.type === 'TRIP_STARTED' || data.type === 'trip_started') {
        notificationOptions.actions = [
          {
            action: 'open',
            title: 'Track Bus'
          }
        ];
      }

      // Only manual show if Firebase doesn't automatically show it
      // Firebase Web SDK automatically displays notifications if payload.notification is present.
      if (!payload.notification) {
        return self.registration.showNotification(notificationTitle, notificationOptions);
      } else {
        console.log('🔔 FCM SDK will auto-show the notification. Skipping manual showNotification to avoid duplicates.');
      }
    } catch (error) {
      console.error('❌ Error showing notification:', error);
    }
  });
} else {
  console.error('❌ Firebase Messaging not available in service worker');
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notification clicked:', event);

  event.notification.close();

  // Get the click URL from notification data
  const data = event.notification.data || {};
  
  // Extract clickUrl. FCM Web SDK nests custom data under FCM_MSG.data
  let clickAction = '/';
  if (data.click_action) {
    clickAction = data.click_action;
  } else if (data.FCM_MSG && data.FCM_MSG.data) {
    const fcmData = data.FCM_MSG.data;
    if ((fcmData.type === 'TRIP_STARTED' || fcmData.type === 'trip_started')) {
      clickAction = `/student/track-bus`;
    }
  }

  // Build full URL for navigation
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if any existing window is available
        for (const client of clientList) {
          try {
            // Focus existing window and navigate
            return client.focus().then(() => client.navigate(clickAction));
          } catch (e) {
            // Continue to next client
          }
        }

        // Open new window if no existing one found
        console.log('🔔 Opening new window:', clickAction);
        return clients.openWindow(clickAction);
      })
      .catch((error) => {
        console.error('❌ Error handling notification click:', error);
        return clients.openWindow('/');
      })
  );
});

// Service worker installation - skip waiting to activate immediately
self.addEventListener('install', (event) => {
  console.log('🔔 Service worker installing...');
  self.skipWaiting();
});

// Service worker activation - claim all clients immediately
self.addEventListener('activate', (event) => {
  console.log('🔔 Service worker activated');
  event.waitUntil(self.clients.claim());
});