/**
 * Visibility resolver - determines what notifications a user can see
 * Implements complex role-based visibility rules
 */

import { 
  UserRole, 
  NotificationDocument, 
  VisibilityCheckResult,
  outranks 
} from './types';

export interface UserContext {
  userId: string;
  userRole: UserRole;
  routeId?: string;
}

/**
 * Check if a user should see a notification
 * 
 * Visibility Rules:
 * - Admin sees EVERYTHING
 * - Moderator sees everything except Admin-internal messages
 * - Driver sees messages sent to them + messages they sent
 * - Student sees messages for: ALL, their route, or specifically them
 */
export function isVisibleToUser(
  notification: NotificationDocument,
  user: UserContext
): VisibilityCheckResult {
  const { metadata, recipients } = notification;

  // Check if globally deleted
  if (metadata.isDeletedGlobally) {
    return { visible: true }; // Show as "[Deleted]" in UI
  }

  // Check if hidden locally for this user
  const recipientRecord = recipients.find(r => r.userId === user.userId);
  if (recipientRecord?.isHiddenForUser) {
    return { 
      visible: false, 
      reason: 'User has hidden this notification' 
    };
  }

  // Admin sees everything
  if (user.userRole === 'admin') {
    return { visible: true };
  }

  // Check if user is in recipients list
  const isRecipient = recipients.some(r => r.userId === user.userId);
  
  if (!isRecipient) {
    return { 
      visible: false, 
      reason: 'User is not a recipient of this notification' 
    };
  }

  // Moderator: sees everything except Admin-internal
  if (user.userRole === 'moderator') {
    // If message is from Admin to only Admins, moderator shouldn't see it
    if (metadata.sender.userRole === 'admin') {
      const allRecipientsAreAdmins = recipients.every(r => r.userRole === 'admin');
      if (allRecipientsAreAdmins && !isRecipient) {
        return { 
          visible: false, 
          reason: 'Admin-internal message' 
        };
      }
    }
    return { visible: true };
  }

  // Driver: sees messages sent to them or by them
  if (user.userRole === 'driver') {
    if (metadata.sender.userId === user.userId) {
      return { visible: true }; // Sent by this driver
    }
    
    if (isRecipient) {
      // Check if message is relevant to driver
      // Driver should not see Moderator-to-Admin or Admin-to-Moderator
      if (metadata.sender.userRole === 'moderator' || metadata.sender.userRole === 'admin') {
        const hasDriverRecipients = recipients.some(r => r.userRole === 'driver');
        if (!hasDriverRecipients && !recipients.some(r => r.userId === user.userId)) {
          return { 
            visible: false, 
            reason: 'Message not relevant to drivers' 
          };
        }
      }
      return { visible: true };
    }
    
    return { 
      visible: false, 
      reason: 'Driver not involved in this message' 
    };
  }

  // Student: sees messages for ALL, their route, or specifically them
  if (user.userRole === 'student') {
    if (!isRecipient) {
      return { 
        visible: false, 
        reason: 'Student is not a recipient' 
      };
    }

    // Students should not see messages between staff roles
    const senderIsStaff = ['admin', 'moderator', 'driver'].includes(metadata.sender.userRole);
    const allRecipientsAreStaff = recipients.every(r => 
      r.userRole === 'admin' || r.userRole === 'moderator' || r.userRole === 'driver'
    );
    
    if (senderIsStaff && allRecipientsAreStaff) {
      return { 
        visible: false, 
        reason: 'Staff-internal message' 
      };
    }

    return { visible: true };
  }

  return { 
    visible: false, 
    reason: 'Unknown visibility rule' 
  };
}

/**
 * Filter notifications for a user based on visibility rules
 */
export function filterNotificationsForUser(
  notifications: NotificationDocument[],
  user: UserContext
): NotificationDocument[] {
  return notifications.filter(notification => {
    const result = isVisibleToUser(notification, user);
    return result.visible;
  });
}

/**
 * Sort notifications by date (newest first) and priority
 */
export function sortNotifications(
  notifications: NotificationDocument[]
): NotificationDocument[] {
  return notifications.sort((a, b) => {
    // Unread first
    const aUnread = a.recipients.some(r => !r.readAt);
    const bUnread = b.recipients.some(r => !r.readAt);
    
    if (aUnread && !bUnread) return -1;
    if (!aUnread && bUnread) return 1;
    
    // Then by date
    return b.metadata.createdAt.getTime() - a.metadata.createdAt.getTime();
  });
}
