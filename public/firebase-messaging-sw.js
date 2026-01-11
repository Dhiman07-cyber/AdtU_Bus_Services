// Firebase Cloud Messaging Service Worker
// This file MUST be accessible at /firebase-messaging-sw.js (root path)

// Import Firebase SDK v10 compat
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase configuration - MUST match your Firebase project
const firebaseConfig = {
  apiKey: "AIzaSyAweOaZe02jn_T8YSHUthr41gTQuOmeRQ8",
  authDomain: "adtu-bus-xq.firebaseapp.com",
  projectId: "adtu-bus-xq",
  storageBucket: "adtu-bus-xq.firebasestorage.app",
  messagingSenderId: "294353438735",
  appId: "1:294353438735:web:3f0c82a93c550c4d40fb7a",
};

// Initialize Firebase
try {
  firebase.initializeApp(firebaseConfig);
  console.log('🔔 Firebase initialized in service worker');
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
      const notificationOptions = {
        body: payload.notification?.body || 'You have a new notification',
        icon: '/icons/icon-192x192.svg',
        badge: '/icons/icon-72x72.svg',
        tag: 'bus-notification',
        requireInteraction: true,
        actions: [
          {
            action: 'open',
            title: 'Open App'
          }
        ]
      };

      return self.registration.showNotification(notificationTitle, notificationOptions);
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
  console.log('🔔 Notification data:', event.notification.data);

  event.notification.close();

  // Get the click action from notification data
  const clickAction = event.notification.data?.click_action || '/';

  // Open the specific page when notification is clicked
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if the app is already open
        for (const client of clientList) {
          if (client.url.includes(new URL(clickAction).origin)) {
            console.log('🔔 Focusing existing window:', client.url);
            return client.focus().then(() => client.navigate(clickAction));
          }
        }

        // Open new window if app is not open
        console.log('🔔 Opening new window:', clickAction);
        return clients.openWindow(clickAction);
      })
      .catch((error) => {
        console.error('❌ Error handling notification click:', error);
        // Fallback to opening the root page
        return clients.openWindow('/');
      })
  );
});

// Service worker installation
self.addEventListener('install', (event) => {
  console.log('🔔 Service worker installing...');
  self.skipWaiting();
});

// Service worker activation
self.addEventListener('activate', (event) => {
  console.log('🔔 Service worker activated');
  event.waitUntil(self.clients.claim());
});