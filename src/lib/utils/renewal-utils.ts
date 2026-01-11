/**
 * Bus Service Renewal Utilities
 * Handles date calculations for July-aligned academic year renewals
 * Uses dynamic configuration from deadline-config.json
 */

import { Timestamp } from 'firebase/firestore';
// import deadlineConfig from '@/config/deadline-config.json'; // RE MOVED: Causes HMR loop
import { DEADLINE_CONFIG as deadlineConfig } from '@/lib/types/deadline-config-defaults';
import { SimulationConfig } from '@/lib/types/simulation-config';

/**
 * Renewal anchor day: Dynamic from config (default: June 30 - end of academic service year)
 * All validUntil dates should be set to this anchor date of a year
 */
export const RENEWAL_ANCHOR_MONTH = deadlineConfig.academicYear.anchorMonth; // 0-indexed
export const RENEWAL_ANCHOR_DAY = deadlineConfig.academicYear.anchorDay;

/**
 * Calculate new validUntil date for renewal
 * Follows July-aligned academic cycle rules
 * 
 * @param currentValidUntil - Current validUntil date (or null/expired)
 * @param durationYears - Number of years to add (1-4)
 * @returns New validUntil date as ISO string
 */
export function calculateRenewalDate(
  currentValidUntil: string | null | undefined,
  durationYears: number
): { newValidUntil: string; oldValidUntil: string | null } {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-indexed

  let baseYear: number;
  let oldValidUntil: string | null = currentValidUntil || null;

  // Check if current validUntil exists and is in the future
  if (currentValidUntil) {
    const validUntilDate = new Date(currentValidUntil);

    if (validUntilDate > today) {
      // Student has active service - extend from current validUntil year
      baseYear = validUntilDate.getFullYear();
    } else {
      // Expired - treat as new enrollment from current year
      oldValidUntil = null;
      baseYear = currentYear;
    }
  } else {
    // No existing validUntil - new enrollment
    // Always use current year as base for new enrollments
    // Example: Applied in Oct 2025 with 3 years → validUntil June 30, 2028
    baseYear = currentYear;
  }

  // Calculate new year by adding duration
  const newYear = baseYear + durationYears;

  // Set to June 30 of the new year at end of day
  const newValidUntil = new Date(newYear, RENEWAL_ANCHOR_MONTH, RENEWAL_ANCHOR_DAY, 23, 59, 59, 999);

  return {
    newValidUntil: newValidUntil.toISOString(),
    oldValidUntil
  };
}

/**
 * Format date as human-readable string
 */
export function formatRenewalDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Check if a validUntil date is too far in the future (warning threshold)
 */
export function isExcessivelyLongValidity(validUntil: string): boolean {
  const date = new Date(validUntil);
  const today = new Date();
  const yearsDifference = (date.getFullYear() - today.getFullYear());

  return yearsDifference > 10;
}

/**
 * Validate renewal parameters
 */
export function validateRenewalParams(durationYears: number): {
  valid: boolean;
  error?: string;
} {
  if (!Number.isInteger(durationYears) || durationYears < 1 || durationYears > 4) {
    return {
      valid: false,
      error: 'Duration must be 1, 2, 3, or 4 years'
    };
  }

  return { valid: true };
}

/**
 * Calculate total price for renewal
 */
export function calculateRenewalPrice(durationYears: number, baseFee: number): number {
  return baseFee * durationYears;
}

/**
 * Get days until expiry
 */
export function getDaysUntilExpiry(validUntil: string | null): number {
  if (!validUntil) return 0;

  const expiryDate = new Date(validUntil);
  const now = new Date();
  const diffTime = expiryDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
}

/**
 * Check if service is expired
 */
export function isServiceExpired(validUntil: string | null): boolean {
  if (!validUntil) return true;
  return new Date(validUntil) <= new Date();
}

/**
 * Convert ISO string to Firestore Timestamp
 */
export function toFirestoreTimestamp(isoString: string): Timestamp {
  return Timestamp.fromDate(new Date(isoString));
}

/**
 * Get renewal summary text for display
 */
export function getRenewalSummary(
  studentName: string,
  oldValidUntil: string | null,
  newValidUntil: string,
  amount: number
): string {
  const oldDisplay = oldValidUntil
    ? formatRenewalDate(oldValidUntil)
    : 'Expired/New';
  const newDisplay = formatRenewalDate(newValidUntil);

  return `${studentName}: ${oldDisplay} → ${newDisplay} (₹${amount})`;
}

/**
 * RENEWAL DEADLINE SYSTEM
 * Academic year renewal cycle with enforced deadlines
 * All values loaded from deadline-config.json for easy management
 */

// Renewal notification start date
export const RENEWAL_NOTIFICATION_MONTH = deadlineConfig.renewalNotification.month;
export const RENEWAL_NOTIFICATION_DAY = deadlineConfig.renewalNotification.day;

