/**
 * FCM Notification Service
 * 
 * Centralized, production-grade push notification delivery for trip events.
 * 
 * Features:
 * - Idempotency guard (transaction-based notificationSent flag)
 * - Platform-specific payloads (Android, Web, iOS)
 * - Batched sends (500 tokens per sendEachForMulticast)
 * - Retry with exponential backoff for transient errors
 * - Invalid token cleanup
 * - Delivery logging to fcmDeliveryLogs collection
 * - Structured logging for observability
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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function expBackoff(attempt: number): number {
  return BASE_RETRY_MS * Math.pow(2, attempt);
}

function isTransientError(code: string): boolean {
  return TRANSIENT_ERROR_CODES.has(code);
}

function isInvalidTokenError(code: string): boolean {
  return INVALID_TOKEN_CODES.has(code);
}

// ─── Message Builder ─────────────────────────────────────────────────────────

function buildMessage(params: {
  routeId: string;
  tripId: string;
  routeName: string;
  busId: string;
  tokens: string[];
}) {
  const { routeId, tripId, routeName, busId, tokens } = params;
  const title = '🚌 Bus Journey Started!';
  const body = `Your bus for ${routeName} has started its journey. Track it live now!`;
  const now = new Date().toISOString();

  return {
    tokens,
    notification: {
      title,
      body,
    },
    data: {
      type: 'TRIP_STARTED',
      routeId,
      tripId,
      busId,
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
      headers: {
        Urgency: 'high',
      },
      notification: {
        title,
        body,
        icon: '/icons/icon-192x192.svg',
        badge: '/icons/icon-72x72.svg',
        requireInteraction: true,
        actions: [
          {
            action: 'open',
            title: 'Track Bus'
          }
        ]
      },
      fcmOptions: {
        link: `/student/track-bus`,
      },
    },
    apns: {
      headers: {
        'apns-priority': '10',
      },
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
  messageParams: { routeId: string; tripId: string; routeName: string; busId: string },
  attempt: number = 0
): Promise<BatchSendResult> {
  if (!messaging) {
    throw new Error('Firebase Admin Messaging not initialized');
  }

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

    // Process per-token responses
    response.responses.forEach((resp, idx) => {
      if (resp.success) return;

      const errorCode = resp.error?.code || 'unknown';
      const errorMessage = resp.error?.message || 'Unknown error';
      const tokenMeta = batchTokens[idx];

      // Collect up to 10 errors for logging
      if (result.errors.length < 10) {
        result.errors.push({
          token: tokenMeta.token.slice(0, 20) + '...',
          code: errorCode,
          message: errorMessage,
        });
      }

      if (isInvalidTokenError(errorCode)) {
        result.invalidTokenPaths.push(tokenMeta.tokenDocPath);
      } else if (isTransientError(errorCode)) {
        result.transientFailTokens.push(tokenMeta);
      }
    });

    // Retry transient failures with exponential backoff
    if (result.transientFailTokens.length > 0 && attempt < MAX_RETRY_ATTEMPTS) {
      const waitMs = expBackoff(attempt);
      console.log(
        `⚡ Retrying ${result.transientFailTokens.length} transient failures (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}, wait ${waitMs}ms)`
      );
      await sleep(waitMs);

      const retryResult = await sendBatchWithRetry(
        result.transientFailTokens,
        messageParams,
        attempt + 1
      );

      // Merge retry results
      result.successCount += retryResult.successCount;
      result.failureCount =
        result.failureCount - result.transientFailTokens.length + retryResult.failureCount;
      result.invalidTokenPaths.push(...retryResult.invalidTokenPaths);
      result.errors.push(...retryResult.errors);
      result.transientFailTokens = retryResult.transientFailTokens;
    }

    return result;
  } catch (error: any) {
    // Handle quota errors (429)
    if (error?.code === 429 || error?.message?.includes('429') || error?.message?.includes('quota')) {
      console.error('🚨 FCM quota exceeded, applying global backoff');
      if (attempt < MAX_RETRY_ATTEMPTS) {
        const waitMs = expBackoff(attempt) * 4; // much longer for quota
        console.log(`⏳ Quota backoff: waiting ${waitMs}ms before retry`);
        await sleep(waitMs);
        return sendBatchWithRetry(batchTokens, messageParams, attempt + 1);
      }
    }

    // Transient error at request level
    if (attempt < MAX_RETRY_ATTEMPTS) {
      const waitMs = expBackoff(attempt);
      console.warn(`⚡ Request-level error, retrying in ${waitMs}ms:`, error.message);
      await sleep(waitMs);
      return sendBatchWithRetry(batchTokens, messageParams, attempt + 1);
    }

    throw error;
  }
}

// ─── Delivery Logging ────────────────────────────────────────────────────────

async function logDeliveryBatch(
  tripId: string,
  batchIndex: number,
  result: BatchSendResult,
  startedAt: Date,
  finishedAt: Date
): Promise<void> {
  if (!adminDb) return;

  try {
    await adminDb
      .collection('fcmDeliveryLogs')
      .doc(tripId)
      .collection('batches')
      .doc(`batch_${batchIndex}`)
      .set({
        batchIndex,
        tokensCount: result.successCount + result.failureCount,
        successCount: result.successCount,
        failureCount: result.failureCount,
        invalidTokensRemoved: result.invalidTokenPaths.length,
        errors: result.errors,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      });
  } catch (error: any) {
    console.error('Error writing delivery log:', error.message);
  }
}

async function logDeliverySummary(
  tripId: string,
  routeId: string,
  busId: string,
  totalResult: NotifyRouteResult,
  startedAt: Date,
  finishedAt: Date
): Promise<void> {
  if (!adminDb) return;

  try {
    await adminDb.collection('fcmDeliveryLogs').doc(tripId).set(
      {
        tripId,
        routeId,
        busId,
        totalTokens: totalResult.totalTokens,
        successCount: totalResult.successCount,
        failureCount: totalResult.failureCount,
        batchCount: totalResult.batchCount,
        invalidTokensRemoved: totalResult.invalidTokensRemoved,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      },
      { merge: true }
    );
  } catch (error: any) {
    console.error('Error writing delivery summary:', error.message);
  }
}

// ─── Idempotency Guard ──────────────────────────────────────────────────────

/**
 * Ensures a trip notification is only sent once, via Firestore transaction.
 * Creates the trips/{tripId} doc if it doesn't exist.
 * Throws if notification was already sent.
 */
