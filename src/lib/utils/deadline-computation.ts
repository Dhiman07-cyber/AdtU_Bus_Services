/**
 * Per-Student Deadline Computation Engine
 * 
 * This module provides the core date computation logic for the renewal deadline system.
 * All dates are computed per-student based on their individual sessionEndYear.
 * 
 * KEY RULES:
 * 1. Config stores month/day ONLY (no year)
 * 2. Year is derived from each student's sessionEndYear
 * 3. Hard delete ALWAYS occurs in sessionEndYear + 1 (next academic cycle)
 * 4. Simulation mode can override the year for testing
 */

import { DEADLINE_CONFIG } from '@/lib/types/deadline-config-defaults';

/**
 * Student deadline status type (local definition)
 */
type StudentDeadlineStatus = 'active' | 'soft_blocked' | 'pending_deletion' | 'deleted';

/**
 * Student computed fields (local definition)
 */
interface StudentComputedFields {
    serviceExpiryDate?: string;
    renewalDeadlineDate?: string;
    softBlockDate?: string;
    hardDeleteDate?: string;
    urgentWarningDate?: string;
    computedAt?: string;
    configVersion?: string;
}

/**
 * Date preview result (local definition)
 */
interface DatePreviewResult {
    studentId: string;
    studentName: string;
    studentEmail: string;
    sessionEndYear: number;
    currentStatus: StudentDeadlineStatus;
    computedDates: {
        serviceExpiryDate: string;
        renewalNotificationDate: string;
        renewalDeadlineDate: string;
        softBlockDate: string;
        hardDeleteDate: string;
        urgentWarningDate: string;
    };
    todayActions: {
        wouldSoftBlock: boolean;
        wouldSendUrgentWarning: boolean;
        wouldHardDelete: boolean;
    };
    daysUntil: {
        serviceExpiry: number;
        renewalDeadline: number;
        softBlock: number;
        hardDelete: number;
        urgentWarning: number;
    };
    isSimulation: boolean;
    simulationYear?: number;
}


/**
 * Parameters for computing per-student dates
 */
export interface ComputeDateParams {
    /** Student's session end year (e.g., 2026) */
    studentSessionEndYear: number;

    /** Deadline configuration (month/day only) */
    config?: typeof DEADLINE_CONFIG;

    /** Optional simulation mode override */
    simulationMode?: {
        enabled: boolean;
        customYear: number;
    };
}

/**
 * Result of date computation
 */
export interface ComputedDates {
    /** Date when student's service expires */
    serviceExpiryDate: Date;

    /** Date when renewal notifications start */
    renewalNotificationDate: Date;

    /** Final renewal deadline */
    renewalDeadlineDate: Date;

    /** Date when access is blocked (soft block) */
    softBlockDate: Date;

    /** Date when account is deleted (ALWAYS in effectiveYear + 1) */
    hardDeleteDate: Date;

    /** Date when urgent warnings start */
    urgentWarningDate: Date;

    /** The effective year used for computation */
    effectiveYear: number;

    /** Whether simulation mode was used */
    isSimulated: boolean;
}

/**
 * Compute all deadline dates for a specific student
 * 
 * @param params - Parameters including student's sessionEndYear and optional config
 * @returns Computed dates for the student
 * 
 * @example
 * ```typescript
 * const dates = computeDatesForStudent({
 *   studentSessionEndYear: 2026,
 *   simulationMode: { enabled: false, customYear: 2024 }
 * });
 * 
 * console.log(dates.hardDeleteDate); // 2027-08-31 (NEXT year)
 * ```
 */
