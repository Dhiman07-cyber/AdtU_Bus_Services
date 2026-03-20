// Firebase Cloud Messaging Service Worker
// This file MUST be accessible at /firebase-messaging-sw.js (root path)

// Import Firebase SDK - version MUST match client firebase package
importScripts('https://www.gstatic.com/firebasejs/12.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.8.0/firebase-messaging-compat.js');

// ─── Firebase Config (from URL params) ───────────────────────────────────────
const urlParams = new URL(location).searchParams;
const firebaseConfig = {
  apiKey: urlParams.get("apiKey"),
  authDomain: urlParams.get("authDomain"),
  projectId: urlParams.get("projectId"),
  storageBucket: urlParams.get("storageBucket"),
  messagingSenderId: urlParams.get("messagingSenderId"),
  appId: urlParams.get("appId"),
};

// ─── Initialize Firebase ─────────────────────────────────────────────────────
try {
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    firebase.initializeApp(firebaseConfig);
  } else {
    console.warn('⚠️ Firebase config missing in SW. Push notifications may fail.');
  }
} catch (error) {
  console.error('❌ Firebase init failed in SW:', error);
}

let messaging;
try {
  messaging = firebase.messaging();
} catch (error) {
  console.error('❌ Firebase Messaging init failed:', error);
}

// ─── Background Message Handler ──────────────────────────────────────────────
// When the app is NOT in focus (background/closed), FCM delivers messages here.
// 
// IMPORTANT: If the FCM payload includes a `notification` key, the SDK
// auto-displays it. We ONLY manually show for data-only messages or when
// we need to customize the notification beyond what the SDK auto-shows.
if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    console.log('🔔 Background message:', payload);

    try {
      const data = payload.data || {};
      const notifTitle = payload.notification?.title;
      const notifBody = payload.notification?.body;

      // If FCM SDK will auto-show (notification key present), skip manual show
      // to avoid duplicates. The SDK handles display + click-through.
      if (payload.notification) {
        console.log('🔔 FCM SDK auto-displaying notification');
        return;
      }

      // Data-only message — we must show notification manually
      let title = 'Bus Notification';
      let body = 'You have a new notification';
      let clickUrl = '/';

      if (data.type === 'TRIP_STARTED' || data.type === 'trip_started') {
        title = '🚌 Bus Journey Started!';
        body = data.routeName
          ? `Your bus for ${data.routeName} has started its journey. Track it live now!`
          : 'Your bus has started its journey. Track it live now!';
        clickUrl = '/student/track-bus';
      } else if (data.type === 'TRIP_ENDED' || data.type === 'trip_ended') {
        title = '🏁 Trip Ended';
        body = data.routeName
          ? `Your bus trip for ${data.routeName} has ended.`
          : 'Your bus trip has ended.';
        clickUrl = '/student';
      }

      const options = {
        body,
        icon: '/icons/icon-192x192.svg',
        badge: '/icons/icon-72x72.svg',
        tag: data.tripId || `bus-${data.type || 'notification'}`,
        requireInteraction: data.type === 'TRIP_STARTED',
        data: { ...data, click_action: clickUrl },
      };

      if (data.type === 'TRIP_STARTED' || data.type === 'trip_started') {
        options.actions = [{ action: 'open', title: 'Track Bus' }];
      }

      return self.registration.showNotification(title, options);
    } catch (error) {
      console.error('❌ Error showing notification:', error);
    }
  });
}

// ─── Notification Click Handler ──────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};

  // Determine click destination
  let clickUrl = '/';
  if (data.click_action) {
    clickUrl = data.click_action;
  } else if (data.FCM_MSG?.data) {
    // FCM SDK nests custom data under FCM_MSG.data
    const fcmData = data.FCM_MSG.data;
    if (fcmData.type === 'TRIP_STARTED' || fcmData.type === 'trip_started') {
      clickUrl = '/student/track-bus';
    }
  } else if (data.type === 'TRIP_STARTED' || data.type === 'trip_started') {
    clickUrl = '/student/track-bus';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window and navigate
        for (const client of clientList) {
          try {
            return client.focus().then(() => client.navigate(clickUrl));
          } catch {
            continue;
          }
        }
        // No existing window — open new one
        return clients.openWindow(clickUrl);
      })
      .catch(() => clients.openWindow('/'))
  );
});

// ─── Service Worker Lifecycle ────────────────────────────────────────────────
self.addEventListener('install', () => {
  console.log('🔔 FCM Service Worker installing');
  self.skipWaiting(); // Activate immediately
});

self.addEventListener('activate', (event) => {
  console.log('🔔 FCM Service Worker activated');
  event.waitUntil(self.clients.claim()); // Take control of all clients
});