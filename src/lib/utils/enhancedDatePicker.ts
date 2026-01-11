/**
 * Enhanced Date Picker Utilities
 * 
 * Provides automatic expiry calculation for notifications
 */

export interface ExpiryDateConfig {
  date: string;      // YYYY-MM-DD format
  time: string;      // HH:MM format
  timestamp: number; // Unix timestamp in milliseconds
}

/**
 * Calculate automatic expiry for notifications based on number of days
 * 
 * Logic:
 * - If sent today with X days, expires on (today + X) at 11:59 PM
 * 
 * @param days - Number of days from now (default 1)
 * @param fromDate - Optional starting date (defaults to now)
 * @returns ExpiryDateConfig with date, time, and timestamp
 */
export function calculateExpiry(days: number = 1, fromDate?: Date): ExpiryDateConfig {
  const startDate = fromDate || new Date();

  // Calculate expiry: days - 1 from today at 11:59 PM
  // 1-day means TODAY at 11:59 PM
  // 2-day means TOMORROW at 11:59 PM
  const expiryDate = new Date(startDate);
  expiryDate.setDate(startDate.getDate() + (days - 1));
  expiryDate.setHours(23, 59, 0, 0);

  // Format date as YYYY-MM-DD
  const year = expiryDate.getFullYear();
  const month = String(expiryDate.getMonth() + 1).padStart(2, '0');
  const day = String(expiryDate.getDate()).padStart(2, '0');
  const dateString = `${year}-${month}-${day}`;

  // Format time as HH:MM
  const timeString = '23:59';

  return {
    date: dateString,
    time: timeString,
    timestamp: expiryDate.getTime()
  };
}

/**
 * Calculate automatic 2-day expiry for notifications
 */
export function calculateTwoDayExpiry(fromDate?: Date): ExpiryDateConfig {
  return calculateExpiry(2, fromDate);
}

/**
 * Check if a notification type requires auto-expiry
 * 
 * @param notificationType - The type of notification
 * @returns true if auto-expiry should be enabled
 */
export function requiresAutoExpiry(notificationType: string): boolean {
  const autoExpiryTypes = ['notice', 'pickup', 'dropoff'];
  return autoExpiryTypes.includes(notificationType.toLowerCase());
}

/**
 * Format expiry date for display
 * 
 * @param expiryConfig - ExpiryDateConfig object
 * @returns Human-readable expiry description
 */
export function formatExpiryDisplay(expiryConfig: ExpiryDateConfig): string {
  const expiryDate = new Date(expiryConfig.timestamp);
  const now = new Date();

  // Calculate days difference
  const diffTime = expiryDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const dateStr = expiryDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: expiryDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });

  if (diffDays === 0) {
    return `Today at ${expiryConfig.time}`;
  } else if (diffDays === 1) {
    return `Tomorrow at ${expiryConfig.time}`;
  } else {
    return `${dateStr} at ${expiryConfig.time}`;
  }
}

/**
 * Validate expiry date is in the future
 * 
 * @param date - Date string (YYYY-MM-DD)
 * @param time - Time string (HH:MM)
 * @returns true if valid future date/time
 */
export function isValidExpiryDateTime(date: string, time: string): boolean {
  if (!date || !time) return false;

  const expiryDateTime = new Date(`${date}T${time}`);
  const now = new Date();

  return expiryDateTime > now;
}

/**
 * Get minimum allowed expiry date (tomorrow)
 * 
 * @returns Date string in YYYY-MM-DD format
 */
export function getMinimumExpiryDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const year = tomorrow.getFullYear();
  const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const day = String(tomorrow.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
