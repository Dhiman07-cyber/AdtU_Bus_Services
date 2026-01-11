/**
 * Utility functions for parsing and handling dates from Firestore
 */
import { DEADLINE_CONFIG } from '@/lib/types/deadline-config-defaults';

/**
 * Safely parse a date from various formats
 * Handles: ISO strings, Firestore Timestamps, Date objects, seconds/milliseconds
 */
export function parseFirestoreDate(dateValue: any): Date | null {
  if (!dateValue) return null;

  try {
    // Already a Date object
    if (dateValue instanceof Date) {
      return isNaN(dateValue.getTime()) ? null : dateValue;
    }

    // Firestore Timestamp object (has toDate method)
    if (typeof dateValue === 'object' && typeof dateValue.toDate === 'function') {
      return dateValue.toDate();
    }

    // Firestore Timestamp serialized format (has seconds)
    if (typeof dateValue === 'object' && (dateValue.seconds || dateValue._seconds)) {
      const seconds = dateValue.seconds || dateValue._seconds;
      const nanoseconds = dateValue.nanoseconds || dateValue._nanoseconds || 0;
      return new Date(seconds * 1000 + nanoseconds / 1000000);
    }

    // String ISO format
    if (typeof dateValue === 'string') {
      const parsed = new Date(dateValue);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    // Unix timestamp (seconds)
    if (typeof dateValue === 'number') {
      // If number is too large, it's milliseconds; otherwise seconds
      const timestamp = dateValue > 10000000000 ? dateValue : dateValue * 1000;
      const parsed = new Date(timestamp);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    return null;
  } catch (error) {
    console.error('Error parsing date:', error, dateValue);
    return null;
  }
}

/**
 * Format a date for display
 */
export function formatDate(date: Date | null, fallback: string = 'Not Set'): string {
  if (!date) return fallback;

  try {
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    return fallback;
  }
}

/**
 * Calculate days until a date
 */
export function daysUntil(date: Date | null): number {
  if (!date) return 0;

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);

    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  } catch (error) {
    return 0;
  }
}

/**
 * Check if a date is expired
 */
export function isDateExpired(date: Date | null): boolean {
  if (!date) return true;

  try {
    return date < new Date();
  } catch (error) {
    return true;
  }
}

/**
 * Format date for Firestore storage (ISO string)
 */
export function toFirestoreDate(date: Date): string {
  return date.toISOString();
}

/**
 * Get academic year deadline configuration from deadline-config.json
 * This ensures all date calculations use the same deadline (June 30th by default)
 */
export function getAcademicYearDeadline(): { month: number; day: number } {
  try {
    return {
      month: DEADLINE_CONFIG.academicYear.anchorMonth, // 5 = June (0-indexed)
      day: DEADLINE_CONFIG.academicYear.anchorDay      // 30
    };
  } catch (error) {
    console.error('Error reading deadline config, using default June 30:', error);
    // Fallback to June 30th if config file is missing
    return { month: 5, day: 30 };
  }
}

/**
 * Calculate validity end date based on duration and academic year deadline
 * Uses deadline-config.json to determine the anchor date (June 30th by default)
 * 
 * @param startYear - Starting year
 * @param durationYears - Number of years (1-4)
 * @returns Date object set to the deadline of the final year
 */
export function calculateValidUntilDate(startYear: number, durationYears: number): Date {
  const deadline = getAcademicYearDeadline();
  const endYear = startYear + durationYears;

  // Create date with deadline from config (June 30th by default)
  const validUntil = new Date(endYear, deadline.month, deadline.day);

  return validUntil;
}
