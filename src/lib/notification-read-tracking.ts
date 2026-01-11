import { getFirestore, doc, setDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Mark a notification as read for a specific user
 */
export async function markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
  try {
    const readReceiptRef = doc(db, 'notification_read_receipts', `${notificationId}_${userId}`);
    
    await setDoc(readReceiptRef, {
      notificationId,
      userId,
      readAt: new Date(),
    });
    
    console.log(`✅ Marked notification ${notificationId} as read for user ${userId}`);
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
}

/**
 * Check if a user has read a specific notification
 */
export async function hasUserReadNotification(notificationId: string, userId: string): Promise<boolean> {
  try {
    const readReceiptRef = doc(db, 'notification_read_receipts', `${notificationId}_${userId}`);
    const readReceiptDoc = await getDoc(readReceiptRef);
    
    return readReceiptDoc.exists();
  } catch (error) {
    console.error('Error checking if notification is read:', error);
    return false;
  }
}

/**
 * Get all notification IDs that a user has read
 */
export async function getReadNotificationIds(userId: string): Promise<string[]> {
  try {
    const readReceiptsRef = collection(db, 'notification_read_receipts');
    const q = query(readReceiptsRef, where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    
    const readNotificationIds: string[] = [];
    querySnapshot.forEach((doc) => {
      readNotificationIds.push(doc.data().notificationId);
    });
    
    return readNotificationIds;
  } catch (error) {
    console.error('Error getting read notification IDs:', error);
    return [];
  }
}

/**
 * Get count of unread notifications for a user
 */
export async function getUnreadNotificationCount(
  allNotificationIds: string[],
  userId: string
): Promise<number> {
  try {
    const readNotificationIds = await getReadNotificationIds(userId);
    const unreadIds = allNotificationIds.filter(id => !readNotificationIds.includes(id));
    
    return unreadIds.length;
  } catch (error) {
    console.error('Error getting unread notification count:', error);
    return 0;
  }
}



