/**
 * Type definitions for role-based notification system
 * No hardcoded field names - using clean abstractions
 */

export type UserRole = 'admin' | 'moderator' | 'driver' | 'student';

export type TargetType =
  | 'all_users'           // Everyone
  | 'all_role'            // All of a specific role
  | 'shift_based'         // Users in specific shift(s)
  | 'bus_based'           // Students on specific bus(es)
  | 'route_based'         // Students on specific route(s)
  | 'specific_users';     // Selected individual users

export type NotificationType = 'trip' | 'notice' | 'pickup' | 'dropoff' | 'announcement';

export interface NotificationTarget {
  type: TargetType;
  roleFilter?: UserRole;           // For 'all_role' type
  shift?: 'morning' | 'evening' | 'both'; // For 'shift_based' type
  busIds?: string[];               // For 'bus_based' type
  routeIds?: string[];             // For 'route_based' type
  specificUserIds?: string[];      // For 'specific_users' type
}

export interface NotificationSender {
  userId: string;
  userName: string;
  userRole: UserRole;
  employeeId?: string;
}

export interface NotificationMetadata {
  messageId: string;
  content: string;
  sender: NotificationSender;
  target: NotificationTarget;
  createdAt: Date;
  updatedAt?: Date;
  isEdited: boolean;
  isDeletedGlobally: boolean;
  deletedByUserId?: string;
  editHistory?: Array<{
    editedAt: Date;
    previousContent: string;
    editedBy: string;
  }>;
}

export interface NotificationRecipient {
  userId: string;
  userRole: UserRole;
  routeId?: string;              // For students
  readAt?: Date;
}

export interface NotificationDocument {
  id?: string;
  title: string;
  content: string;
  type: NotificationType;
  sender: NotificationSender;
  target: NotificationTarget;
  recipientIds: string[];                  // All intended recipients
  autoInjectedRecipientIds: string[];      // Auto-added based on sender role
  readByUserIds: string[];                 // Users who have read this notification
  isEdited: boolean;
  isDeletedGlobally: boolean;
  deletedByUserId?: string;
  createdAt: any;                          // Firestore timestamp
  updatedAt?: any;                         // Firestore timestamp
  deletedAt?: any;                         // Firestore timestamp
  editHistory?: Array<{
    editedAt: Date;
    previousContent: string;
    editedBy: string;
  }>;
  expiryAt?: any;                          // Firestore timestamp for auto-deletion
  metadata?: any;                          // Additional metadata
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface VisibilityCheckResult {
  visible: boolean;
  reason?: string;
}

export interface DeleteOperation {
  operationType: 'global' | 'local';
  performedBy: string;
  performedAt: Date;
}

export interface UserNotificationView {
  id: string;
  title: string;
  content: string;
  type: NotificationType;
  sender: NotificationSender;
  target: NotificationTarget;
  isRead: boolean;
  isEdited: boolean;
  isDeletedGlobally: boolean;
  createdAt: any;
  updatedAt?: any;
  canEdit: boolean;
  canDeleteGlobally: boolean;
  expiryAt?: any;
  metadata?: any;
}

// Role hierarchy for permission checking
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 4,
  moderator: 3,
  driver: 2,
  student: 1,
};

// Helper to check if one role outranks another
export const outranks = (role1: UserRole, role2: UserRole): boolean => {
  return ROLE_HIERARCHY[role1] > ROLE_HIERARCHY[role2];
};

// System sender fallback for notifications without a sender
export const SYSTEM_SENDER: NotificationSender = {
  userId: 'system',
  userName: 'System',
  userRole: 'admin',
  employeeId: undefined
};
