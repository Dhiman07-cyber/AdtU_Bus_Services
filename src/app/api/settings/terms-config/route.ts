import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth } from '@/lib/security/api-auth';
import { getSystemConfig } from '@/lib/system-config-service';
import { sanitizeLegalConfig } from '@/lib/security/object-safety';
import { SETTINGS_COLLECTION } from '@/config/firestore-collections';
const DOC_ID = 'terms';
const FALLBACK_TITLE = 'Terms & Conditions';

/**
 * GET /api/settings/terms-config
 * Returns the Terms configuration
 */
export async function GET(req: NextRequest) {
    try {
        let config;
        let source;

        // 1. Try Firestore
        const doc = await adminDb.collection(SETTINGS_COLLECTION).doc(DOC_ID).get();
        if (doc.exists) {
            config = doc.data();
            source = 'firestore';
        }

        // 2. No Fallback allowed

        if (!config) {
            // Default structure
            config = { title: FALLBACK_TITLE, lastUpdated: new Date().toISOString().split('T')[0], sections: [] };
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
        const auth = await verifyApiAuth(req, ['admin']);
        if (!auth.authenticated) return auth.response;

        const body = await req.json();
        const { config } = body;

        if (!config || typeof config !== 'object' || Array.isArray(config)) {
            return NextResponse.json({ success: false, error: 'Invalid configuration data' }, { status: 400 });
        }

        const safeConfig = sanitizeLegalConfig(config, FALLBACK_TITLE);
        safeConfig.lastUpdated = new Date().toISOString().split('T')[0];

        // Save to Firestore
        await adminDb.collection(SETTINGS_COLLECTION).doc(DOC_ID).set(safeConfig);

        return NextResponse.json({ success: true, message: 'Configuration saved successfully', config: safeConfig });

    } catch (error: any) {
        console.error('Error saving terms config:', error);
        return NextResponse.json({ success: false, error: 'Failed to save configuration' }, { status: 500 });
    }
}
