/**
 * Deadline Configuration Types
 * 
 * This module defines the types for the per-student renewal deadline system.
 * All date configurations use month/day ONLY (no year).
 * Years are computed from each student's sessionEndYear at runtime.
 * 
 * IMPORTANT RULES:
 * 1. Month values are 0-indexed (0 = January, 5 = June, 11 = December)
 * 2. Hard delete ALWAYS occurs in sessionEndYear + 1 (next academic cycle)
 * 3. Simulation mode overrides the year for testing purposes only
 * 4. Destructive simulation actions are logged but never executed unless explicitly enabled
 */

/**
 * Month/Day only date configuration
 */
export interface DateOnlyConfig {
    month: number;     // 0-indexed month (0 = Jan, 5 = June)
    day: number;       // Day of month (1-31)
    hour?: number;     // 0-23
    minute?: number;   // 0-59
}

/**
 * Full deadline configuration structure
 */
export interface DeadlineConfig {
    description: string;
    version: string;
    lastUpdated: string;
    lastUpdatedBy?: string;

    /**
     * Academic Year Anchor
     * The date when each academic year's bus service expires
     * Default: June 30 (month: 5, day: 30)
     */
    academicYear: {
        description: string;
        anchorMonth: number;
        anchorMonthName: string;
        anchorDay: number;
        anchorDayOrdinal: string;
    };

    /**
     * Renewal Notification
     * When to start showing renewal reminders to students
     */
    renewalNotification: DateOnlyConfig & {
        description: string;
        monthName: string;
        dayOrdinal: string;
        daysBeforeDeadline: number;
        displayText: string;
    };

    /**
     * Renewal Deadline
     * Final date for students to complete renewal before penalties
     */
    renewalDeadline: DateOnlyConfig & {
        description: string;
        monthName: string;
        dayOrdinal: string;
        displayText: string;
    };

    /**
     * Soft Block
     * When Track Bus access gets blocked for expired students
     */
    softBlock: DateOnlyConfig & {
        description: string;
        monthName: string;
        dayOrdinal: string;
        daysAfterDeadline: number;
        displayText: string;
        warningText: string;
    };

    /**
     * Hard Delete
     * When expired student accounts get permanently deleted
     * ALWAYS occurs in sessionEndYear + 1 (next cycle)
     */
    hardDelete: DateOnlyConfig & {
        description: string;
        monthName: string;
        dayOrdinal: string;
        daysAfterDeadline: number;
        daysAfterSoftBlock: number;
        displayText: string;
        criticalWarningText: string;
    };

    /**
     * Urgent Warning Threshold
     * Days before hard delete to show critical warnings
     */
    urgentWarningThreshold: {
        description: string;
        days: number;
        displayText: string;
    };

    /**
     * @deprecated These fields are deprecated. Payment exports now use explicit date parameters.
     * Payments are stored permanently in Supabase and never deleted.
     * Use GET /api/cron/annual-export?year=2024 to specify export year.
     */
    paymentExportStartYear?: number; // DEPRECATED - not used
    paymentExportInterval?: number;  // DEPRECATED - not used



    /**
     * Contact Information for students
     */
    contactInfo: {
        description: string;
        officeName: string;
        phone: string;
        email: string;
        officeHours: string;
        address: string;
        visitInstructions: string;
    };

    /**
     * Timeline events for UI display
     */
    timeline: {
        description: string;
        events: Array<{
            id: string;
            date: DateOnlyConfig;
            time?: { hour: number; minute: number };
            label: string;
            color: string;
            icon: string;
            critical?: boolean;
        }>;
    };

    /**
     * Application process steps
     */
    applicationProcess?: {
        description: string;
        steps: Array<{
            num: number;
            title: string;
            desc: string;
            icon: string;
            color: string;
        }>;
        importantNotes?: Array<{
            icon: string;
            text: string;
        }>;
    };

    /**
     * Statistics for landing page
     */
    statistics?: {
        description: string;
        items: Array<{
            label: string;
            value: string;
            icon: string;
            gradient: string;
        }>;
    };

    /**
     * Landing page content
     */
    landingPage?: {
        description: string;
        heroTitle: string;
        heroSubtitle: string;
        ctaTitle: string;
        ctaSubtitle: string;
        contactTitle: string;
        contactSubtitle: string;
        supportText?: string;
    };
}

/**
 * Computed dates for a specific student
 * These are calculated at runtime based on student's sessionEndYear and the config
 */
export interface StudentComputedDates {
    /** Student document ID */
    studentId: string;

    /** Student's session end year (from their enrollment) */
    sessionEndYear: number;

    /** The effective year used for computation (may differ in simulation mode) */
    effectiveYear: number;

    /** Date when the student's service expires */
    serviceExpiryDate: Date;

    /** Date when renewal notifications start */
    renewalNotificationDate: Date;

    /** Final renewal deadline */
    renewalDeadlineDate: Date;

    /** Date when access is blocked (soft block) */
    softBlockDate: Date;

    /** Date when account is permanently deleted (ALWAYS in effectiveYear + 1) */
    hardDeleteDate: Date;

    /** Date when urgent deletion warnings start */
    urgentWarningDate: Date;

    /** When these dates were computed */
    computedAt: Date;

