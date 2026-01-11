/**
 * Notification Utility Functions
 * Safe for use in both Client and Server environments
 */

/**
 * Calculate expiry date for a notification
 * Default: expires at midnight of the same day
 * Can be customized with daysToLive parameter
 */
export function calculateNotificationExpiry(
    createdAt: Date | string,
    daysToLive: number = 0
): string {
    const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;

    // Set to midnight of the day it was created + daysToLive
    const expiry = new Date(
        created.getFullYear(),
        created.getMonth(),
        created.getDate() + daysToLive,
        23, 59, 59, 999 // End of day
    );

    return expiry.toISOString();
}