export function computeDatesForStudent(params: ComputeDateParams): ComputedDates {
    const {
        studentSessionEndYear,
        config = DEADLINE_CONFIG,
        simulationMode
    } = params;

    // Determine the effective year to use
    const isSimulated = simulationMode?.enabled ?? false;
    const effectiveYear = isSimulated
        ? simulationMode!.customYear
        : studentSessionEndYear;

    // =====================
    // CORE DATE COMPUTATIONS
    // =====================

    // Service Expiry Date: anchor month/day in effectiveYear
    // Example: June 30, 2026 for sessionEndYear = 2026
    const serviceExpiryDate = new Date(
        effectiveYear,
        config.academicYear.anchorMonth,
        config.academicYear.anchorDay,
        23, 59, 59, 999
    );

    // Renewal Notification Date: config month/day in effectiveYear
    // Example: June 1, 2026
    const renewalNotificationDate = new Date(
        effectiveYear,
        config.renewalNotification.month,
        config.renewalNotification.day,
        0, 0, 0
    );

    // Renewal Deadline Date: config month/day in effectiveYear
    // Example: July 1, 2026
    const renewalDeadlineDate = new Date(
        effectiveYear,
        config.renewalDeadline.month,
        config.renewalDeadline.day,
        23, 59, 59, 999
    );

    // Soft Block Date: config month/day in effectiveYear
    // Example: July 31, 2026
    const softBlockDate = new Date(
        effectiveYear,
        config.softBlock.month,
        config.softBlock.day,
        23, 59, 59, 999
    );

    // =====================
    // CRITICAL: Hard Delete in NEXT academic cycle
    // =====================
    // Per the design requirement, hard delete must occur in sessionEndYear + 1
    // This ensures students have a full grace period before permanent deletion
    const hardDeleteYear = effectiveYear + 1;
    const hardDeleteDate = normalizeLeapYearDate(
        hardDeleteYear,
        config.hardDelete.month,
        config.hardDelete.day
    );
    // Set to end of day
    hardDeleteDate.setHours(23, 59, 59, 999);

    // Urgent Warning Date: X days before hard delete
    const urgentWarningDate = new Date(hardDeleteDate);
    urgentWarningDate.setDate(
        urgentWarningDate.getDate() - config.urgentWarningThreshold.days
    );
    urgentWarningDate.setHours(0, 0, 0, 0);

    return {
        serviceExpiryDate,
        renewalNotificationDate,
        renewalDeadlineDate,
        softBlockDate,
        hardDeleteDate,
        urgentWarningDate,
        effectiveYear,
        isSimulated
    };
}

/**
 * Check if two dates are the same day (ignoring time)
 */
export function isSameDay(date1: Date, date2: Date): boolean {
    return (
        date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate()
    );
}

/**
 * Check if date1 is on or after date2 (ignoring time)
 */
export function isOnOrAfter(date1: Date, date2: Date): boolean {
    const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return d1 >= d2;
}

/**
 * Check if date1 is strictly after date2 (ignoring time)
 */
export function isAfter(date1: Date, date2: Date): boolean {
    const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return d1 > d2;
}

/**
 * Check if date1 is on or before date2 (ignoring time)
 */
export function isOnOrBefore(date1: Date, date2: Date): boolean {
    const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return d1 <= d2;
}

/**
 * Calculate the number of days between two dates
 * Positive if date2 is after date1
 */
export function daysBetween(date1: Date, date2: Date): number {
    const oneDay = 24 * 60 * 60 * 1000;
    const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return Math.ceil((d2.getTime() - d1.getTime()) / oneDay);
}

/**
 * Validate a date configuration for invalid day-of-month
 * Examples of invalid: Feb 31, Apr 31, etc.
 */
export function validateDateConfig(
    month: number,
    day: number
): { valid: boolean; error?: string } {
    // Validate month range
    if (month < 0 || month > 11) {
        return { valid: false, error: `Invalid month: ${month}. Must be 0-11.` };
    }

    // Validate day range
    if (day < 1 || day > 31) {
        return { valid: false, error: `Invalid day: ${day}. Must be 1-31.` };
    }

    // Test with a leap year to allow Feb 29
    const testDate = new Date(2024, month, day);

    // If the date object normalized the day (e.g., Feb 31 → Mar 2/3),
    // then the original was invalid
    if (testDate.getMonth() !== month) {
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        return {
            valid: false,
            error: `Invalid day ${day} for ${monthNames[month]}`
        };
    }

    return { valid: true };
}

/**
 * Handle leap year edge case for Feb 29
 * Returns Feb 28 for non-leap years
 */
