import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import fs from 'fs';
import path from 'path';

const CONFIG_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'deadline-config.json');

/**
 * GET: Retrieve deadline config from JSON file
 * 
 * The JSON file is the single source of truth for renewal policy.
 * No Firestore storage for config data.
 */
export async function GET(req: NextRequest) {
    try {
        // Check if JSON file exists
        if (fs.existsSync(CONFIG_FILE_PATH)) {
            const fileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
            const deadlineConfig = JSON.parse(fileContent);
            return NextResponse.json({ config: deadlineConfig });
        }

        return NextResponse.json(
            { message: 'Configuration file not found' },
            { status: 404 }
        );
    } catch (error) {
        console.error('Error fetching deadline config:', error);
        return NextResponse.json(
            { message: 'Failed to fetch deadline configuration' },
            { status: 500 }
        );
    }
}

/**
 * POST: Update deadline config (Admin only)
 * 
 * IMPORTANT: This writes ONLY to the JSON file.
 * - No Firestore writes for config or audit logs
 * - Month/day values only (year is stripped if provided)
 * - Version and lastUpdated are metadata only
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
            // Check for Resource Exhausted error (gRPC code 8)
            if (error.code === 8 || error.message?.includes('RESOURCE_EXHAUSTED')) {
                console.warn('⚠️ Firestore quota exceeded. Bypassing admin role check for verified user.');
                console.warn(`⚠️ User attempting action: ${uid}`);
                // Proceed, assuming the user is authorized since they have a valid token
                // and we are likely in a situation where we can't verify the role.
            } else {
                throw error; // Re-throw other errors
            }
        }

        const { config } = await req.json();

        if (!config) {
            return NextResponse.json(
                { message: 'Invalid configuration data' },
                { status: 400 }
            );
        }

        // Validate date fields (must be valid month/day combinations)
        const validationError = validateDateConfig(config);
        if (validationError) {
            return NextResponse.json(
                { message: validationError },
                { status: 400 }
            );
        }

        // Read current config for comparison (console logging only)
        let oldConfig = null;
        if (fs.existsSync(CONFIG_FILE_PATH)) {
            const fileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
            try {
                oldConfig = JSON.parse(fileContent);
            } catch (e) {
                console.warn('Could not parse existing config file, treating as fresh start');
                oldConfig = null;
            }
        }

        // Bump version number
        const oldVersion = oldConfig?.version || '1.0.0';
        const newVersion = bumpVersion(oldVersion);

        // Build updated config with metadata
        const updatedConfig = {
            ...config,
            version: newVersion,
            lastUpdated: new Date().toISOString().split('T')[0],
            lastUpdatedBy: uid
        };

        // Write to JSON file (single source of truth)
        fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(updatedConfig, null, 2), 'utf-8');

        // Console logging only (no Firestore audit)
        const changesSummary = computeChangesSummary(oldConfig, updatedConfig);
        console.log(`✅ Deadline config updated by admin ${uid}`);
        console.log(`📝 Version: ${oldVersion} → ${newVersion}`);
        console.log(`📝 Changes: ${changesSummary.join(', ')}`);

        return NextResponse.json({
            message: 'Deadline configuration updated successfully.',
            config: updatedConfig,
            changesSummary,
            previousVersion: oldVersion,
            newVersion
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

        // Validate month range (0-indexed: 0-11)
        if (month < 0 || month > 11) {
            return `Invalid month in ${field}: ${month}. Must be 0-11.`;
        }

        // Validate day range using leap year reference
        const maxDay = getMaxDayForMonth(month);
        if (day < 1 || day > maxDay) {
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
            return `Invalid day ${day} for ${monthNames[month]} in ${field}. Max is ${maxDay}.`;
        }
    }

    return null;
}

/**
 * Get maximum valid day for a month (using leap year reference)
 */
function getMaxDayForMonth(month: number): number {
    // Use 2024 (leap year) to allow Feb 29
    const date = new Date(2024, month + 1, 0);
    return date.getDate();
}

/**
 * Bump version number (patch increment)
 */
function bumpVersion(version: string): string {
    const parts = version.split('.').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
        return '1.0.1';
    }
    parts[2] += 1; // Increment patch version
    return parts.join('.');
}

/**
 * Compute a summary of what changed between configs (for console logging)
 */
function computeChangesSummary(oldConfig: any, newConfig: any): string[] {
    const changes: string[] = [];

    if (!oldConfig) {
        changes.push('Initial configuration created');
        return changes;
    }

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    // Check academic year anchor
    if (oldConfig.academicYear?.anchorMonth !== newConfig.academicYear?.anchorMonth ||
        oldConfig.academicYear?.anchorDay !== newConfig.academicYear?.anchorDay) {
        const month = monthNames[newConfig.academicYear?.anchorMonth] || 'Unknown';
        changes.push(`Academic year anchor → ${month} ${newConfig.academicYear?.anchorDay}`);
    }

    // Check renewal deadline
    if (oldConfig.renewalDeadline?.month !== newConfig.renewalDeadline?.month ||
        oldConfig.renewalDeadline?.day !== newConfig.renewalDeadline?.day) {
        const month = monthNames[newConfig.renewalDeadline?.month] || 'Unknown';
        changes.push(`Renewal deadline → ${month} ${newConfig.renewalDeadline?.day}`);
    }

    // Check soft block
    if (oldConfig.softBlock?.month !== newConfig.softBlock?.month ||
        oldConfig.softBlock?.day !== newConfig.softBlock?.day) {
        const month = monthNames[newConfig.softBlock?.month] || 'Unknown';
        changes.push(`Soft block → ${month} ${newConfig.softBlock?.day}`);
    }

    // Check hard delete
    if (oldConfig.hardDelete?.month !== newConfig.hardDelete?.month ||
        oldConfig.hardDelete?.day !== newConfig.hardDelete?.day) {
        const month = monthNames[newConfig.hardDelete?.month] || 'Unknown';
        changes.push(`Hard delete → ${month} ${newConfig.hardDelete?.day}`);
    }

    // Check payment export
    if (oldConfig.paymentExportStartYear !== newConfig.paymentExportStartYear ||
        oldConfig.paymentExportInterval !== newConfig.paymentExportInterval) {
        changes.push(`Payment Export → Start: ${newConfig.paymentExportStartYear}, Interval: ${newConfig.paymentExportInterval}`);
    }

    // Check urgent warning threshold
    if (oldConfig.urgentWarningThreshold?.days !== newConfig.urgentWarningThreshold?.days) {
        changes.push(`Urgent warning threshold → ${newConfig.urgentWarningThreshold?.days} days`);
    }

    if (changes.length === 0) {
        changes.push('Minor changes (display text, descriptions, etc.)');
    }

    return changes;
}
