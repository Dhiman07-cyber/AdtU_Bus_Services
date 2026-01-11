/**
 * Client-side utility to trigger cleanup of expired notifications
 */

export async function cleanupExpiredNotifications(): Promise<{ success: boolean; deletedCount: number }> {
  try {
    const response = await fetch('/api/notifications/cleanup-expired', {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error('Failed to cleanup expired notifications');
    }

    const result = await response.json();
    return {
      success: result.success,
      deletedCount: result.deletedCount || 0
    };
  } catch (error) {
    console.error('Error cleaning up expired notifications:', error);
    return {
      success: false,
      deletedCount: 0
    };
  }
}

/**
 * Check if a notification is currently active based on start/end dates
 */
export function isNotificationActive(startDate: any, endDate: any): boolean {
  const now = new Date();
  
  let start: Date;
  let end: Date;
  
  // Handle Firestore Timestamp
  if (startDate && typeof startDate.toDate === 'function') {
    start = startDate.toDate();
  } else if (startDate) {
    start = new Date(startDate);
  } else {
    return true; // If no start date, assume active
  }
  
  if (endDate && typeof endDate.toDate === 'function') {
    end = endDate.toDate();
  } else if (endDate) {
    end = new Date(endDate);
  } else {
    return true; // If no end date, assume active
  }
  
  return now >= start && now <= end;
}

/**
 * Filter notifications to only show active ones
 */
export function filterActiveNotifications<T extends { startDate?: any; endDate?: any }>(
  notifications: T[]
): T[] {
  return notifications.filter(notification => 
    isNotificationActive(notification.startDate, notification.endDate)
  );
}

