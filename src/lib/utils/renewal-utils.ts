/**
 * Bus Service Renewal Utilities
 * Handles date calculations for July-aligned academic year renewals
 * Uses dynamic configuration passed from service layer
 */

import { Timestamp } from 'firebase/firestore';
import { SimulationConfig } from '@/lib/types/simulation-config';
import { DeadlineConfig } from '@/lib/types/deadline-config';

// NOTE: Top-level constants removed to enforce dynamic configuration usage.
// Consumers must fetch configuration first and pass it to these utilities.

/**
 * Calculate new validUntil date for renewal
 * Follows July-aligned academic cycle rules
 * 
 * @param currentValidUntil - Current validUntil date (or null/expired)
 * @param durationYears - Number of years to add (1-4)
 * @param config - DEADLINE CONFIGURATION IS REQUIRED
 * @returns New validUntil date as ISO string
 */
export function calculateRenewalDate(
  currentValidUntil: string | null | undefined,
  durationYears: number,
  config: DeadlineConfig | { academicYear: { anchorMonth: number; anchorDay: number } }
): { newValidUntil: string; oldValidUntil: string | null } {
  if (!config) throw new Error("Configuration required for calculateRenewalDate");

  const today = new Date();
  const currentYear = today.getFullYear();

  // Use provided config
  const anchorMonth = config.academicYear.anchorMonth;
  const anchorDay = config.academicYear.anchorDay;

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
    baseYear = currentYear;
  }

  // Calculate new year by adding duration
  const newYear = baseYear + durationYears;

  // Set to anchor date of the new year at end of day
  const newValidUntil = new Date(newYear, anchorMonth, anchorDay, 23, 59, 59, 999);

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
 * Check if student should be soft-blocked (after soft block date, not renewed)
 */
export function shouldBlockAccess(
  validUntil: string | null,
  lastRenewalDate?: string | null,
  simulationConfig?: SimulationConfig | null,
  status?: string,
  config?: any // REQUIRED parameter now
): boolean {
  if (!config) throw new Error("Config required for shouldBlockAccess");

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
  let sessionEndYear = validDate.getFullYear();
  if (simulationConfig?.enabled && (simulationConfig.syncSessionWithSimulatedDate || true)) {
    sessionEndYear = simulationConfig.customYear;
  }

  const currentYear = currentDate.getFullYear();
  const isExpired = (simulationConfig?.enabled)
    ? true // In simulation mode, we are testing the post-expiry behavior
    : validDate < currentDate;

  if (!isExpired) {
    return false; // Still valid, don't block
  }

  // Soft block only happens in the SAME year as session end
  if (currentYear !== sessionEndYear) {
    return currentYear > sessionEndYear;
  }

  // We're in the same year as session end - check soft block date
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
 */
export function shouldHardDelete(
  validUntil: string | null,
  lastRenewalDate?: string | null,
  simulationConfig?: SimulationConfig | null,
  config?: any // REQUIRED
): boolean {
  if (!config) throw new Error("Config required for shouldHardDelete");

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
    sessionEndYear = validDate.getFullYear();
  }

  const hardDeleteYear = sessionEndYear + 1; // Hard delete is in the NEXT year
  const currentYear = currentDate.getFullYear();

  // Hard delete only happens in years AFTER session end year
  if (currentYear < hardDeleteYear) {
    return false; // Not yet in the hard delete year
  }

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
  simulationConfig?: SimulationConfig | null,
  config?: any // REQUIRED
): string {
  if (!config) throw new Error("Config required for getBlockingMessage");

  const referenceYear = (simulationConfig?.enabled)
    ? simulationConfig.customYear
    : (validUntil ? new Date(validUntil).getFullYear() : new Date().getFullYear());

  const nextYear = referenceYear + 1;

  const renewalMonthName = config.renewalDeadline.monthName || "June";
  const hardDeleteMonthName = config.hardDelete.monthName || "August";

  const renewalDeadlineText = `${renewalMonthName} ${config.renewalDeadline.day}, ${referenceYear}`;
  const nextDeadlineText = `${hardDeleteMonthName} ${config.hardDelete.day}, ${nextYear}`;

  return `Your bus service has expired. The renewal deadline was ${renewalDeadlineText}. Please contact the admin office immediately to renew your service. If not renewed by ${nextDeadlineText}, your account will be permanently deactivated.`;
}

/**
 * Check if student should be soft-blocked using PRE-STORED softBlock date from student document.
 */
