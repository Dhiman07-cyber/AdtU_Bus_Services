/**
 * FCM Notification Service
 * 
 * Production-grade push notification delivery for trip events.
 * 
 * Features:
 * - Idempotency guard (transaction-based notificationSent flag)
 * - Platform-specific payloads (Android, Web, iOS)
 * - Batched sends (500 tokens per sendEachForMulticast)
 * - Retry with exponential backoff for transient errors
 * - Invalid token cleanup
 * - Optimized Firestore: No extra logs/trips collections (keeps storage low)
 * - Individual student doc status updates (fcmMessage field)
 */

import { db as adminDb, messaging, FieldValue } from '@/lib/firebase-admin';
import {
  getValidTokensForRoute,
  getValidTokensForBus,
  deleteTokenByPath,
  type TokenWithMeta,
} from './fcm-token-service';

// ─── Constants ───────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;
const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_MS = 500;

const TRANSIENT_ERROR_CODES = new Set([
  'messaging/server-unavailable',
  'messaging/internal-error',
]);

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

// ─── Types ───────────────────────────────────────────────────────────────────

export type TripEventType = 'TRIP_STARTED' | 'TRIP_ENDED';

export interface NotifyRouteResult {
  success: boolean;
  successCount: number;
  failureCount: number;
  totalTokens: number;
  batchCount: number;
  invalidTokensRemoved: number;
  error?: string;
}

interface BatchSendResult {
  successCount: number;
  failureCount: number;
  invalidTokenPaths: string[];
  transientFailTokens: TokenWithMeta[];
  errors: Array<{ token: string; code: string; message: string }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const expBackoff = (attempt: number) => BASE_RETRY_MS * Math.pow(2, attempt);

// ─── Message Builder ─────────────────────────────────────────────────────────

function buildMessage(params: {
  eventType: TripEventType;
  routeId: string;
  tripId: string;
  routeName: string;
  busId: string;
  tokens: string[];
}) {
  const { eventType, routeId, tripId, routeName, busId, tokens } = params;
  const now = new Date().toISOString();

  const isStart = eventType === 'TRIP_STARTED';
  const title = isStart ? '🚌 Bus Journey Started!' : '🏁 Trip Ended';
  const body = isStart
    ? `Your bus for ${routeName} has started its journey. Track it live now!`
    : `Your bus trip for ${routeName} has ended.`;
  const clickUrl = isStart ? '/student/track-bus' : '/student';

  return {
    tokens,
    notification: { title, body },
    data: {
      type: eventType,
      routeId,
      tripId,
      busId,
      routeName,
      timestamp: now,
    },
    android: {
      priority: 'high' as const,
      notification: {
        channelId: 'bus_alerts',
        sound: 'default',
        priority: 'high' as const,
      },
    },
    webpush: {
      headers: { Urgency: 'high' },
      notification: {
        title,
        body,
        icon: '/icons/icon-192x192.svg',
        badge: '/icons/icon-72x72.svg',
        requireInteraction: isStart,
        ...(isStart ? { actions: [{ action: 'open', title: 'Track Bus' }] } : {}),
      },
      fcmOptions: { link: clickUrl },
    },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: {
        aps: {
          alert: { title, body },
          sound: 'default',
          badge: 1,
        },
      },
    },
  };
}

// ─── Batch Send with Retry ──────────────────────────────────────────────────

