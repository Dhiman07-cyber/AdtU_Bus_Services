/**
 * FCM Notification Service
 * 
 * Server-side Firebase Cloud Messaging service for sending push notifications
 * Used primarily for Trip (trip start/stop) notifications
 */

import { getMessaging } from 'firebase-admin/messaging';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Send FCM notification to specific users by UIDs
 */
export async function sendFCMToUsers(
  adminApp: any,
  userUIDs: string[],
  notification: {
    title: string;
    body: string;
    data?: Record<string, string>;
  }
) {
  if (!adminApp) {
    throw new Error('Firebase Admin not initialized');
  }

  const messaging = getMessaging(adminApp);
  const db = getFirestore(adminApp);

  // Fetch FCM tokens from Supabase or Firestore (depending on your setup)
  // For now, we'll fetch from Firestore students collection
  const tokens: string[] = [];

  for (const uid of userUIDs) {
    try {
      const studentDoc = await db.collection('students').doc(uid).get();
      if (studentDoc.exists) {
        const fcmToken = studentDoc.data()?.fcmToken;
        if (fcmToken && typeof fcmToken === 'string') {
          tokens.push(fcmToken);
        }
      }
    } catch (error) {
      console.error(`Error fetching FCM token for ${uid}:`, error);
    }
  }

  if (tokens.length === 0) {
    console.log('No FCM tokens found for users');
    return { success: false, sentCount: 0 };
  }

  // Send multicast message
  try {
    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: notification.data || {},
      tokens: tokens,
    };

    const response = await messaging.sendEachForMulticast(message);

    console.log(`FCM sent: ${response.successCount} succeeded, ${response.failureCount} failed`);

    return {
      success: true,
      sentCount: response.successCount,
      failedCount: response.failureCount,
      responses: response.responses
    };
  } catch (error) {
    console.error('Error sending FCM:', error);
    throw error;
  }
}

/**
 * Send Trip notification (start/stop) to students on a route
 */
export async function sendTripNotification(
  adminApp: any,
  tripData: {
    type: 'start' | 'stop';
    busId: string;
    busNumber: string;
    routeId: string;
    routeName: string;
    driverName: string;
  }
) {
  const db = getFirestore(adminApp);

  // Get students assigned to this route
  const studentsSnapshot = await db
    .collection('students')
    .where('routeId', '==', tripData.routeId)
    .get();

  const studentUIDs = studentsSnapshot.docs.map(doc => doc.id);

  if (studentUIDs.length === 0) {
    console.log('No students found for route:', tripData.routeId);
    return { success: false, sentCount: 0 };
  }

  const title = tripData.type === 'start'
    ? `🚌 Trip Started - ${tripData.busNumber}`
    : `🛑 Trip Ended - ${tripData.busNumber}`;

  const body = tripData.type === 'start'
    ? `Your bus (${tripData.busNumber}) has started on ${tripData.routeName}. Driver: ${tripData.driverName}.`
    : `Your bus (${tripData.busNumber}) has completed the trip on ${tripData.routeName}.`;

  return await sendFCMToUsers(adminApp, studentUIDs, {
    title,
    body,
    data: {
      type: 'trip',
      tripType: tripData.type,
      busId: tripData.busId,
      routeId: tripData.routeId,
      timestamp: Date.now().toString()
    }
  });
}

/**
 * Send FCM based on notification audience
 */
export async function sendFCMByAudience(
  adminApp: any,
  audience: {
    scope: 'all' | 'shift' | 'route';
    shift: string | null;
    routes: string[];
  },
  notification: {
    title: string;
    body: string;
    data?: Record<string, string>;
  }
) {
  const db = getFirestore(adminApp);
  let query = db.collection('students');

  if (audience.scope === 'shift' && audience.shift) {
    query = query.where('shift', '==', audience.shift.charAt(0).toUpperCase() + audience.shift.slice(1)) as any;
  } else if (audience.scope === 'route' && audience.routes.length > 0) {
    // Firestore 'in' limit is 10
    query = query.where('routeId', 'in', audience.routes.slice(0, 10)) as any;
  }

  const snapshot = await query.get();
  const studentUIDs = snapshot.docs.map(doc => doc.id);

  if (studentUIDs.length === 0) {
    return { success: false, sentCount: 0 };
  }

  return await sendFCMToUsers(adminApp, studentUIDs, notification);
}

