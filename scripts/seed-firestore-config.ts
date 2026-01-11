/**
 * Firestore Config Seeder
 * 
 * Seeds the config/runtime document with safety settings.
 * Run this once after deployment to initialize runtime configuration.
 * 
 * Usage:
 *   npx tsx scripts/seed-firestore-config.ts
 * 
 * @module scripts/seed-firestore-config
 * @version 1.0.0
 * @since 2026-01-02
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin
function initAdmin() {
    if (getApps().length === 0) {
        const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        if (serviceAccount) {
            initializeApp({
                credential: cert(JSON.parse(serviceAccount)),
            });
        } else {
            // Use default credentials (for local dev with gcloud auth)
            initializeApp({
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            });
        }
    }
    return getFirestore();
}

async function seedConfig() {
    console.log('🌱 Seeding Firestore config documents...');
    console.log('');

    const db = initAdmin();

    try {
        // 1. Seed config/runtime
        console.log('📝 Creating config/runtime...');
        await db.doc('config/runtime').set({
            firestoreRealtimeEnabled: false, // Start with realtime DISABLED for safety
            maxQueryLimit: 50,
            pollingIntervalMs: 120000,
            notificationPollingIntervalMs: 60000,
            visibilityDebounceMs: 3000,
            updateDebounceMs: 2000,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            description: 'Runtime configuration for Firestore safety controls',
        }, { merge: true });
        console.log('   ✅ config/runtime created');

        // 2. Seed config/limits
        console.log('📝 Creating config/limits...');
        await db.doc('config/limits').set({
            maxQueryLimit: 50,
            maxNotificationsPerQuery: 100,
            maxRecipientsPerNotification: 1000,
            maxTitleLength: 200,
            maxContentLength: 5000,
            createdAt: FieldValue.serverTimestamp(),
            description: 'Query and data limits for Firestore safety',
        }, { merge: true });
        console.log('   ✅ config/limits created');

        // 3. Seed systemSignals/admin/latest (initial empty signal)
        console.log('📝 Creating systemSignals/admin/latest...');
        await db.doc('systemSignals/admin/latest').set({
            id: 'latest',
            type: 'initial',
            reason: 'System initialized',
            updatedAt: FieldValue.serverTimestamp(),
            payload: {
                message: 'No changes yet',
            },
        }, { merge: true });
        console.log('   ✅ systemSignals/admin/latest created');

        console.log('');
        console.log('='.repeat(50));
        console.log('✅ All config documents seeded successfully!');
        console.log('');
        console.log('IMPORTANT NOTES:');
        console.log('  1. firestoreRealtimeEnabled is set to FALSE by default');
        console.log('  2. To enable realtime, set NEXT_PUBLIC_ENABLE_FIRESTORE_REALTIME=true in env');
        console.log('  3. You can also toggle via Firebase console: config/runtime.firestoreRealtimeEnabled');
        console.log('');

    } catch (error) {
        console.error('❌ Error seeding config:', error);
        process.exit(1);
    }
}

seedConfig();
