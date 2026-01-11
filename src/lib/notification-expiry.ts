/**
 * Notification Expiry Management
 * Automatically delete expired notifications at midnight
 */

import { adminDb } from './firebase-admin';
import { calculateNotificationExpiry } from './notification-utils';

export { calculateNotificationExpiry };

/**
 * Delete expired notifications (run at midnight)
 * Deletes notifications where expiry date is before current date
 */
export async function deleteExpiredNotifications(): Promise<{
  deletedNotifications: number;
  deletedReceipts: number;
  errors: string[];
  debug?: any;
}> {
  const result: any = {
    deletedNotifications: 0,
    deletedReceipts: 0,
    errors: [] as string[],
    debug: { method: 'client-side-filtering', scanned: 0 }
  };

  try {
    const nowMs = Date.now();
    console.log(`🧹 Starting Robust Cleanup at ${new Date().toISOString()}`);

    // Fetch ALL notifications (robust fallback)
    // Indexes might be missing for mixed types, so we do client-side filtering
    const snapshot = await adminDb.collection('notifications').get();
    result.debug.scanned = snapshot.size;

    console.log(`   Scanned ${snapshot.size} total notifications. Checking expiry...`);

    const idsToDelete: string[] = [];

    snapshot.docs.forEach((doc: any) => {
      const data = doc.data();
      let expiryMillis = 0;

      // Normalize expiry from various possible formats
      if (data.expiryAt) {
        if (typeof data.expiryAt.toMillis === 'function') {
          expiryMillis = data.expiryAt.toMillis();
        } else if (typeof data.expiryAt === 'number') {
          expiryMillis = data.expiryAt;
        } else if (typeof data.expiryAt === 'string') {
          expiryMillis = new Date(data.expiryAt).getTime();
        } else if (data.expiryAt instanceof Date) {
          expiryMillis = data.expiryAt.getTime();
        }
      } else if (data.expiresAt) {
        // Legacy support for ISO strings
        expiryMillis = new Date(data.expiresAt).getTime();
      }

      // Check if expired
      if (expiryMillis > 0 && expiryMillis <= nowMs) {
        idsToDelete.push(doc.id);
      }
    });

    if (idsToDelete.length > 0) {
      console.log(`   Identified ${idsToDelete.length} expired notifications to delete.`);

      // Batch delete in chunks of 400
      const chunkSize = 400;
      for (let i = 0; i < idsToDelete.length; i += chunkSize) {
        const batch = adminDb.batch();
        const chunk = idsToDelete.slice(i, i + chunkSize);

        chunk.forEach(id => {
          const ref = adminDb.collection('notifications').doc(id);
          batch.delete(ref);
        });

        await batch.commit();
        console.log(`   Committed batch delete for ${chunk.length} items.`);
      }

      result.deletedNotifications = idsToDelete.length;

      // Delete receipts
      await deleteAssociatedReceipts(idsToDelete, result);
    } else {
      console.log('   No expired notifications found after scanning all docs.');
    }

    return result;
  } catch (error: any) {
    console.error('❌ Fatal error in notification expiry cleanup:', error);
    result.errors.push(`Fatal error: ${error.message}`);
    return result;
  }
}



/**
 * Helper to delete receipts for a batch of notifications
 */
async function deleteAssociatedReceipts(
  notificationIds: string[],
  result: { deletedReceipts: number; errors: string[] }
) {
  for (const notifId of notificationIds) {
    try {
      const receiptsQuery = await adminDb.collection('notification_read_receipts')
        .where('notificationId', '==', notifId)
        .get();

      if (!receiptsQuery.empty) {
        const batch = adminDb.batch();
        receiptsQuery.docs.forEach((doc: { ref: any; }) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        result.deletedReceipts += receiptsQuery.size;
      }
    } catch (error: any) {
      console.error(`   Error deleting receipts for notification ${notifId}:`, error);
      result.errors.push(`Failed to delete receipts for ${notifId}: ${error.message}`);
    }
  }
}



/**
 * Create notification with automatic expiry
 */
export async function createNotificationWithExpiry(
  notification: {
    toUid: string;
    toRole: string;
    type: string;
    title: string;
    body: string;
    links?: any;
    read?: boolean;
  },
  daysToLive: number = 0 // 0 = expires same day at midnight
): Promise<string> {
  try {
    const notifRef = adminDb.collection('notifications').doc();
    const now = new Date();
    const expiresAt = calculateNotificationExpiry(now, daysToLive);

    const notificationData = {
      notifId: notifRef.id,
      ...notification,
      read: notification.read ?? false,
      createdAt: now.toISOString(),
      expiresAt
    };

    await notifRef.set(notificationData);

    console.log(`📬 Created notification ${notifRef.id} (expires: ${expiresAt})`);

    return notifRef.id;
  } catch (error) {
    console.error('Error creating notification with expiry:', error);
    throw error;
  }
}

/**
 * Extend notification expiry (useful for important notifications)
 */
export async function extendNotificationExpiry(
  notificationId: string,
  additionalDays: number
): Promise<boolean> {
  try {
    const notifDoc = await adminDb.collection('notifications').doc(notificationId).get();

    if (!notifDoc.exists) {
      console.error('Notification not found:', notificationId);
      return false;
    }

    const currentExpiry = new Date(notifDoc.data()?.expiresAt);
    const newExpiry = new Date(currentExpiry);
    newExpiry.setDate(newExpiry.getDate() + additionalDays);

    await notifDoc.ref.update({
      expiresAt: newExpiry.toISOString(),
      expiryExtended: true,
      expiryExtendedAt: new Date().toISOString()
    });

    console.log(`⏰ Extended notification ${notificationId} expiry to: ${newExpiry.toISOString()}`);

    return true;
  } catch (error) {
    console.error('Error extending notification expiry:', error);
    return false;
  }
}

/**
 * Get count of notifications expiring today
 */
export async function getExpiringTodayCount(): Promise<number> {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    const query = await adminDb.collection('notifications')
      .where('expiresAt', '>=', startOfDay.toISOString())
      .where('expiresAt', '<=', endOfDay.toISOString())
      .get();

    return query.size;
  } catch (error) {
    console.error('Error getting expiring count:', error);
    return 0;
  }
}

