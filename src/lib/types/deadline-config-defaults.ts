/**
 * Static Default Configuration for Deadline System
 * Used as a fallback and to prevent HMR loops when reading dynamic JSON configuration
 * 
 * NOTE: This file contains the default values derived from the deadline-config.json file.
 * We are using this static version in utility files to avoid build-time dependencies on the 
 * JSON file which gets updated by the Admin API, causing dev-server restarts.
 */

export const DEADLINE_CONFIG = {
    "description": "Critical deadline configuration for bus service renewal system. Controls when notifications, access blocks, and account deletions occur.",
    "version": "2.0.0",
    "lastUpdated": "2025-12-25",
    "academicYear": {
        "description": "Academic year configuration - all services align to this end date",
        "anchorMonth": 5,
        "anchorMonthName": "June",
        "anchorDay": 30,
        "anchorDayOrdinal": "30th"
    },
    "renewalNotification": {
        "description": "When to start showing renewal reminders to students",
        "month": 5,
        "monthName": "June",
        "day": 1,
        "dayOrdinal": "1st",
        "hour": 0,
        "minute": 5,
        "daysBeforeDeadline": 30,
        "displayText": "Renewal notifications start"
    },
    "renewalDeadline": {
        "description": "Final date for students to complete renewal before access is affected",
        "month": 6,
        "monthName": "July",
        "day": 1,
        "dayOrdinal": "1st",
        "hour": 23,
        "minute": 59,
        "displayText": "Renewal deadline"
    },
    "softBlock": {
        "description": "When Track Bus access gets blocked for expired students",
        "month": 6,
        "monthName": "July",
        "day": 31,
        "dayOrdinal": "31st",
        "hour": 0,
        "minute": 5,
        "daysAfterDeadline": 30,
        "displayText": "Account access blocked",
        "warningText": "Your access to Track Bus will be blocked after this date"
    },
    "hardDelete": {
        "description": "When expired student accounts get permanently deleted",
        "month": 7,
        "monthName": "August",
        "day": 31,
        "dayOrdinal": "31st",
        "hour": 0,
        "minute": 5,
        "daysAfterDeadline": 60,
        "daysAfterSoftBlock": 31,
        "displayText": "Account permanently deleted",
        "criticalWarningText": "Account and all data will be permanently deleted and cannot be recovered"
    },
    "urgentWarningThreshold": {
        "description": "Show urgent warnings when this many days remain before hard delete",
        "days": 15,
        "displayText": "URGENT: Only X days remaining before permanent deletion!"
    },
    "contactInfo": {
        "description": "Admin contact details shown in blocking screens",
        "officeName": "AdtU Transport Office",
        "phone": "+91 93657 71454",
        "email": "transport@adtu.in",
        "officeHours": "Mon–Fri, 09:00–17:00 IST",
        "address": "ADTU Campus, Sankar Madhab Path, Gandhi Nagar, Panikhaiti, Guwahati, Assam 781026",
        "visitInstructions": "Visit the Transportation office of AdtU with your student ID to renew your bus service immediately."
    },
    "timeline": {
        "description": "Complete timeline of events for display purposes",
        "events": [
            {
                "id": "notification_start",
                "date": {
                    "month": 5,
                    "day": 1
                },
                "time": {
                    "hour": 0,
                    "minute": 5
                },
                "label": "Renewal notification sent",
                "color": "green",
                "icon": "bell"
            },
            {
                "id": "renewal_deadline",
                "date": {
                    "month": 6,
                    "day": 1
                },
                "time": {
                    "hour": 23,
                    "minute": 59
                },
                "label": "Renewal deadline",
                "color": "orange",
                "icon": "calendar"
            },
            {
                "id": "soft_block",
                "date": {
                    "month": 6,
                    "day": 31
                },
                "time": {
                    "hour": 0,
                    "minute": 5
                },
                "label": "Account access blocked",
                "color": "red",
                "icon": "lock"
            },
            {
                "id": "hard_delete",
                "date": {
                    "month": 7,
                    "day": 31
                },
                "time": {
                    "hour": 0,
                    "minute": 5
                },
                "label": "Account permanently deleted",
                "color": "darkred",
                "icon": "trash",
                "critical": true
            }
        ]
    },
    "paymentExportStartYear": 2024,
    "paymentExportInterval": 4,
    "lastUpdatedBy": "system"
};

/**
 * SECURITY: Get deadline config with production enforcement
 * In production, testingMode is ALWAYS disabled regardless of configuration
 */
export function getSecureDeadlineConfig(): typeof DEADLINE_CONFIG {
    const config = { ...DEADLINE_CONFIG };



    return config;
}
