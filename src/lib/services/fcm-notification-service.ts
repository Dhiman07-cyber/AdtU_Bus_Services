/**
 * Production push notifications for trip events.
 *
 * Route trip notifications use FCM topics so starting/ending a bus journey does
 * not require fetching and batching every student token during the trip request.
 */

import { db as adminDb, messaging, FieldValue } from '@/lib/firebase-admin';

export type TripEventType = 'TRIP_STARTED' | 'TRIP_ENDED';
export type RouteTopicEventType = TripEventType | 'BUS_CHANGED';

export interface NotifyRouteResult {
  success: boolean;
  successCount: number;
  failureCount: number;
  totalTokens: number;
  batchCount: number;
  invalidTokensRemoved: number;
  error?: string;
}

async function updateStudentNotifications(
  studentIds: Set<string>,
  payload: { body: string; type: TripEventType; timestamp: string }
): Promise<void> {
  if (!adminDb || studentIds.size === 0) return;

  const ids = Array.from(studentIds);
  for (let i = 0; i < ids.length; i += 400) {
    const batch = adminDb.batch();

    ids.slice(i, i + 400).forEach(id => {
      batch.update(adminDb.collection('students').doc(id), {
        fcmMessage: {
          ...payload,
          receivedAt: FieldValue.serverTimestamp(),
        },
      });
    });

    try {
      await batch.commit();
    } catch (error) {
      console.warn('Non-critical student notification status update failed:', error);
    }
  }
}

async function acquireNotificationLock(busId: string, tripId: string, eventType: TripEventType): Promise<void> {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  const lockFlag = eventType === 'TRIP_ENDED' ? 'endFcmSent' : 'startFcmSent';
  const busRef = adminDb.collection('buses').doc(busId);

  await adminDb.runTransaction(async tx => {
    const busDoc = await tx.get(busRef);
    if (!busDoc.exists) throw new Error('BUS_NOT_FOUND');

    const lock = busDoc.data()?.activeTripLock;
    if (lock?.tripId !== tripId && lock?.trip_id !== tripId) {
      console.warn(`Lock tripId mismatch: doc=${lock?.tripId || lock?.trip_id}, current=${tripId}`);
    }

    if (lock?.[lockFlag]) {
      throw new Error('NOTIFICATION_ALREADY_SENT');
    }

    tx.update(busRef, {
      [`activeTripLock.${lockFlag}`]: true,
      [`activeTripLock.${lockFlag}At`]: FieldValue.serverTimestamp(),
    });
  });
}

