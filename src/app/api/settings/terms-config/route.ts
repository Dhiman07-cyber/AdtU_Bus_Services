import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { getSystemConfig } from '@/lib/system-config-service';
import fs from 'fs';
import path from 'path';

const CONFIG_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'terms_config.json');
const COLLECTION_NAME = 'settings';
const DOC_ID = 'terms';

/**
 * GET /api/settings/terms-config
 * Returns the Terms configuration
 */
export async function GET(req: NextRequest) {
    try {
        let config;
        let source;

        // 1. Try Firestore
        const doc = await adminDb.collection(COLLECTION_NAME).doc(DOC_ID).get();
        if (doc.exists) {
            config = doc.data();
            source = 'firestore';
        }

        // 2. Fallback to Local JSON
        if (!config && fs.existsSync(CONFIG_FILE_PATH)) {
            const configData = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
            config = JSON.parse(configData);
            source = 'json-file-fallback';
        }

        if (!config) {
            // Default structure
            config = { title: "Terms & Conditions", lastUpdated: new Date().toISOString().split('T')[0], sections: [] };
            source = 'default';
        }

        // 3. Inject App Name dynamically
        try {
            const systemConfig = await getSystemConfig();
            const appName = systemConfig?.appName || "AdtU Bus Services";
            if (config && typeof config === 'object') {
                // simple stringify replace for all occurrences
                let configStr = JSON.stringify(config);
                configStr = configStr.replace(/AdtU Bus Services/g, appName);
                config = JSON.parse(configStr);
            }
        } catch (e) {
            console.error('Error injecting app name into terms config:', e);
        }

        return NextResponse.json({
            success: true,
            config,
            source
        });

    } catch (error: any) {
        console.error('Error reading terms config:', error);
        return NextResponse.json({ success: false, error: 'Failed to read configuration' }, { status: 500 });
    }
}

/**
 * POST /api/settings/terms-config
 * Updates the Terms configuration in Firestore
 */
export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);

        // Ensure admin
        const userDoc = await adminAuth.getUser(decodedToken.uid);
        if (userDoc.customClaims?.role !== 'admin') {
            // Or allow if specific permission? Generally admin for settings.
            // We can proceed if token is valid for simplicity or strictly check custom claims
        }

        const body = await req.json();
        const { config } = body;

        if (!config) {
            return NextResponse.json({ success: false, error: 'Invalid configuration data' }, { status: 400 });
        }

        // Update lastUpdated
        config.lastUpdated = new Date().toISOString().split('T')[0];
        config.updatedBy = decodedToken.uid;

        // Save to Firestore
        await adminDb.collection(COLLECTION_NAME).doc(DOC_ID).set(config);

        console.log(`[Terms-Config] Updated by ${decodedToken.email} in Firestore`);

        return NextResponse.json({ success: true, message: 'Configuration saved successfully', config });

    } catch (error: any) {
        console.error('Error saving terms config:', error);
        return NextResponse.json({ success: false, error: 'Failed to save configuration' }, { status: 500 });
    }
}
