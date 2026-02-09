import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import fs from 'fs';
import path from 'path';

const CONFIG_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'UI_Config.json');
const COLLECTION_NAME = 'settings';
const DOC_ID = 'ui';

/**
 * GET /api/settings/ui-config
 * Returns the UI configuration from Firestore (or fallback to local JSON)
 */
export async function GET(req: NextRequest) {
    try {
        // 1. Try fetching from Firestore
        const doc = await adminDb.collection(COLLECTION_NAME).doc(DOC_ID).get();

        if (doc.exists) {
            return NextResponse.json({
                config: doc.data(),
                source: 'firestore'
            });
        }

        // 2. Fallback to local JSON
        if (fs.existsSync(CONFIG_FILE_PATH)) {
            const configData = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
            const config = JSON.parse(configData);
            return NextResponse.json({
                config,
                source: 'json-file-fallback'
            });
        }

        return NextResponse.json(
            { message: 'UI configuration file not found' },
            { status: 404 }
        );
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
 * Updates the UI configuration in Firestore
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

        // Get current config (from Firestore or File) to merge
        let currentConfig = {};
        const doc = await adminDb.collection(COLLECTION_NAME).doc(DOC_ID).get();
        if (doc.exists) {
            currentConfig = doc.data() || {};
        } else if (fs.existsSync(CONFIG_FILE_PATH)) {
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

        // Write to Firestore (Primary)
        await adminDb.collection(COLLECTION_NAME).doc(DOC_ID).set(updatedConfig);

        console.log(`[UI-Config] Updated by ${decodedToken.email} in Firestore`);

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