export async function verifyDriverRouteBinding(
  driverId: string,
  _routeId: string,
  busId: string
): Promise<{ authorized: boolean; reason?: string }> {
  if (!adminDb) return { authorized: false, reason: 'Firebase Admin not initialized' };

  try {
    const driverDoc = await adminDb.collection('drivers').doc(driverId).get();
    if (!driverDoc.exists) return { authorized: false, reason: 'Driver not found' };

    const driverData = driverDoc.data();
    const driverClaimsBus = driverData?.assignedBusId === busId || driverData?.busId === busId;
    if (driverClaimsBus) return { authorized: true };

    const busDoc = await adminDb.collection('buses').doc(busId).get();
    if (!busDoc.exists) return { authorized: false, reason: 'Bus not found' };

    const busData = busDoc.data();
    const busClaimsDriver =
      busData?.assignedDriverId === driverId ||
      busData?.activeDriverId === driverId ||
      busData?.driverUID === driverId;

    return busClaimsDriver
      ? { authorized: true }
      : { authorized: false, reason: 'Driver is not assigned to this bus' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Driver authorization failed';
    console.error('Error verifying driver-route binding:', message);
    return { authorized: false, reason: message };
  }
}

export async function notifyRoute(params: {
  routeId: string;
  tripId: string;
  routeName: string;
  busId: string;
  eventType?: TripEventType;
  skipIdempotencyCheck?: boolean;
}): Promise<NotifyRouteResult> {
  const { routeId, tripId, routeName, busId, skipIdempotencyCheck } = params;
  const eventType: TripEventType = params.eventType || 'TRIP_STARTED';

  if (!skipIdempotencyCheck) {
    try {
      await acquireNotificationLock(busId, tripId, eventType);
    } catch (error) {
      if (error instanceof Error && error.message === 'NOTIFICATION_ALREADY_SENT') {
        return {
          success: true,
          successCount: 0,
          failureCount: 0,
          totalTokens: 0,
          batchCount: 0,
          invalidTokensRemoved: 0,
          error: 'already_sent',
        };
      }
    }
  }

  const topicResult = await notifyRouteTopic({ routeId, tripId, routeName, busId, eventType });

  void (async () => {
    try {
      const studentsSnap = await adminDb.collection('students')
        .where('routeId', '==', routeId)
        .where('status', '==', 'active')
        .limit(100)
        .get();

      if (studentsSnap.empty) return;

      const isStart = eventType === 'TRIP_STARTED';
      await updateStudentNotifications(
        new Set<string>(studentsSnap.docs.map(doc => doc.id)),
        {
          body: isStart
            ? `Bus for ${routeName} has started.`
            : `Bus trip for ${routeName} has ended.`,
          type: eventType,
          timestamp: new Date().toISOString(),
        }
      );
    } catch (error) {
      console.warn('Background student status update failed:', error);
    }
  })();

  return {
    success: topicResult.success,
    successCount: topicResult.success ? 1 : 0,
    failureCount: topicResult.success ? 0 : 1,
    totalTokens: 0,
    batchCount: 1,
    invalidTokensRemoved: 0,
    error: topicResult.error,
  };
}

export async function notifyRouteTopic(params: {
  routeId: string;
  tripId?: string;
  routeName?: string;
  busId?: string;
  eventType?: RouteTopicEventType;
  title?: string;
  body?: string;
  data?: Record<string, string | number | boolean | null | undefined>;
  link?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!messaging) return { success: false, error: 'Firebase Admin Messaging not initialized' };

  const { routeId, tripId, routeName, busId } = params;
  const eventType: RouteTopicEventType = params.eventType || 'TRIP_STARTED';
  const isStart = eventType === 'TRIP_STARTED';
  const defaultTitle =
    eventType === 'BUS_CHANGED'
      ? 'Bus Changed'
      : isStart
        ? 'Bus Journey Started!'
        : 'Trip Ended';
  const defaultBody =
    eventType === 'BUS_CHANGED'
      ? 'Your route bus assignment has changed.'
      : isStart
        ? `Your bus for ${routeName || 'your route'} has started its journey. Track it live now!`
        : `Your bus trip for ${routeName || 'your route'} has ended.`;
  const link = params.link || (isStart ? '/student/track-bus' : '/student');

  const data: Record<string, string> = {
    type: eventType,
    routeId,
    timestamp: new Date().toISOString(),
  };

  if (tripId) data.tripId = tripId;
  if (busId) data.busId = busId;
  if (routeName) data.routeName = routeName;

  for (const [key, value] of Object.entries(params.data || {})) {
    if (value !== undefined && value !== null) {
      data[key] = String(value);
    }
  }

  try {
    const messageId = await messaging.send({
      topic: `route_${routeId}`,
      notification: {
        title: params.title || defaultTitle,
        body: params.body || defaultBody,
      },
      data,
      android: {
        priority: 'high',
        notification: { channelId: 'bus_alerts', sound: 'default' },
      },
      webpush: {
        headers: { Urgency: 'high' },
        notification: {
          title: params.title || defaultTitle,
          body: params.body || defaultBody,
        },
        fcmOptions: { link },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: {
          aps: {
            alert: { title: params.title || defaultTitle, body: params.body || defaultBody },
            sound: 'default',
          },
        },
      },
    });

    return { success: true, messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Topic notification failed';
    console.error(`Topic notification failed for route_${routeId}:`, message);
    return { success: false, error: message };
  }
}

export async function notifyAllUsers(params: {
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!messaging) return { success: false, error: 'Firebase Admin Messaging not initialized' };

  try {
    const messageId = await messaging.send({
      topic: 'all_users',
      notification: { title: params.title, body: params.body },
      data: params.data || {},
      android: { priority: 'high', notification: { channelId: 'announcements', sound: 'default' } },
      webpush: {
        headers: { Urgency: 'high' },
        notification: { title: params.title, body: params.body },
        fcmOptions: { link: '/dashboard' },
      },
    });

    return { success: true, messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Global notification failed';
    console.error('Global notification failed:', message);
    return { success: false, error: message };
  }
}