async function acquireNotificationLock(tripId: string): Promise<void> {
  if (!adminDb) throw new Error('Firebase Admin not initialized');

  const tripRef = adminDb.collection('trips').doc(tripId);

  await adminDb.runTransaction(async (tx) => {
    const tripDoc = await tx.get(tripRef);

    if (tripDoc.exists && tripDoc.data()?.notificationSent) {
      throw new Error('NOTIFICATION_ALREADY_SENT');
    }

    if (tripDoc.exists) {
      tx.update(tripRef, {
        notificationSent: true,
        notificationSentAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.set(tripRef, {
        notificationSent: true,
        notificationSentAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  });
}

// ─── Driver Authorization ────────────────────────────────────────────────────

/**
 * Verify that a driver is authorized to send notifications for a given route.
 * Checks the driver's assigned bus and whether that bus serves the route.
 */
export async function verifyDriverRouteBinding(
  driverId: string,
  routeId: string,
  busId: string
): Promise<{ authorized: boolean; reason?: string }> {
  if (!adminDb) {
    return { authorized: false, reason: 'Firebase Admin not initialized' };
  }

  try {
    const driverDoc = await adminDb.collection('drivers').doc(driverId).get();
    if (!driverDoc.exists) {
      return { authorized: false, reason: 'Driver not found' };
    }

    const driverData = driverDoc.data();

    // Check if driver is assigned to the bus
    const driverClaimsBus =
      driverData?.assignedBusId === busId || driverData?.busId === busId;

    if (!driverClaimsBus) {
      // Also check the bus document
      const busDoc = await adminDb.collection('buses').doc(busId).get();
      if (!busDoc.exists) {
        return { authorized: false, reason: 'Bus not found' };
      }
      const busData = busDoc.data();
      const busClaimsDriver =
        busData?.assignedDriverId === driverId ||
        busData?.activeDriverId === driverId ||
        busData?.driverUID === driverId;

      if (!busClaimsDriver) {
        return { authorized: false, reason: 'Driver is not assigned to this bus' };
      }
    }

    return { authorized: true };
  } catch (error: any) {
    console.error('Error verifying driver-route binding:', error.message);
    return { authorized: false, reason: error.message };
  }
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Send push notifications to all students on a route/bus when a trip starts.
 * 
 * This is the single entry point for all trip notification logic.
 * 
 * Flow:
 * 1. Idempotency guard (transaction)
 * 2. Snapshot tokens (subcollection or legacy fallback)
 * 3. Deduplicate tokens
 * 4. Batch send (500 per batch) with retry
 * 5. Delete invalid tokens
 * 6. Write delivery logs
 * 7. Return summary
 */
export async function notifyRoute(params: {
  routeId: string;
  tripId: string;
  routeName: string;
  busId: string;
  skipIdempotencyCheck?: boolean;
}): Promise<NotifyRouteResult> {
  const { routeId, tripId, routeName, busId, skipIdempotencyCheck } = params;
  const overallStart = new Date();

  console.log(`📢 notifyRoute: routeId=${routeId}, tripId=${tripId}, busId=${busId}`);

  // 1. Idempotency guard
  if (!skipIdempotencyCheck) {
    try {
      await acquireNotificationLock(tripId);
    } catch (error: any) {
      if (error.message === 'NOTIFICATION_ALREADY_SENT') {
        console.log(`⚠️ Notification already sent for trip ${tripId}, skipping`);
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
      throw error;
    }
  }

  // 2. Snapshot tokens — try subcollection first, then legacy fallback
  let tokens = await getValidTokensForBus(busId);

  // If no subcollection tokens found, try legacy fcmToken field
  if (tokens.length === 0) {
    tokens = await getLegacyTokensForBus(busId);
  }

  // Also try route-based query if bus-based returned nothing
  if (tokens.length === 0) {
    tokens = await getValidTokensForRoute(routeId);
  }

  console.log(`📊 notifyRoute: ${tokens.length} unique tokens found`);

  if (tokens.length === 0) {
    const overallEnd = new Date();
    await logDeliverySummary(tripId, routeId, busId, {
      success: true,
      successCount: 0,
      failureCount: 0,
      totalTokens: 0,
      batchCount: 0,
      invalidTokensRemoved: 0,
    }, overallStart, overallEnd);

    return {
      success: true,
      successCount: 0,
      failureCount: 0,
      totalTokens: 0,
      batchCount: 0,
      invalidTokensRemoved: 0,
    };
  }

  // 3. Tokens already deduplicated by the token service

  // 4. Batch send
  let totalSuccess = 0;
  let totalFailure = 0;
  let totalInvalidRemoved = 0;
  let batchCount = 0;
  const allInvalidPaths: string[] = [];

  const messageParams = { routeId, tripId, routeName, busId };

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batchTokens = tokens.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE);
    batchCount++;

    console.log(
      `📤 Sending batch ${batchIndex} (${batchTokens.length} tokens) for trip ${tripId}`
    );

    const batchStart = new Date();

    try {
      const result = await sendBatchWithRetry(batchTokens, messageParams);

      totalSuccess += result.successCount;
      totalFailure += result.failureCount;
      totalInvalidRemoved += result.invalidTokenPaths.length;
      allInvalidPaths.push(...result.invalidTokenPaths);

      const batchEnd = new Date();
      await logDeliveryBatch(tripId, batchIndex, result, batchStart, batchEnd);

      console.log(
        `✅ Batch ${batchIndex}: ${result.successCount} success, ${result.failureCount} failed, ${result.invalidTokenPaths.length} invalid removed`
      );
    } catch (error: any) {
      console.error(`❌ Batch ${batchIndex} failed entirely:`, error.message);
      totalFailure += batchTokens.length;

      const batchEnd = new Date();
      await logDeliveryBatch(
        tripId,
        batchIndex,
        {
          successCount: 0,
          failureCount: batchTokens.length,
          invalidTokenPaths: [],
          transientFailTokens: [],
          errors: [{ token: 'batch', code: 'batch_error', message: error.message }],
        },
        batchStart,
        batchEnd
      );
    }
  }

  // 5. Delete invalid tokens
  for (const path of allInvalidPaths) {
    await deleteTokenByPath(path);
  }

  // 6. Write delivery summary
  const overallEnd = new Date();
  const summary: NotifyRouteResult = {
    success: true,
    successCount: totalSuccess,
    failureCount: totalFailure,
    totalTokens: tokens.length,
    batchCount,
    invalidTokensRemoved: totalInvalidRemoved,
  };

  await logDeliverySummary(tripId, routeId, busId, summary, overallStart, overallEnd);

  console.log(
    `📊 notifyRoute complete: ${totalSuccess}/${tokens.length} delivered, ${totalInvalidRemoved} invalid tokens removed`
  );

  return summary;
}

// ─── Legacy Token Fallback ───────────────────────────────────────────────────

/**
 * Fallback: read legacy fcmToken field from student documents.
 * Used during migration period when some students haven't been migrated.
 */
async function getLegacyTokensForBus(busId: string): Promise<TokenWithMeta[]> {
  if (!adminDb) return [];

  let studentsSnap = await adminDb
    .collection('students')
    .where('assignedBusId', '==', busId)
    .get();

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
        tokenDocPath: `students/${doc.id}`, // legacy — will clear fcmToken field
      });
    }
  }

  if (tokens.length > 0) {
    console.log(`📱 Found ${tokens.length} legacy FCM tokens for bus ${busId}`);
  }

  return tokens;
}

// ─── Topic Fallback (for large-scale routes) ─────────────────────────────────

/**
 * Send notification via topic for routes with very large student counts.
 * Students must be subscribed to topic `route_{routeId}` client-side.
 */
export async function notifyRouteTopic(params: {
  routeId: string;
  tripId: string;
  routeName: string;
  busId: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!messaging) {
    return { success: false, error: 'Firebase Admin Messaging not initialized' };
  }

  const { routeId, tripId, routeName, busId } = params;
  const title = '🚌 Bus Journey Started!';
  const body = `Your bus for ${routeName} has started its journey. Track it live now!`;

  try {
    const messageId = await messaging.send({
      topic: `route_${routeId}`,
      notification: { title, body },
      data: {
        type: 'TRIP_STARTED',
        routeId,
        tripId,
        busId,
        timestamp: new Date().toISOString(),
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'bus_alerts',
          sound: 'default',
        },
      },
      webpush: {
        headers: { Urgency: 'high' },
        notification: { 
          title, 
          body,
          actions: [
            {
              action: 'open',
              title: 'Track Bus'
            }
          ]
        },
        fcmOptions: { link: `/student/track-bus` },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: {
          aps: {
            alert: { title, body },
            sound: 'default',
          },
        },
      },
    });

    console.log(`✅ Topic notification sent for route_${routeId}: ${messageId}`);
    return { success: true, messageId };
  } catch (error: any) {
    console.error(`❌ Topic notification failed for route_${routeId}:`, error.message);
    return { success: false, error: error.message };
  }
}
