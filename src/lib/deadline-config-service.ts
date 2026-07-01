import { adminDb } from './firebase-admin';
import { DeadlineConfig } from './types/deadline-config';
import { SETTINGS_COLLECTION } from '@/config/firestore-collections';
import { deriveAcademicLifecycle } from './utils/deadline-computation';

const DOC_ID = 'deadline';

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

const getOrdinal = (day: number): string => {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
};

/**
 * Get deadline configuration from Firestore
 * Dynamically derives all lifecycle milestones from academicSessionStart
 */
export async function getDeadlineConfig(): Promise<DeadlineConfig> {
    try {
        const doc = await adminDb.collection(SETTINGS_COLLECTION).doc(DOC_ID).get();

        if (doc.exists) {
            const data = doc.data() as any;
            const startMonth = data.academicSessionStart?.month ?? 6; // default July
            const startDay = data.academicSessionStart?.day ?? 1;

            const referenceYear = 2026;
            const lifecycle = deriveAcademicLifecycle(startMonth, startDay, referenceYear);

            const populatedConfig: DeadlineConfig = {
                ...data,
                academicSessionStart: { month: startMonth, day: startDay },
                academicYear: {
                    description: "Academic year boundary",
                    anchorMonth: lifecycle.expiry.getUTCMonth(),
                    anchorMonthName: MONTH_NAMES[lifecycle.expiry.getUTCMonth()],
                    anchorDay: lifecycle.expiry.getUTCDate(),
                    anchorDayOrdinal: getOrdinal(lifecycle.expiry.getUTCDate())
                },
                renewalNotification: {
                    description: "Renewal notification start date",
                    month: lifecycle.reminder1.getUTCMonth(),
                    monthName: MONTH_NAMES[lifecycle.reminder1.getUTCMonth()],
                    day: lifecycle.reminder1.getUTCDate(),
                    dayOrdinal: getOrdinal(lifecycle.reminder1.getUTCDate()),
                    hour: 0,
                    minute: 5,
                    daysBeforeDeadline: 90,
                    displayText: "Renewal notification period has started"
                },
                renewalDeadline: {
                    description: "Renewal deadline date",
                    month: lifecycle.deadline.getUTCMonth(),
                    monthName: MONTH_NAMES[lifecycle.deadline.getUTCMonth()],
                    day: lifecycle.deadline.getUTCDate(),
                    dayOrdinal: getOrdinal(lifecycle.deadline.getUTCDate()),
                    hour: 23,
                    minute: 59,
                    displayText: "Renewal deadline reached"
                },
                softBlock: {
                    description: "Account soft blocked and seat released",
                    month: lifecycle.softBlock.getUTCMonth(),
                    monthName: MONTH_NAMES[lifecycle.softBlock.getUTCMonth()],
                    day: lifecycle.softBlock.getUTCDate(),
                    dayOrdinal: getOrdinal(lifecycle.softBlock.getUTCDate()),
                    hour: 0,
                    minute: 5,
                    daysAfterDeadline: 0,
                    displayText: "Account access blocked",
                    warningText: data.softBlock?.warningText || "Your bus service has expired. Please renew."
                },
                hardDelete: {
                    description: "Account permanently deleted (+2 Sessions)",
                    month: lifecycle.hardDelete.getUTCMonth(),
                    monthName: MONTH_NAMES[lifecycle.hardDelete.getUTCMonth()],
                    day: lifecycle.hardDelete.getUTCDate(),
                    dayOrdinal: getOrdinal(lifecycle.hardDelete.getUTCDate()),
                    hour: 0,
                    minute: 5,
                    daysAfterDeadline: 365,
                    daysAfterSoftBlock: 365,
                    displayText: "Account permanently deleted",
                    criticalWarningText: data.hardDelete?.criticalWarningText || "Warning: Account will be permanently deleted."
                },
                urgentWarningThreshold: {
                    description: "Days before hard delete for warning",
                    days: data.urgentWarningThreshold?.days ?? 15,
                    displayText: "Critical warning period"
                },
                timeline: {
                    description: "Lifecycle timeline milestones",
                    events: [
                        { id: 'notification_start', date: { month: lifecycle.reminder1.getUTCMonth(), day: lifecycle.reminder1.getUTCDate() }, time: { hour: 0, minute: 5 }, label: 'Renewal notification sent', color: 'green', icon: 'bell' },
                        { id: 'renewal_deadline', date: { month: lifecycle.deadline.getUTCMonth(), day: lifecycle.deadline.getUTCDate() }, time: { hour: 23, minute: 59 }, label: 'Renewal deadline', color: 'orange', icon: 'calendar' },
                        { id: 'soft_block', date: { month: lifecycle.softBlock.getUTCMonth(), day: lifecycle.softBlock.getUTCDate() }, time: { hour: 0, minute: 5 }, label: 'Account access blocked', color: 'red', icon: 'lock' },
                        { id: 'hard_delete', date: { month: lifecycle.hardDelete.getUTCMonth(), day: lifecycle.hardDelete.getUTCDate() }, time: { hour: 0, minute: 5 }, label: 'Account permanently deleted', color: 'darkred', icon: 'trash', critical: true }
                    ]
                }
            };

            return populatedConfig;
        }

        throw new Error('Deadline configuration missing in database');
    } catch (error) {
        console.error('Error fetching deadline config:', error);
        throw new Error('Unstable network detected, please try again later');
    }
}

/**
 * Update deadline configuration in Firestore
 * Stores ONLY the academicSessionStart, warnings, and UI metadata
 */
export async function updateDeadlineConfig(config: DeadlineConfig, uid?: string): Promise<void> {
    try {
        const configToSave = {
            academicSessionStart: config.academicSessionStart,
            urgentWarningThreshold: config.urgentWarningThreshold,
            contactInfo: config.contactInfo,
            landingPage: config.landingPage,
            applicationProcess: config.applicationProcess,
            statistics: config.statistics,
            softBlock: {
                warningText: config.softBlock?.warningText || ""
            },
            hardDelete: {
                criticalWarningText: config.hardDelete?.criticalWarningText || ""
            },
            version: config.version,
            description: config.description,
            lastUpdated: new Date().toISOString(),
            lastUpdatedBy: uid || 'system'
        };

        await adminDb.collection(SETTINGS_COLLECTION).doc(DOC_ID).set(configToSave);
        console.log('✅ Deadline configuration updated in Firestore (purged derived fields)');
    } catch (error) {
        console.error('Error updating deadline config:', error);
        throw error;
    }
}
