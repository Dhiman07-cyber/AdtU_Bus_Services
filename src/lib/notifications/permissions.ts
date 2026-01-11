/**
 * Permission checking logic for notification operations
 * Implements strict role-based rules from specification
 */

import { 
  UserRole, 
  TargetType, 
  NotificationTarget, 
  PermissionCheckResult,
  outranks 
} from './types';

/**
 * Check if a user can send a notification to the specified target
 */
export function canSend(
  senderRole: UserRole,
  target: NotificationTarget
): PermissionCheckResult {
  // Students cannot send
  if (senderRole === 'student') {
    return { 
      allowed: false, 
      reason: 'Students cannot send notifications' 
    };
  }

  // Drivers can only send to students
  if (senderRole === 'driver') {
    if (target.type === 'all_users') {
      return { 
        allowed: false, 
        reason: 'Drivers can only send to students' 
      };
    }
    
    if (target.type === 'all_role' && target.roleFilter !== 'student') {
      return { 
        allowed: false, 
        reason: 'Drivers can only send to students' 
      };
    }
    
    if (target.type === 'specific_users') {
      // Would need to validate that all specific users are students
      // This check happens in the backend with actual user data
      return { allowed: true };
    }
    
    return { allowed: true };
  }

  // Moderators can send to everyone except Admin (or optionally include)
  if (senderRole === 'moderator') {
    // For safety, we'll allow but backend will auto-inject Admin
    return { allowed: true };
  }

  // Admin can send to anyone
  if (senderRole === 'admin') {
    return { allowed: true };
  }

  return { allowed: false, reason: 'Unknown sender role' };
}

/**
 * Check if a user can edit a notification
 */
export function canEdit(
  userRole: UserRole,
  userId: string,
  notificationSenderId: string,
  notificationSenderRole: UserRole
): PermissionCheckResult {
  // Only sender can edit
  if (userId !== notificationSenderId) {
    return { 
      allowed: false, 
      reason: 'Only the sender can edit their notification' 
    };
  }

  // Drivers cannot edit (as per spec)
  if (userRole === 'driver') {
    return { 
      allowed: false, 
      reason: 'Drivers cannot edit notifications' 
    };
  }

  // Students cannot edit (they can't send anyway)
  if (userRole === 'student') {
    return { 
      allowed: false, 
      reason: 'Students cannot edit notifications' 
    };
  }

  // Admin and Moderator can edit their own
  if (userRole === 'admin' || userRole === 'moderator') {
    return { allowed: true };
  }

  return { allowed: false, reason: 'Unknown role' };
}

/**
 * Check if a user can delete a notification globally (for everyone)
 */
export function canDeleteGlobally(
  userRole: UserRole,
  userId: string,
  notificationSenderId: string
): PermissionCheckResult {
  // Admin can delete ANY notification globally
  if (userRole === 'admin') {
    return { allowed: true };
  }

  // Moderator can delete ONLY their own notifications globally
  if (userRole === 'moderator') {
    if (userId === notificationSenderId) {
      return { allowed: true };
    }
    return { 
      allowed: false, 
      reason: 'Moderators can only delete their own notifications globally' 
    };
  }

  // Drivers and Students cannot delete globally
  if (userRole === 'driver' || userRole === 'student') {
    return { 
      allowed: false, 
      reason: `${userRole}s cannot delete notifications globally` 
    };
  }

  return { allowed: false, reason: 'Unknown role' };
}

/**
 * Check if a user can delete a notification locally (for themselves only)
 */
export function canDeleteLocally(userRole: UserRole): PermissionCheckResult {
  // All roles can delete locally (hide for themselves)
  return { allowed: true };
}

/**
 * Get available target types for a sender role
 */
export function getAvailableTargetTypes(senderRole: UserRole): TargetType[] {
  switch (senderRole) {
    case 'admin':
      return ['all_users', 'all_role', 'route_based', 'specific_users'];
    
    case 'moderator':
      return ['all_users', 'all_role', 'route_based', 'specific_users'];
    
    case 'driver':
      return ['all_role', 'route_based', 'specific_users'];
    
    case 'student':
      return []; // Students cannot send
    
    default:
      return [];
  }
}

/**
 * Get available role filters for a sender when targeting 'all_role'
 */
export function getAvailableRoleFilters(senderRole: UserRole): UserRole[] {
  switch (senderRole) {
    case 'admin':
      return ['admin', 'moderator', 'driver', 'student'];
    
    case 'moderator':
      // Can send to all except admin (admin auto-receives anyway)
      return ['moderator', 'driver', 'student'];
    
    case 'driver':
      return ['student']; // Only students
    
    case 'student':
      return []; // Cannot send
    
    default:
      return [];
  }
}

/**
 * Validate if a target is allowed for a sender role
 */
export function validateTarget(
  senderRole: UserRole,
  target: NotificationTarget
): PermissionCheckResult {
  const availableTypes = getAvailableTargetTypes(senderRole);
  
  if (!availableTypes.includes(target.type)) {
    return { 
      allowed: false, 
      reason: `${senderRole} cannot use target type: ${target.type}` 
    };
  }

  if (target.type === 'all_role' && target.roleFilter) {
    const availableRoles = getAvailableRoleFilters(senderRole);
    if (!availableRoles.includes(target.roleFilter)) {
      return { 
        allowed: false, 
        reason: `${senderRole} cannot target role: ${target.roleFilter}` 
      };
    }
  }

  return { allowed: true };
}
