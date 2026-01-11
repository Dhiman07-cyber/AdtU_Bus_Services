/**
 * Edit handler - manages notification editing with permission validation
 */

import { UserRole } from './types';
import { canEdit } from './permissions';

export interface EditResult {
  success: boolean;
  updatedContent?: string;
  editedAt?: Date;
  error?: string;
}

export interface EditHistory {
  editedAt: Date;
  previousContent: string;
  editedBy: string;
}

/**
 * Handle notification edit
 * Only sender can edit (except drivers who cannot edit at all)
 * Updates content for all recipients
 */
export async function editNotification(
  notificationId: string,
  newContent: string,
  userId: string,
  userRole: UserRole,
  notificationSenderId: string,
  notificationSenderRole: UserRole,
  currentContent: string,
  updateFunction: (id: string, content: string, history: EditHistory) => Promise<void>
): Promise<EditResult> {
  // Validate content
  if (!newContent || newContent.trim().length === 0) {
    return {
      success: false,
      error: 'Content cannot be empty',
    };
  }

  if (newContent === currentContent) {
    return {
      success: false,
      error: 'No changes detected',
    };
  }

  // Check permission
  const permCheck = canEdit(userRole, userId, notificationSenderId, notificationSenderRole);
  if (!permCheck.allowed) {
    return {
      success: false,
      error: permCheck.reason,
    };
  }

  try {
    const editTimestamp = new Date();
    
    // Create edit history entry
    const historyEntry: EditHistory = {
      editedAt: editTimestamp,
      previousContent: currentContent,
      editedBy: userId,
    };

    // Update the notification
    await updateFunction(notificationId, newContent, historyEntry);
    
    return {
      success: true,
      updatedContent: newContent,
      editedAt: editTimestamp,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Format edit indicator for UI display
 */
export function getEditIndicator(
  isEdited: boolean,
  lastEditedAt?: Date
): string {
  if (!isEdited || !lastEditedAt) {
    return '';
  }
  
  const now = new Date();
  const diffMs = now.getTime() - lastEditedAt.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) {
    return '(edited just now)';
  } else if (diffMins < 60) {
    return `(edited ${diffMins}m ago)`;
  } else if (diffMins < 1440) {
    const hours = Math.floor(diffMins / 60);
    return `(edited ${hours}h ago)`;
  } else {
    const days = Math.floor(diffMins / 1440);
    return `(edited ${days}d ago)`;
  }
}

/**
 * Validate edit permissions before showing edit button
 */
export function canShowEditButton(
  userRole: UserRole,
  userId: string,
  notificationSenderId: string,
  isDeletedGlobally: boolean
): boolean {
  // Cannot edit deleted notifications
  if (isDeletedGlobally) {
    return false;
  }

  // Must be the sender
  if (userId !== notificationSenderId) {
    return false;
  }

  // Drivers and Students cannot edit
  if (userRole === 'driver' || userRole === 'student') {
    return false;
  }

  // Admin and Moderators can edit their own
  return userRole === 'admin' || userRole === 'moderator';
}