async function sendBatchWithRetry(
  batchTokens: TokenWithMeta[],
  messageParams: { eventType: TripEventType; routeId: string; tripId: string; routeName: string; busId: string },
  attempt: number = 0
): Promise<BatchSendResult> {
  if (!messaging) throw new Error('Firebase Admin Messaging not initialized');

  const tokenStrings = batchTokens.map(t => t.token);
  const message = buildMessage({ ...messageParams, tokens: tokenStrings });

  try {
    const response = await messaging.sendEachForMulticast(message);

    const result: BatchSendResult = {
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokenPaths: [],
      transientFailTokens: [],
      errors: [],
    };

    response.responses.forEach((resp, idx) => {
      if (resp.success) return;

      const errorCode = resp.error?.code || 'unknown';
      const errorMessage = resp.error?.message || 'Unknown error';
      const tokenMeta = batchTokens[idx];

      if (result.errors.length < 10) {
        result.errors.push({
          token: tokenMeta.token.slice(0, 20) + '...',
          code: errorCode,
          message: errorMessage,
        });
      }

      if (INVALID_TOKEN_CODES.has(errorCode)) {
        result.invalidTokenPaths.push(tokenMeta.tokenDocPath);
      } else if (TRANSIENT_ERROR_CODES.has(errorCode)) {
        result.transientFailTokens.push(tokenMeta);
      }
    });

    // Retry transient failures
    if (result.transientFailTokens.length > 0 && attempt < MAX_RETRY_ATTEMPTS) {
      const waitMs = expBackoff(attempt);
      console.log(`⚡ Retrying ${result.transientFailTokens.length} transient failures (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS})`);
      await sleep(waitMs);

      const retryResult = await sendBatchWithRetry(result.transientFailTokens, messageParams, attempt + 1);
      result.successCount += retryResult.successCount;
      result.failureCount = result.failureCount - result.transientFailTokens.length + retryResult.failureCount;
      result.invalidTokenPaths.push(...retryResult.invalidTokenPaths);
      result.errors.push(...retryResult.errors);
      result.transientFailTokens = retryResult.transientFailTokens;
    }

    return result;
  } catch (error: any) {
    // Quota errors (429) — longer backoff
    if (attempt < MAX_RETRY_ATTEMPTS && (error?.code === 429 || error?.message?.includes('429') || error?.message?.includes('quota'))) {
      const waitMs = expBackoff(attempt) * 4;
      console.error(`🚨 FCM quota exceeded, backing off ${waitMs}ms`);
      await sleep(waitMs);
      return sendBatchWithRetry(batchTokens, messageParams, attempt + 1);
    }

    // Generic transient error
    if (attempt < MAX_RETRY_ATTEMPTS) {
      const waitMs = expBackoff(attempt);
      console.warn(`⚡ Request error, retrying in ${waitMs}ms:`, error.message);
      await sleep(waitMs);
      return sendBatchWithRetry(batchTokens, messageParams, attempt + 1);
    }

    throw error;
  }
}

// ─── Firestore Updates (Non-Logging) ────────────────────────────────────────

/**
 * Updates the 'fcmMessage' field in student documents to reflect the latest status.
 * This replaces the need for an external 'fcmDeliveryLogs' collection.
 */
async function updateStudentNotifications(
  studentIds: Set<string>,
  payload: { body: string; type: TripEventType; timestamp: string }
): Promise<void> {
  if (!adminDb || studentIds.size === 0) return;

  const ids = Array.from(studentIds);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 400) {
    chunks.push(ids.slice(i, i + 400));
  }

  for (const chunk of chunks) {
    const batch = adminDb.batch();
    chunk.forEach(id => {
      const ref = adminDb.collection('students').doc(id);
      batch.update(ref, {
        fcmMessage: {
          ...payload,
          receivedAt: FieldValue.serverTimestamp()
        }
      });
    });

    try {
      await batch.commit();
    } catch (err) {
      console.warn('⚠️ Non-critical student doc update failed:', err);
    }
  }
}

// ─── Idempotency Guard ──────────────────────────────────────────────────────

async function acquireNotificationLock(busId: string, tripId: string, eventType: TripEventType): Promise<void> {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  const lockFlag = eventType === 'TRIP_ENDED' ? 'endFcmSent' : 'startFcmSent';
  const busRef = adminDb.collection('buses').doc(busId);

  await adminDb.runTransaction(async (tx) => {
    const busDoc = await tx.get(busRef);
    if (!busDoc.exists) throw new Error('BUS_NOT_FOUND');

    const data = busDoc.data();
    const lock = data?.activeTripLock;

    // Safety: ensure this lock belongs to the current trip
    if (lock?.tripId !== tripId && lock?.trip_id !== tripId) {
      console.warn(`Lock tripId mismatch: doc=${lock?.tripId}, current=${tripId}`);
    }

    if (lock?.[lockFlag]) {
      throw new Error('NOTIFICATION_ALREADY_SENT');
    }

    tx.update(busRef, {
      [`activeTripLock.${lockFlag}`]: true,
      [`activeTripLock.${lockFlag}At`]: FieldValue.serverTimestamp()
    });
  });
}

// ─── Driver Authorization ────────────────────────────────────────────────────

export async function verifyDriverRouteBinding(
  driverId: string,
  routeId: string,
  busId: string
): Promise<{ authorized: boolean; reason?: string }> {
  if (!adminDb) return { authorized: false, reason: 'Firebase Admin not initialized' };

  try {
    const driverDoc = await adminDb.collection('drivers').doc(driverId).get();
    if (!driverDoc.exists) return { authorized: false, reason: 'Driver not found' };

    const driverData = driverDoc.data();
    const driverClaimsBus = driverData?.assignedBusId === busId || driverData?.busId === busId;

    if (!driverClaimsBus) {
      const busDoc = await adminDb.collection('buses').doc(busId).get();
      if (!busDoc.exists) return { authorized: false, reason: 'Bus not found' };

      const busData = busDoc.data();
      const busClaimsDriver =
        busData?.assignedDriverId === driverId ||
        busData?.activeDriverId === driverId ||
        busData?.driverUID === driverId;

      if (!busClaimsDriver) return { authorized: false, reason: 'Driver is not assigned to this bus' };
    }

    return { authorized: true };
  } catch (error: any) {
    console.error('Error verifying driver-route binding:', error.message);
    return { authorized: false, reason: error.message };
  }
}

