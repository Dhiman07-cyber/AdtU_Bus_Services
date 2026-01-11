/**
 * Recipients resolver - handles automatic recipient injection
 * based on sender role and implements auto-copy logic
 */

import { UserRole, NotificationSender, NotificationTarget } from './types';

export interface ResolvedRecipients {
  directRecipients: string[];      // User IDs from target
  autoInjectedRecipients: string[]; // User IDs auto-added
  requiresAdminCopy: boolean;
  requiresModeratorsCopy: boolean;
}

/**
 * Resolve all recipients including auto-injected ones
 * 
 * Auto-inject rules:
 * - If Moderator sends → Admin receives
 * - If Driver sends → Admin + all Moderators receive
 */
export async function resolveRecipients(
  sender: NotificationSender,
  target: NotificationTarget,
  fetchUsers: (query: any) => Promise<Array<{ uid: string; role: UserRole; routeId?: string }>>
): Promise<ResolvedRecipients> {
  const directRecipients: string[] = [];
  const autoInjectedRecipients: string[] = [];
  let requiresAdminCopy = false;
  let requiresModeratorsCopy = false;

  // Determine auto-injection needs based on sender
  if (sender.userRole === 'moderator') {
    requiresAdminCopy = true;
  }

  if (sender.userRole === 'driver') {
    requiresAdminCopy = true;
    requiresModeratorsCopy = true;
  }

  // Resolve direct recipients based on target type
  switch (target.type) {
    case 'all_users':
      // Get all users
      const allUsers = await fetchUsers({ /* all users query */ });
      directRecipients.push(...allUsers.map(u => u.uid));
      break;

    case 'all_role':
      if (!target.roleFilter) {
        throw new Error('Role filter required for all_role target type');
      }
      // Get all users of specific role
      const roleUsers = await fetchUsers({ role: target.roleFilter });
      directRecipients.push(...roleUsers.map(u => u.uid));
      break;

    case 'route_based':
      if (!target.routeIds || target.routeIds.length === 0) {
        throw new Error('Route IDs required for route_based target type');
      }
      // Get all students on specified routes
      const routeUsers = await fetchUsers({
        role: 'student',
        routeId: { in: target.routeIds }
      });
      directRecipients.push(...routeUsers.map(u => u.uid));
      break;

    case 'specific_users':
      if (!target.specificUserIds || target.specificUserIds.length === 0) {
        throw new Error('User IDs required for specific_users target type');
      }
      directRecipients.push(...target.specificUserIds);
      break;

    default:
      throw new Error(`Unknown target type: ${target.type}`);
  }

  // Auto-inject Admin if needed
  if (requiresAdminCopy) {
    const admins = await fetchUsers({ role: 'admin' });
    const adminIds = admins.map(u => u.uid);

    // Add admins who aren't already in direct recipients
    adminIds.forEach(adminId => {
      if (!directRecipients.includes(adminId)) {
        autoInjectedRecipients.push(adminId);
      }
    });
  }

  // Auto-inject all Moderators if needed
  if (requiresModeratorsCopy) {
    const moderators = await fetchUsers({ role: 'moderator' });
    const moderatorIds = moderators.map(u => u.uid);

    // Add moderators who aren't already in direct recipients
    moderatorIds.forEach(modId => {
      if (!directRecipients.includes(modId)) {
        autoInjectedRecipients.push(modId);
      }
    });
  }

  // Remove sender from recipients (don't send to self)
  const senderIndex = directRecipients.indexOf(sender.userId);
  if (senderIndex > -1) {
    directRecipients.splice(senderIndex, 1);
  }

  const autoIndex = autoInjectedRecipients.indexOf(sender.userId);
  if (autoIndex > -1) {
    autoInjectedRecipients.splice(autoIndex, 1);
  }

  return {
    directRecipients,
    autoInjectedRecipients,
    requiresAdminCopy,
    requiresModeratorsCopy,
  };
}

/**
 * Build recipient records for database
 * Ensures no undefined values are included (Firestore rejects undefined)
 */
export function buildRecipientRecords(
  directRecipients: string[],
  autoInjectedRecipients: string[],
  userDataMap: Map<string, { role: UserRole; routeId?: string }>
) {
  const allRecipientIds = [...directRecipients, ...autoInjectedRecipients];

  return allRecipientIds.map(userId => {
    const userData = userDataMap.get(userId);

    // Build base record without undefined values
    const record: {
      userId: string;
      userRole: UserRole;
      routeId?: string | null;
      isHiddenForUser: boolean;
      readAt: null;
    } = {
      userId,
      userRole: userData?.role || 'student',
      isHiddenForUser: false,
      readAt: null,
    };

    // Only include routeId if it has a defined value
    if (userData?.routeId) {
      record.routeId = userData.routeId;
    }

    return record;
  });
}
