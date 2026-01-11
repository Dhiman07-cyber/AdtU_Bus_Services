import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import fs from 'fs';
import path from 'path';

const CONFIG_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'UI_Config.json');

/**
 * GET /api/settings/ui-config
 * Returns the UI configuration for landing page, application process, etc.
 */
export async function GET(req: NextRequest) {
    try {
        if (!fs.existsSync(CONFIG_FILE_PATH)) {
            return NextResponse.json(
                { message: 'UI configuration file not found' },
                { status: 404 }
            );
        }

        const configData = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
        const config = JSON.parse(configData);

        return NextResponse.json({
            config,
            source: 'json-file'
        });
    } catch (error: any) {
        console.error('Error reading UI config:', error);
        return NextResponse.json(
            { message: 'Failed to load UI configuration', error: error.message },
            { status: 500 }
        );
    }
}

/**
 * POST /api/settings/ui-config
 * Updates the UI configuration (admin only)
 */
export async function POST(req: NextRequest) {
    try {
        // Verify authentication
        const authHeader = req.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);

        // Check if user is admin
        const userDoc = await adminAuth.getUser(decodedToken.uid);
        const customClaims = userDoc.customClaims;
        if (customClaims?.role !== 'admin') {
            return NextResponse.json({ message: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const { config } = await req.json();

        if (!config) {
            return NextResponse.json({ message: 'Config data required' }, { status: 400 });
        }

        // Read current config
        let currentConfig = {};
        if (fs.existsSync(CONFIG_FILE_PATH)) {
            const currentData = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
            currentConfig = JSON.parse(currentData);
        }

        // Merge with updates
        const updatedConfig = {
            ...currentConfig,
            ...config,
            version: config.version || (currentConfig as any).version || "1.0.0",
            lastUpdated: new Date().toISOString().split('T')[0],
            lastUpdatedBy: decodedToken.uid
        };

        // Write to file
        fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(updatedConfig, null, 2), 'utf-8');

        console.log(`[UI-Config] Updated by ${decodedToken.email} at ${new Date().toISOString()}`);

        return NextResponse.json({
            message: 'UI configuration updated successfully',
            config: updatedConfig
        });
    } catch (error: any) {
        console.error('Error saving UI config:', error);
        return NextResponse.json(
            { message: 'Failed to save UI configuration', error: error.message },
            { status: 500 }
        );
    }
}