export function shouldBlockAccessFromStoredDates(
  studentData: {
    softBlock?: string | null;
    validUntil?: string | null;
    lastRenewalDate?: string | null;
    status?: string;
    sessionEndYear?: number;
  },
  simulationConfig?: SimulationConfig | null,
  config?: any // REQUIRED
): boolean {
  if (!config) throw new Error("Config required for shouldBlockAccessFromStoredDates");

  // Explicit status check: if already blocked, return true
  if (studentData.status === 'soft_blocked' || studentData.status === 'hard_blocked' || studentData.status === 'pending_deletion') {
    return true;
  }

  if (!studentData.validUntil) return true; // No validity = blocked

  // REFERENCE DATE: Use simulated date if enabled, otherwise real today
  let currentDate = new Date();
  if (simulationConfig?.enabled) {
    currentDate = new Date(
      simulationConfig.customYear,
      simulationConfig.customMonth,
      simulationConfig.customDay
    );
  }

  const validDate = new Date(studentData.validUntil);

  // If still valid, don't block
  if (validDate > currentDate && !simulationConfig?.enabled) {
    return false;
  }

  // Use stored softBlock date if available
  if (studentData.softBlock) {
    const softBlockDate = new Date(studentData.softBlock);

    if (currentDate >= softBlockDate) {
      if (studentData.lastRenewalDate) {
        const renewalDate = new Date(studentData.lastRenewalDate);
        if (renewalDate > validDate) {
          return false;
        }
      }
      return true; // Block access
    }
    return false; // Before soft block date
  }

  // Fallback to computed logic if no stored softBlock
  return shouldBlockAccess(
    studentData.validUntil,
    studentData.lastRenewalDate,
    simulationConfig,
    studentData.status,
    config
  );
}

/**
 * Check if student should be hard-deleted using PRE-STORED hardBlock date from student document.
 */
export function shouldHardDeleteFromStoredDates(
  studentData: {
    hardBlock?: string | null;
    validUntil?: string | null;
    lastRenewalDate?: string | null;
    sessionEndYear?: number;
  },
  simulationConfig?: SimulationConfig | null,
  config?: any // REQUIRED
): boolean {
  if (!config) throw new Error("Config required for shouldHardDeleteFromStoredDates");

  if (!studentData.validUntil) {
    return true; // No validity = should be deleted
  }

  // REFERENCE DATE
  let currentDate = new Date();
  if (simulationConfig?.enabled) {
    currentDate = new Date(
      simulationConfig.customYear,
      simulationConfig.customMonth,
      simulationConfig.customDay
    );
  }

  const validDate = new Date(studentData.validUntil);

  // Use stored hardBlock date if available
  if (studentData.hardBlock) {
    const hardBlockDate = new Date(studentData.hardBlock);

    if (currentDate >= hardBlockDate) {
      if (studentData.lastRenewalDate) {
        const renewalDate = new Date(studentData.lastRenewalDate);
        if (renewalDate > validDate) {
          return false;
        }
      }
      return true; // Should be deleted
    }
    return false; // Before hard delete date
  }

  // Fallback to computed logic
  return shouldHardDelete(
    studentData.validUntil,
    studentData.lastRenewalDate,
    simulationConfig,
    config
  );
}

/**
 * Calculate days until hard delete
 */
export function getDaysUntilHardDelete(
  validUntil: string | null,
  simulationConfig?: SimulationConfig | null,
  config?: any // REQUIRED
): number {
  if (!config) throw new Error("Config required for getDaysUntilHardDelete");

  const today = simulationConfig?.enabled
    ? new Date(simulationConfig.customYear, simulationConfig.customMonth, simulationConfig.customDay)
    : new Date();

  // If no validUntil, we can't calculate accurate specific deadline
  let sessionEndYear = today.getFullYear();

  if (validUntil) {
    sessionEndYear = new Date(validUntil).getFullYear();
  }

  const hardDeleteYear = sessionEndYear + 1;

  const hardDeleteDate = new Date(
    hardDeleteYear,
    config.hardDelete.month,
    config.hardDelete.day,
    config.hardDelete.hour || 0,
    config.hardDelete.minute || 0,
    0
  );

  const diffTime = hardDeleteDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
}

/**
 * Get hard delete date for a specific student
 */
export function getHardDeleteDate(
  validUntil: string | null,
  simulationConfig?: SimulationConfig | null,
  config?: any // REQUIRED
): Date {
  if (!config) throw new Error("Config required for getHardDeleteDate");

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
    config.hardDelete.month,
    config.hardDelete.day,
    config.hardDelete.hour || 0,
    config.hardDelete.minute || 0,
    0
  );
}

/**
 * Get formatted timeline events with current year
 */
export function getTimelineEvents(simulationConfig: SimulationConfig | null, config: any) {
  if (!config) throw new Error("Config required for getTimelineEvents");

  const currentYear = (simulationConfig?.enabled && simulationConfig.customYear)
    ? simulationConfig.customYear
    : new Date().getFullYear();

  return config.timeline.events.map((event: any) => ({
    ...event,
    dateFormatted: `${event.date.month + 1}/${event.date.day}/${currentYear}`,
    dateObject: new Date(currentYear, event.date.month, event.date.day)
  }));
}

/**
 * Get contact information
 */
export function getContactInfo(config: any) {
  if (!config) throw new Error("Config required for getContactInfo");
  return config.contactInfo;
}