    /** Config version used for computation */
    configVersion: string;

    /** Whether this was computed in simulation mode */
    isSimulated: boolean;
}

/**
 * Stored computed fields on student document
 */
export interface StudentComputedFields {
    serviceExpiryDate?: string;    // ISO string
    renewalDeadlineDate?: string;  // ISO string
    softBlockDate?: string;        // ISO string
    hardDeleteDate?: string;       // ISO string (ALWAYS in sessionEndYear + 1)
    urgentWarningDate?: string;    // ISO string
    computedAt?: string;           // When these were last calculated
    configVersion?: string;        // Which config version was used
}

/**
 * Student status for deadline enforcement
 */
export type StudentDeadlineStatus =
    | 'active'           // Normal active student
    | 'soft_blocked'     // Access blocked, pending renewal
    | 'pending_deletion' // Scheduled for hard delete
    | 'deleted';         // Account deleted (for audit trail)

/**
 * System action types for audit logging
 */
export type SystemActionType =
    | 'soft_block'
    | 'soft_block_removed'
    | 'urgent_warning_sent'
    | 'hard_delete'
    | 'config_change'
    | 'reactivation'
    | 'manual_override'
    | 'simulation_logged';

/**
 * Audit log entry for system actions
 */
export interface SystemActionAudit {
    /** Unique ID */
    id: string;

    /** Type of action */
    action: SystemActionType;

    /** Affected student ID (if applicable) */
    studentId?: string;

    /** Student email for reference after deletion */
    studentEmail?: string;

    /** Who performed the action */
    actorType: 'system' | 'scheduler' | 'admin' | 'moderator' | 'simulation';

    /** Actor user ID (if not system/scheduler) */
    actorId?: string;

    /** Actor name for display */
    actorName?: string;

    /** When action occurred */
    timestamp: Date;

    /** Additional details */
    details: Record<string, any>;

    /** Was this a simulation action */
    isSimulation: boolean;

    /** Action status */
    status: 'success' | 'failed' | 'pending';

    /** Error message if failed */
    error?: string;

    /** Scheduler run ID if from scheduled job */
    schedulerRunId?: string;
}

/**
 * Simulation action log entry
 * Records what WOULD have happened if not in simulation mode
 */
export interface SimulationActionLog {
    /** Unique ID */
    id: string;

    /** Action that would have been taken */
    action: 'soft_block' | 'hard_delete' | 'notification';

    /** Target student */
    studentId: string;
    studentEmail?: string;

    /** Computed date that triggered this action */
    intendedDate: string;

    /** Simulation year being used */
    simulationYear: number;

    /** What would have been executed */
    wouldHaveExecuted: {
        collections?: string[];      // Collections that would be modified
        cloudinaryImages?: boolean;  // Would images be deleted
        firebaseAuth?: boolean;      // Would auth be revoked
        notifications?: boolean;     // Would notifications be sent
    };

    /** When this was logged */
    timestamp: Date;

    /** Which scheduler run created this */
    schedulerRunId: string;
}

/**
 * Config change audit entry
 */
export interface ConfigChangeAudit {
    /** Unique ID */
    id: string;

    /** Who made the change */
    changedBy: string;
    changedByEmail?: string;

    /** When the change was made */
    timestamp: Date;

    /** Previous config (or relevant portion) */
    oldConfig: Partial<DeadlineConfig>;

    /** New config (or relevant portion) */
    newConfig: Partial<DeadlineConfig>;

    /** Summary of what changed */
    changesSummary: string[];

    /** New version number */
    version: string;
}

/**
 * Scheduler run log entry
 */
export interface SchedulerRunLog {
    /** Unique run ID */
    runId: string;

    /** When the run started */
    startedAt: Date;

    /** When the run completed (if finished) */
    completedAt?: Date;

    /** Run status */
    status: 'running' | 'success' | 'error';

    /** Number of students processed */
    studentsProcessed: number;

    /** Actions taken during this run */
    actionsCount: {
        softBlocks: number;
        urgentWarnings: number;
        hardDeletes: number;
        simulationLogged: number;
    };

    /** Whether simulation mode was active */
    simulationMode: boolean;

    /** Simulation year if active */
    simulationYear?: number;

    /** Error message if failed */
    error?: string;
}

/**
 * Preview result for admin UI
 */
export interface DatePreviewResult {
    studentId: string;
    studentName: string;
    studentEmail: string;
    sessionEndYear: number;
    currentStatus: StudentDeadlineStatus;

    /** Computed dates for this student */
    computedDates: {
        serviceExpiryDate: string;
        renewalNotificationDate: string;
        renewalDeadlineDate: string;
        softBlockDate: string;
        hardDeleteDate: string;
        urgentWarningDate: string;
    };

    /** What actions would occur today */
    todayActions: {
        wouldSoftBlock: boolean;
        wouldSendUrgentWarning: boolean;
        wouldHardDelete: boolean;
    };

    /** Days until each event */
    daysUntil: {
        serviceExpiry: number;
        renewalDeadline: number;
        softBlock: number;
        hardDelete: number;
        urgentWarning: number;
    };

    /** Using simulation mode */
    isSimulation: boolean;
    simulationYear?: number;
}