export function normalizeLeapYearDate(year: number, month: number, day: number): Date {
    if (month === 1 && day === 29) { // February 29
        const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
        if (!isLeapYear) {
            console.log(`[Date Computation] Feb 29 normalized to Feb 28 for non-leap year ${year}`);
            return new Date(year, 1, 28);
        }
    }
    return new Date(year, month, day);
}

/**
 * Check if a specific student should be soft-blocked based on current date
 * 
 * @param student - Student object with sessionEndYear and validUntil
 * @param config - Optional config override
 * @param simulationMode - Optional simulation mode settings
 * @returns Boolean indicating if student should be blocked
 */
export function shouldSoftBlockStudent(
    student: { sessionEndYear?: number; validUntil?: string; status?: string },
    config?: typeof DEADLINE_CONFIG,
    simulationMode?: { enabled: boolean; customYear: number }
): boolean {
    // Already blocked
    if (student.status === 'soft_blocked' || student.status === 'pending_deletion') {
        return false; // Already blocked, don't re-block
    }

    // Can't compute without sessionEndYear
    if (!student.sessionEndYear) return false;

    // If validUntil is still in future, don't block
    if (student.validUntil) {
        const validUntilDate = new Date(student.validUntil);
        const today = new Date();
        if (validUntilDate > today) return false;
    } else {
        // No validUntil means should probably be blocked
        return true;
    }

    // Compute dates for this student
    const computed = computeDatesForStudent({
        studentSessionEndYear: student.sessionEndYear,
        config: config || DEADLINE_CONFIG,
        simulationMode
    });

    // Get today's date (respect simulation mode for testing)
    const today = simulationMode?.enabled
        ? new Date() // For simulation, use actual today but computed dates use custom year
        : new Date();

    // Block if today is on or after soft block date
    return isOnOrAfter(today, computed.softBlockDate);
}

/**
 * Check if a specific student should be hard-deleted based on current date
 * Hard delete always occurs in sessionEndYear + 1
 * 
 * SECURITY: Includes grace period check to prevent deleting recently renewed students
 * 
 * @param student - Student object with sessionEndYear
 * @param config - Optional config override
 * @param simulationMode - Optional simulation mode settings
 * @returns Boolean indicating if student should be deleted
 */
export function shouldHardDeleteStudent(
    student: {
        sessionEndYear?: number;
        status?: string;
        lastRenewalDate?: Date | string | { toDate: () => Date } | null;
        validUntil?: Date | string | { toDate: () => Date } | null;
    },
    config?: typeof DEADLINE_CONFIG,
    simulationMode?: { enabled: boolean; customYear: number }
): boolean {
    // Already deleted or pending deletion
    if (student.status === 'deleted' || student.status === 'pending_deletion') {
        return false;
    }

    // Can't compute without sessionEndYear
    if (!student.sessionEndYear) return false;

    // SECURITY: Grace period check - don't delete recently renewed students
    // This prevents data loss due to delayed Firestore updates or clock skew
    const GRACE_PERIOD_DAYS = 30;

    if (student.lastRenewalDate) {
        let renewalDate: Date;
        if (student.lastRenewalDate instanceof Date) {
            renewalDate = student.lastRenewalDate;
        } else if (typeof student.lastRenewalDate === 'string') {
            renewalDate = new Date(student.lastRenewalDate);
        } else if (typeof (student.lastRenewalDate as any).toDate === 'function') {
            renewalDate = (student.lastRenewalDate as { toDate: () => Date }).toDate();
        } else {
            renewalDate = new Date(0); // Default to epoch if can't parse
        }

        const daysSinceRenewal = daysBetween(renewalDate, new Date());
        if (daysSinceRenewal < GRACE_PERIOD_DAYS) {
            console.log(`🛡️ GRACE PERIOD: Student renewed ${daysSinceRenewal} days ago, skipping hard delete`);
            return false;
        }
    }

    // SECURITY: Also check if validUntil is still in the future (renewal might not have updated sessionEndYear yet)
    if (student.validUntil) {
        let validUntilDate: Date;
        if (student.validUntil instanceof Date) {
            validUntilDate = student.validUntil;
        } else if (typeof student.validUntil === 'string') {
            validUntilDate = new Date(student.validUntil);
        } else if (typeof (student.validUntil as any).toDate === 'function') {
            validUntilDate = (student.validUntil as { toDate: () => Date }).toDate();
        } else {
            validUntilDate = new Date(0);
        }

        if (validUntilDate > new Date()) {
            console.log(`🛡️ VALID SUBSCRIPTION: Student validity until ${validUntilDate.toISOString()}, skipping hard delete`);
            return false;
        }
    }

    // Compute dates for this student
    const computed = computeDatesForStudent({
        studentSessionEndYear: student.sessionEndYear,
        config: config || DEADLINE_CONFIG,
        simulationMode
    });

    const today = new Date();

    // Delete if today is on or after hard delete date
    return isOnOrAfter(today, computed.hardDeleteDate);
}

