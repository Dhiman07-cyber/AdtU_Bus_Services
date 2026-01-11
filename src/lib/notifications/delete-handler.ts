/**
 * Delete handler - manages local (hide for me) and global (delete for everyone) operations
 */

import { UserRole, DeleteOperation } from './types';
import { canDeleteGlobally, canDeleteLocally } from './permissions';

export interface DeleteResult {
  success: boolean;
  operation: 'global' | 'local';
  affectedUsers?: string[];
  error?: string;
}

/**
 * Handle local delete (hide for me only)
 * Does NOT remove the notification from database
 * Marks it as hidden for the specific user
 */
export async function deleteForMe(
  notificationId: string,
  userId: string,
  userRole: UserRole,
  updateFunction: (id: string, userId: string) => Promise<void>
): Promise<DeleteResult> {
  // Check permission
  const permCheck = canDeleteLocally(userRole);
  if (!permCheck.allowed) {
    return {
      success: false,
      operation: 'local',
      error: permCheck.reason,
    };
  }

  try {
    // Update the recipient record to mark as hidden
    await updateFunction(notificationId, userId);
    
    return {
      success: true,
      operation: 'local',
      affectedUsers: [userId],
    };
  } catch (error) {
    return {
      success: false,
      operation: 'local',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Handle global delete (delete for everyone)
 * Replaces message content with "[This message was deleted]"
 * Only allowed for: Admin (any message) or Moderator (own messages only)
 */
export async function deleteForEveryone(
  notificationId: string,
  userId: string,
  userRole: UserRole,
  notificationSenderId: string,
  updateFunction: (id: string, deletedBy: string) => Promise<string[]>
): Promise<DeleteResult> {
  // Check permission
  const permCheck = canDeleteGlobally(userRole, userId, notificationSenderId);
  if (!permCheck.allowed) {
    return {
      success: false,
      operation: 'global',
      error: permCheck.reason,
    };
  }

  try {
    // Update notification to mark as globally deleted
    const affectedUsers = await updateFunction(notificationId, userId);
    
    return {
      success: true,
      operation: 'global',
      affectedUsers,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'global',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Prepare delete operation metadata
 */
export function createDeleteOperation(
  userId: string,
  operationType: 'global' | 'local'
): DeleteOperation {
  return {
    operationType,
    performedBy: userId,
    performedAt: new Date(),
  };
}

/**
 * Check if a notification is deleted and format display accordingly
 */
export function getDisplayContent(
  isDeletedGlobally: boolean,
  originalContent: string,
  deletedByName?: string
): string {
  if (isDeletedGlobally) {
    return deletedByName 
      ? `🚫 This message was deleted by ${deletedByName}`
      : '🚫 This message was deleted';
  }
  return originalContent;
}

/**
 * Get user-specific view of notification (considering local deletes)
 */
export function getUserView(
  notificationId: string,
  userId: string,
  recipients: Array<{ userId: string; isHiddenForUser: boolean }>
): { isVisible: boolean; isHidden: boolean } {
  const recipientRecord = recipients.find(r => r.userId === userId);
  
  if (!recipientRecord) {
    return { isVisible: false, isHidden: false };
  }
  
  return {
    isVisible: !recipientRecord.isHiddenForUser,
    isHidden: recipientRecord.isHiddenForUser,
  };
}
