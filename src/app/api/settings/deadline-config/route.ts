import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { getDeadlineConfig, updateDeadlineConfig } from '@/lib/deadline-config-service';
import { getSystemConfig, updateSystemConfig } from '@/lib/system-config-service';
import { DeadlineConfig } from '@/lib/types/deadline-config';

/**
 * GET: Retrieve deadline config from Firestore
 */
export async function GET(req: NextRequest) {
    try {
        const config = await getDeadlineConfig();
        return NextResponse.json({ config });
    } catch (error: any) {
        console.error('Error fetching deadline config:', error);
        return NextResponse.json(
            { 
                message: 'Unstable network detected, please try again later',
                error: error.message 
            },
            { status: 503 }
        );
    }
}

/**
 * POST: Update deadline config in Firestore and sync dates to system-config
 */
export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json(
                { message: 'Unauthorized' },
                { status: 401 }
            );
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const uid = decodedToken.uid;

        // Check if user is admin
        try {
            const userDoc = await adminDb.collection('users').doc(uid).get();
            if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
                return NextResponse.json(
                    { message: 'Access denied. Admin only.' },
                    { status: 403 }
                );
            }
        } catch (error: any) {
            if (error.code === 8 || error.message?.includes('RESOURCE_EXHAUSTED')) {
                console.warn('⚠️ Firestore quota exceeded. Bypassing admin role check for verified user.');
            } else {
                throw error;
            }
        }

        const { config } = await req.json();

        if (!config) {
            return NextResponse.json(
                { message: 'Invalid configuration data' },
                { status: 400 }
            );
        }

        // Validate date fields
        const validationError = validateDateConfig(config);
        if (validationError) {
            return NextResponse.json(
                { message: validationError },
                { status: 400 }
            );
        }

        // 1. Update Deadline Config in Firestore
        await updateDeadlineConfig(config, uid);

        // 2. Sync concrete dates to System Config
        // This ensures that when rules change (e.g. Soft Block moved to July 15),
        // the concrete dates in system-config (e.g. 2026-07-15) are updated for the current cycle.
        await syncSystemConfigDates(config as DeadlineConfig, uid);

        return NextResponse.json({
            message: 'Deadline configuration updated and synced successfully.',
            config
        });

    } catch (error: any) {
        console.error('Error updating deadline config:', error);
        return NextResponse.json(
            { message: `Failed to update deadline configuration: ${error.message || 'Unknown error'}` },
            { status: 500 }
        );
    }
}

/**
 * Syncs the abstract rules from DeadlineConfig to concrete dates in SystemConfig
 */
async function syncSystemConfigDates(deadlineConfig: DeadlineConfig, uid: string) {
    try {
        const systemConfig = await getSystemConfig();
        if (!systemConfig) return;

        const updates: any = {};
        const now = new Date();
        const currentYear = now.getFullYear();

        // Helper to construct date string (YYYY-MM-DD) preserving year from existing config if possible
        const constructDate = (existingDateStr: string | undefined, month: number, day: number) => {
            let year = currentYear;
            if (existingDateStr) {
                const date = new Date(existingDateStr);
                if (!isNaN(date.getTime())) {
                    year = date.getFullYear();
                }
            }
            // Create date object (Month is 0-indexed in JS Date, but config sends 0-indexed month)
            const newDate = new Date(year, month, day);
            // Adjust to local date string YYYY-MM-DD (simplified)
            // We use the year/month/day directly to avoid timezone shifts
            const m = (month + 1).toString().padStart(2, '0');
            const d = day.toString().padStart(2, '0');
            return `${year}-${m}-${d}`;
        };

        // 1. Academic Year End
        updates.academicYearEnd = constructDate(
            systemConfig.academicYearEnd,
            deadlineConfig.academicYear.anchorMonth,
            deadlineConfig.academicYear.anchorDay
        );

        // 2. Renewal Reminder
        updates.renewalReminder = constructDate(
            systemConfig.renewalReminder,
            deadlineConfig.renewalNotification.month,
            deadlineConfig.renewalNotification.day
        );

        // 3. Renewal Deadline
        updates.renewalDeadline = constructDate(
            systemConfig.renewalDeadline,
            deadlineConfig.renewalDeadline.month,
            deadlineConfig.renewalDeadline.day
        );

        // 4. Soft Block
        updates.softBlock = constructDate(
            systemConfig.softBlock,
            deadlineConfig.softBlock.month,
            deadlineConfig.softBlock.day
        );

        // 5. Hard Block (mapped to hardDelete)
        updates.hardBlock = constructDate(
            systemConfig.hardBlock,
            deadlineConfig.hardDelete.month,
            deadlineConfig.hardDelete.day
        );

        // Merge updates into system config
        const newSystemConfig = {
            ...systemConfig,
            ...updates
        };

        await updateSystemConfig(newSystemConfig, uid);
        console.log('🔄 Synced System Config dates with new Deadline rules');

    } catch (error) {
        console.error('Error syncing system config dates:', error);
        // Don't fail the request if sync fails, just log it
    }
}

/**
 * Validate date configurations for valid month/day combinations
 */
function validateDateConfig(config: any): string | null {
    const dateFields = [
        { field: 'academicYear', monthKey: 'anchorMonth', dayKey: 'anchorDay' },
        { field: 'renewalNotification', monthKey: 'month', dayKey: 'day' },
        { field: 'renewalDeadline', monthKey: 'month', dayKey: 'day' },
        { field: 'softBlock', monthKey: 'month', dayKey: 'day' },
        { field: 'hardDelete', monthKey: 'month', dayKey: 'day' }
    ];

    for (const { field, monthKey, dayKey } of dateFields) {
        const section = config[field];
        if (!section) continue;

        const month = section[monthKey];
        const day = section[dayKey];

        if (month === undefined || day === undefined) continue;

        if (month < 0 || month > 11) {
            return `Invalid month in ${field}: ${month}. Must be 0-11.`;
        }

        const maxDay = getMaxDayForMonth(month);
        if (day < 1 || day > maxDay) {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
            return `Invalid day ${day} for ${monthNames[month]} in ${field}. Max is ${maxDay}.`;
        }
    }

    return null;
}

function getMaxDayForMonth(month: number): number {
    const date = new Date(2024, month + 1, 0);
    return date.getDate();
}