/**
 * Get the number of days until hard delete for a specific student
 */
export function getDaysUntilHardDeleteForStudent(
    student: { sessionEndYear?: number },
    config?: typeof DEADLINE_CONFIG,
    simulationMode?: { enabled: boolean; customYear: number }
): number {
    if (!student.sessionEndYear) return 0;

    const computed = computeDatesForStudent({
        studentSessionEndYear: student.sessionEndYear,
        config: config || DEADLINE_CONFIG,
        simulationMode
    });

    return Math.max(0, daysBetween(new Date(), computed.hardDeleteDate));
}

/**
 * Get the number of days until soft block for a specific student
 */
export function getDaysUntilSoftBlockForStudent(
    student: { sessionEndYear?: number },
    config?: typeof DEADLINE_CONFIG,
    simulationMode?: { enabled: boolean; customYear: number }
): number {
    if (!student.sessionEndYear) return 0;

    const computed = computeDatesForStudent({
        studentSessionEndYear: student.sessionEndYear,
        config: config || DEADLINE_CONFIG,
        simulationMode
    });

    return Math.max(0, daysBetween(new Date(), computed.softBlockDate));
}

/**
 * Convert computed dates to storable format for student document
 */
export function computedDatesToStorable(
    computed: ComputedDates,
    configVersion: string
): StudentComputedFields {
    return {
        serviceExpiryDate: computed.serviceExpiryDate.toISOString(),
        renewalDeadlineDate: computed.renewalDeadlineDate.toISOString(),
        softBlockDate: computed.softBlockDate.toISOString(),
        hardDeleteDate: computed.hardDeleteDate.toISOString(),
        urgentWarningDate: computed.urgentWarningDate.toISOString(),
        computedAt: new Date().toISOString(),
        configVersion
    };
}

/**
 * Compute softBlock and hardBlock dates for a student based on their validUntil date.
 * 
 * This is THE SINGLE SOURCE OF TRUTH for block date computation.
 * Call this whenever validUntil changes (renewal, application approval, etc.)
 * 
 * LOGIC:
 * - validUntil is always June 30 of some year (e.g., June 30, 2027)
 * - Soft Block: July 31 of the same year as validUntil (e.g., July 31, 2027)
 * - Hard Block: August 31, TWO years after the validUntil year (e.g., August 31, 2029)
 * 
 * @param validUntil - The student's validUntil date (ISO string or Date object)
 * @returns Object containing softBlock and hardBlock ISO date strings
 * 
 * @example
 * ```typescript
 * // Student enrolls in 2026 with 1-year plan → validUntil = June 30, 2027
 * const { softBlock, hardBlock } = computeBlockDatesFromValidUntil('2027-06-30T23:59:59.999Z');
 * // softBlock: "2027-07-31T23:59:59.999Z" 
 * // hardBlock: "2029-08-31T23:59:59.999Z" (2 years after soft block year)
 * ```
 */