// ─── Token Collection ────────────────────────────────────────────────────────

/**
 * Collect all valid FCM tokens for a route and bus to ensure no student misses the notification.
 * Gets students by both Route ID and Bus ID to cast a wider net.
 */
async function collectTokens(busId: string, routeId: string): Promise<TokenWithMeta[]> {
  if (!adminDb) return [];

  const tokens: TokenWithMeta[] = [];
  const seen = new Set<string>();
  const processedStudents = new Set<string>();

  const processStudentDoc = async (doc: any) => {
    if (processedStudents.has(doc.id)) return;
    processedStudents.add(doc.id);

    try {
      // 1. Try subcollection tokens (modern approach)
      const tokensSnap = await doc.ref.collection('tokens').where('valid', '==', true).get();
      if (!tokensSnap.empty) {
        tokensSnap.docs.forEach((tDoc: any) => {
          const tData = tDoc.data();
          if (tData?.token && tData.token.length > 50 && !seen.has(tData.token)) {
            seen.add(tData.token);
            tokens.push({
              token: tData.token,
              platform: tData.platform || 'web',
              studentId: doc.id,
              tokenDocPath: tDoc.ref.path,
            });
          }
        });
      }

      // 2. Try legacy fcmToken field (fallback)
      const data = doc.data();
      if (data?.fcmToken && typeof data.fcmToken === 'string' && data.fcmToken.length > 50 && !seen.has(data.fcmToken)) {
        seen.add(data.fcmToken);
        tokens.push({
          token: data.fcmToken,
          platform: data.fcmPlatform || 'web',
          studentId: doc.id,
          tokenDocPath: `students/${doc.id}`,
        });
      }
    } catch (err) {
      console.warn(`Error compiling tokens for student ${doc.id}:`, err);
    }
  };

  try {
    // Collect students by Bus ID
    if (busId) {
      const busQueries = [
        adminDb.collection('students').where('assignedBusId', '==', busId).get(),
        adminDb.collection('students').where('busId', '==', busId).get(),
        adminDb.collection('students').where('bus_id', '==', busId).get(),
      ];

      const busSnaps = await Promise.allSettled(busQueries);
      for (const snapResult of busSnaps) {
        if (snapResult.status === 'fulfilled' && !snapResult.value.empty) {
          for (const doc of snapResult.value.docs) {
            await processStudentDoc(doc);
          }
        }
      }
    }

    // Collect students by Route ID (to ensure we don't miss any)
    if (routeId) {
      const routeQueries = [
        adminDb.collection('students').where('routeId', '==', routeId).get(),
        adminDb.collection('students').where('route_id', '==', routeId).get(),
        adminDb.collection('students').where('assignedRouteId', '==', routeId).get(),
      ];

      const routeSnaps = await Promise.allSettled(routeQueries);
      for (const snapResult of routeSnaps) {
        if (snapResult.status === 'fulfilled' && !snapResult.value.empty) {
          for (const doc of snapResult.value.docs) {
            await processStudentDoc(doc);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error fetching student tokens:', error);
  }

  return tokens;
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Send push notifications to all students on a route/bus for a trip event.
 * 
 * Supports both TRIP_STARTED and TRIP_ENDED events.
 * 
 * 1. Idempotency guard (transaction on bus doc)
 * 2. Collect tokens (broad fallback query)
 * 3. Batch send (500 per multicast)
 * 4. Cleanup invalid tokens
 * 5. Update student docs with message field
 */
/**
 * Send push notifications to all students on a route/bus for a trip event.
 * 
 * OPTIMIZED: Uses Topic-based delivery primarily. Topic-based sending is 
 * near-instant and doesn't require fetching thousands of tokens from Firestore.
 */
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

  console.log(`📢 notifyRoute [TOPIC]: routeId=${routeId}, tripId=${tripId}, busId=${busId}`);

  // 1. Idempotency guard
  if (!skipIdempotencyCheck) {
    try {
      await acquireNotificationLock(busId, tripId, eventType);
    } catch (error: any) {
      if (error.message === 'NOTIFICATION_ALREADY_SENT') {
        return {
          success: true, successCount: 0, failureCount: 0,
          totalTokens: 0, batchCount: 0, invalidTokensRemoved: 0,
          error: 'already_sent',
        };
      }
    }
  }

  // 2. PRIMARY: Send via Topic (Near-instant, handles any number of students)
  const topicResult = await notifyRouteTopic({
    routeId, tripId, routeName, busId, eventType
  });

  // 3. BACKGROUND: Update student document notification field for dashboard history
  // We do this in the background to not block the response
  (async () => {
    try {
      const studentsSnap = await adminDb.collection('students')
        .where('routeId', '==', routeId)
        .where('status', '==', 'active')
        .limit(100) // Limit to active students for dashboard history
        .get();

      if (!studentsSnap.empty) {
        const studentIds = new Set<string>(studentsSnap.docs.map(d => d.id));
        const isStart = eventType === 'TRIP_STARTED';
        const statusBody = isStart
          ? `Bus for ${routeName} has started.`
          : `Bus trip for ${routeName} has ended.`;

        await updateStudentNotifications(studentIds, {
          body: statusBody,
          type: eventType,
          timestamp: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn('Background student status update failed:', e);
    }
  })();

  return {
    success: topicResult.success,
    successCount: topicResult.success ? 1 : 0,
    failureCount: topicResult.success ? 0 : 1,
    totalTokens: 0, // Using topics
    batchCount: 1,
    invalidTokensRemoved: 0
  };
}

// ─── Legacy Token Fallback ───────────────────────────────────────────────────

async function getLegacyTokensForBus(busId: string): Promise<TokenWithMeta[]> {
  if (!adminDb) return [];

  let studentsSnap = await adminDb.collection('students').where('assignedBusId', '==', busId).get();

  if (studentsSnap.empty) {
    const alt1 = await adminDb.collection('students').where('busId', '==', busId).get();
    const alt2 = await adminDb.collection('students').where('bus_id', '==', busId).get();
    if (!alt1.empty) studentsSnap = alt1;
    else if (!alt2.empty) studentsSnap = alt2;
  }

  if (studentsSnap.empty) return [];

  const tokens: TokenWithMeta[] = [];
  const seen = new Set<string>();

  for (const doc of studentsSnap.docs) {
    const data = doc.data();
    const fcmToken = data?.fcmToken;
    if (fcmToken && typeof fcmToken === 'string' && fcmToken.length > 10 && !seen.has(fcmToken)) {
      seen.add(fcmToken);
      tokens.push({
        token: fcmToken,
        platform: data.fcmPlatform || 'web',
        studentId: doc.id,
        tokenDocPath: `students/${doc.id}`,
      });
    }
  }

  if (tokens.length > 0) {
    console.log(`📱 ${tokens.length} legacy FCM tokens found for bus ${busId}`);
  }

  return tokens;
}

// ─── Topic Notification (for large-scale routes) ─────────────────────────────

export async function notifyRouteTopic(params: {
  routeId: string;
  tripId: string;
  routeName: string;
  busId: string;
  eventType?: TripEventType;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!messaging) return { success: false, error: 'Firebase Admin Messaging not initialized' };

  const { routeId, tripId, routeName, busId } = params;
  const eventType: TripEventType = params.eventType || 'TRIP_STARTED';
  const isStart = eventType === 'TRIP_STARTED';
  const title = isStart ? '🚌 Bus Journey Started!' : '🏁 Trip Ended';
  const body = isStart
    ? `Your bus for ${routeName} has started its journey. Track it live now!`
    : `Your bus trip for ${routeName} has ended.`;

  try {
    const messageId = await messaging.send({
      topic: `route_${routeId}`,
      notification: { title, body },
      data: {
        type: eventType,
        routeId, tripId, busId, routeName,
        timestamp: new Date().toISOString(),
      },
      android: { priority: 'high', notification: { channelId: 'bus_alerts', sound: 'default' } },
      webpush: {
        headers: { Urgency: 'high' },
        notification: { title, body },
        fcmOptions: { link: isStart ? '/student/track-bus' : '/student' },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { alert: { title, body }, sound: 'default' } },
      },
    });

    console.log(`✅ Topic notification sent for route_${routeId}: ${messageId}`);
    return { success: true, messageId };
  } catch (error: any) {
    console.error(`❌ Topic notification failed for route_${routeId}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Global Topic Notification (for all registered users)
 */
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

    console.log(`✅ Global notification sent to all_users topic: ${messageId}`);
    return { success: true, messageId };
  } catch (error: any) {
    console.error('❌ Global notification failed:', error.message);
    return { success: false, error: error.message };
  }
}