// Renewal deadline date
export const RENEWAL_DEADLINE_MONTH = deadlineConfig.renewalDeadline.month;
export const RENEWAL_DEADLINE_DAY = deadlineConfig.renewalDeadline.day;

// Soft block date (access blocked)
export const SOFT_BLOCK_MONTH = deadlineConfig.softBlock.month;
export const SOFT_BLOCK_DAY = deadlineConfig.softBlock.day;

// Hard delete date (account deletion)
export const HARD_DELETE_MONTH = deadlineConfig.hardDelete.month;
export const HARD_DELETE_DAY = deadlineConfig.hardDelete.day;

// Urgent warning threshold
export const URGENT_WARNING_DAYS = deadlineConfig.urgentWarningThreshold.days;

/**
 * Check if student should be soft-blocked (after soft block date, not renewed)
 * 
 * LOGIC: currentYear == sessionEndYear && currentDate >= softBlockDate(sessionEndYear)
 * - Soft block happens in the SAME year as the session end
 * - Example: Session ends June 30, 2025 → Soft block starts July 31, 2025
 */
export function shouldBlockAccess(
  validUntil: string | null,
  lastRenewalDate?: string | null,
  simulationConfig?: SimulationConfig | null,
  status?: string,
  overrideConfig?: any
): boolean {
  // Explicit status check: if manually blocked, always return true
  if (status === 'soft_blocked' || status === 'hard_blocked' || status === 'pending_deletion') {
    return true;
  }

  if (!validUntil) return true; // No validity = blocked

  // REFERENCE DATE: Use simulated date if enabled, otherwise real today
  let currentDate = new Date();
  if (simulationConfig?.enabled) {
    currentDate = new Date(
      simulationConfig.customYear,
      simulationConfig.customMonth,
      simulationConfig.customDay
    );
  }

  const validDate = new Date(validUntil);

  // SESSION END YEAR: Use simulated session end year if sync is enabled
  // This satisfies the "Simulate Date will be the VALID UNTIL of student" requirement
  let sessionEndYear = validDate.getFullYear();
  if (simulationConfig?.enabled && (simulationConfig.syncSessionWithSimulatedDate || true)) {
    // If we are in simulation mode, we treat the student's session as ending in the simulated year
    // or a year relative to the simulated date to test the logic.
    // However, the cleanest implementation for testing is to assume the student's validUntil 
    // aligns with the academic cycle of the simulated year.
    sessionEndYear = simulationConfig.customYear;
  }

  const currentYear = currentDate.getFullYear();

  // EXPIRED CHECK: Relative to current reference date
  // If sync is on, we assume they are past their validUntil (June 30) for the sake of tests
  const isExpired = (simulationConfig?.enabled)
    ? true // In simulation mode, we are testing the post-expiry behavior
    : validDate < currentDate;

  if (!isExpired) {
    return false; // Still valid, don't block
  }

  // Soft block only happens in the SAME year as session end
  if (currentYear !== sessionEndYear) {
    // If we are in a different year than session end:
    // - If later year: should be hard deleted, but soft block is also implicitly true
    return currentYear > sessionEndYear;
  }

  // We're in the same year as session end - check soft block date
  // We're in the same year as session end - check soft block date
  const config = overrideConfig || deadlineConfig;
  const softBlockDate = new Date(
    sessionEndYear,
    config.softBlock.month,
    config.softBlock.day,
    config.softBlock.hour || 0,
    config.softBlock.minute || 0,
    0
  );

  if (currentDate >= softBlockDate) {
    // Past soft block date - check if renewed after expiry
    if (lastRenewalDate) {
      const renewalDate = new Date(lastRenewalDate);
      if (renewalDate > validDate) {
        return false;
      }
    }
    return true; // Block access
  }

  return false; // Before soft block date
}

/**
 * Check if student should be hard-deleted (after hard delete date, not renewed)
 * 
 * LOGIC: currentYear >= sessionEndYear + 1 && currentDate >= hardDeleteDate(sessionEndYear + 1)
 * - Hard delete happens in the NEXT year after session end
 * - Example: Session ends June 30, 2025 → Hard delete starts August 31, 2026
 */