export function computeBlockDatesFromValidUntil(validUntil: string | Date): { softBlock: string; hardBlock: string } {
    const config = DEADLINE_CONFIG;

    // Parse validUntil to get the year
    const validUntilDate = typeof validUntil === 'string' ? new Date(validUntil) : validUntil;
    const validUntilYear = validUntilDate.getFullYear();

    // Soft Block: Same year as validUntil, using config month/day/time
    // Use nullish coalescing (??) because 0 is a valid hour/minute
    const softBlockDate = new Date(
        validUntilYear,
        config.softBlock.month,
        config.softBlock.day,
        config.softBlock.hour ?? 23,
        config.softBlock.minute ?? 59,
        59,
        999
    );

    // Hard Block: TWO years after validUntil year, using config month/day/time
    const hardBlockYear = validUntilYear + 2;
    const hardBlockDate = normalizeLeapYearDate(
        hardBlockYear,
        config.hardDelete.month,
        config.hardDelete.day
    );
    // Use config time for hard block as well, instead of forcing 23:59:59
    hardBlockDate.setHours(
        config.hardDelete.hour ?? 23,
        config.hardDelete.minute ?? 59,
        59,
        999
    );

    return {
        softBlock: softBlockDate.toISOString(),
        hardBlock: hardBlockDate.toISOString()
    };
}

/**
 * @deprecated Use computeBlockDatesFromValidUntil instead.
 * This function is kept for backward compatibility during migration.
 */
export function computeBlockDatesForStudent(sessionEndYear: number): { softBlock: string; hardBlock: string } {
    // Create a validUntil date from sessionEndYear (June 30 of that year)
    const validUntil = new Date(
        sessionEndYear,
        DEADLINE_CONFIG.academicYear.anchorMonth,
        DEADLINE_CONFIG.academicYear.anchorDay,
        23, 59, 59, 999
    );
    return computeBlockDatesFromValidUntil(validUntil);
}

/**
 * Generate a preview of deadline effects for a student
 * Used in admin UI for previewing before saving config changes
 */
export function generateDatePreview(
    student: {
        id: string;
        name?: string;
        fullName?: string;
        email?: string;
        sessionEndYear?: number;
        status?: StudentDeadlineStatus;
    },
    config?: typeof DEADLINE_CONFIG,
    simulationMode?: { enabled: boolean; customYear: number }
): DatePreviewResult | null {
    if (!student.sessionEndYear) return null;

    const computed = computeDatesForStudent({
        studentSessionEndYear: student.sessionEndYear,
        config: config || DEADLINE_CONFIG,
        simulationMode
    });

    const today = new Date();

    return {
        studentId: student.id,
        studentName: student.fullName || student.name || 'Unknown',
        studentEmail: student.email || 'No email',
        sessionEndYear: student.sessionEndYear,
        currentStatus: (student.status as StudentDeadlineStatus) || 'active',

        computedDates: {
            serviceExpiryDate: computed.serviceExpiryDate.toISOString(),
            renewalNotificationDate: computed.renewalNotificationDate.toISOString(),
            renewalDeadlineDate: computed.renewalDeadlineDate.toISOString(),
            softBlockDate: computed.softBlockDate.toISOString(),
            hardDeleteDate: computed.hardDeleteDate.toISOString(),
            urgentWarningDate: computed.urgentWarningDate.toISOString()
        },

        todayActions: {
            wouldSoftBlock: isSameDay(today, computed.softBlockDate) && student.status !== 'soft_blocked',
            wouldSendUrgentWarning: isSameDay(today, computed.urgentWarningDate),
            wouldHardDelete: isSameDay(today, computed.hardDeleteDate)
        },

        daysUntil: {
            serviceExpiry: daysBetween(today, computed.serviceExpiryDate),
            renewalDeadline: daysBetween(today, computed.renewalDeadlineDate),
            softBlock: daysBetween(today, computed.softBlockDate),
            hardDelete: daysBetween(today, computed.hardDeleteDate),
            urgentWarning: daysBetween(today, computed.urgentWarningDate)
        },

        isSimulation: computed.isSimulated,
        simulationYear: computed.isSimulated ? computed.effectiveYear : undefined
    };
}

/**
 * Get formatted date string for display
 */
export function formatComputedDate(date: Date): string {
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

/**
 * Get ordinal suffix for a day number
 */
export function getOrdinalSuffix(day: number): string {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
}

/**
 * Format a date with ordinal day
 */
export function formatDateWithOrdinal(date: Date): string {
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const day = date.getDate();
    return `${monthNames[date.getMonth()]} ${day}${getOrdinalSuffix(day)}, ${date.getFullYear()}`;
}