export function shouldHardDelete(
  validUntil: string | null,
  lastRenewalDate?: string | null,
  simulationConfig?: SimulationConfig | null,
  overrideConfig?: any
): boolean {
  if (!validUntil) {
    return true; // No validity = should be deleted
  }

  // REFERENCE DATE: Use simulated date if enabled, otherwise real today
  let currentDate = new Date();
  if (simulationConfig?.enabled) {
    currentDate = new Date(
      simulationConfig.customYear,
      simulationConfig.customMonth,
      simulationConfig.customDay
    );
  }

  const validDate = new Date(validUntil);

  // SESSION END YEAR
  let sessionEndYear = validDate.getFullYear();
  if (simulationConfig?.enabled) {
    // If we are in simulation mode, we test as if their session ended in OR BEFORE the simulated year
    sessionEndYear = validDate.getFullYear();
    // Wait, if "Simulate Date will be the VALID UNTIL of student", 
    // it means if simulated date is 2026, we test as if they expired in 2025?
    // Actually, usually admin wants to see "If they expired in 2025, and today is 2026, are they deleted?"
  }

  const hardDeleteYear = sessionEndYear + 1; // Hard delete is in the NEXT year
  const currentYear = currentDate.getFullYear();

  // Hard delete only happens in years AFTER session end year
  if (currentYear < hardDeleteYear) {
    return false; // Not yet in the hard delete year
  }

  // We're in or past the hard delete year - check the date
  // We're in or past the hard delete year - check the date
  const config = overrideConfig || deadlineConfig;
  const hardDeleteDate = new Date(
    hardDeleteYear,
    config.hardDelete.month,
    config.hardDelete.day,
    config.hardDelete.hour || 0,
    config.hardDelete.minute || 0,
    0
  );

  if (currentDate >= hardDeleteDate) {
    // Past hard delete date - check if renewed after expiry
    if (lastRenewalDate) {
      const renewalDate = new Date(lastRenewalDate);
      if (renewalDate > validDate) {
        return false;
      }
    }
    return true; // Should be deleted
  }

  // If we're in a year past hardDeleteYear, they should definitely be deleted
  if (currentYear > hardDeleteYear) {
    return true;
  }

  return false; // Before hard delete date
}

/**
 * Get blocking message for student
 */
export function getBlockingMessage(
  validUntil: string | null,
  simulationConfig?: SimulationConfig | null
): string {
  const referenceYear = (simulationConfig?.enabled)
    ? simulationConfig.customYear
    : (validUntil ? new Date(validUntil).getFullYear() : new Date().getFullYear());

  const nextYear = referenceYear + 1;

  const renewalDeadlineText = `${deadlineConfig.renewalDeadline.monthName} ${deadlineConfig.renewalDeadline.day}, ${referenceYear}`;
  const nextDeadlineText = `${deadlineConfig.hardDelete.monthName} ${deadlineConfig.hardDelete.day}, ${nextYear}`;

  return `Your bus service has expired. The renewal deadline was ${renewalDeadlineText}. Please contact the admin office immediately to renew your service. If not renewed by ${nextDeadlineText}, your account will be permanently deactivated.`;
}

/**
 * Get all deadline configuration
 */
export function getDeadlineConfig() {
  return deadlineConfig;
}

/**
 * Calculate days until hard delete
 */
/**
 * Calculate days until hard delete
 * Based on validUntil year + 1
 */
export function getDaysUntilHardDelete(
  validUntil: string | null,
  simulationConfig?: SimulationConfig | null
): number {
  const today = simulationConfig?.enabled
    ? new Date(simulationConfig.customYear, simulationConfig.customMonth, simulationConfig.customDay)
    : new Date();

  // If no validUntil, we can't calculate accurate specific deadline
  // fall back to current year logic or return 0
  let sessionEndYear = today.getFullYear();

  if (validUntil) {
    sessionEndYear = new Date(validUntil).getFullYear();
  }

  const hardDeleteYear = sessionEndYear + 1;

  const hardDeleteDate = new Date(
    hardDeleteYear,
    HARD_DELETE_MONTH,
    HARD_DELETE_DAY,
    deadlineConfig.hardDelete.hour,
    deadlineConfig.hardDelete.minute,
    0
  );

  const diffTime = hardDeleteDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  // If already past hard delete date, return 0
  return Math.max(0, diffDays);
}

/**
 * Get hard delete date for a specific student
 */
export function getHardDeleteDate(
  validUntil: string | null,
  simulationConfig?: SimulationConfig | null
): Date {
  const today = simulationConfig?.enabled
    ? new Date(simulationConfig.customYear, simulationConfig.customMonth, simulationConfig.customDay)
    : new Date();

  let sessionEndYear = today.getFullYear();
  if (validUntil) {
    sessionEndYear = new Date(validUntil).getFullYear();
  }

  const hardDeleteYear = sessionEndYear + 1;

  return new Date(
    hardDeleteYear,
    HARD_DELETE_MONTH,
    HARD_DELETE_DAY,
    deadlineConfig.hardDelete.hour,
    deadlineConfig.hardDelete.minute,
    0
  );
}

/**
 * Get formatted timeline events with current year
 */
export function getTimelineEvents(simulationConfig?: SimulationConfig | null) {
  const currentYear = (simulationConfig?.enabled && simulationConfig.customYear)
    ? simulationConfig.customYear
    : new Date().getFullYear();

  return deadlineConfig.timeline.events.map(event => ({
    ...event,
    dateFormatted: `${event.date.month + 1}/${event.date.day}/${currentYear}`,
    dateObject: new Date(currentYear, event.date.month, event.date.day)
  }));
}

/**
 * Get contact information
 */
export function getContactInfo() {
  return deadlineConfig.contactInfo;
}
