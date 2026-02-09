import { adminDb } from './firebase-admin';
import { DeadlineConfig } from './types/deadline-config';

const COLLECTION_NAME = 'settings';
const DOC_ID = 'deadline';

/**
 * Get deadline configuration from Firestore
 * NO FALLBACK - Firestore is the single source of truth
 */
export async function getDeadlineConfig(): Promise<DeadlineConfig> {
    try {
        const doc = await adminDb.collection(COLLECTION_NAME).doc(DOC_ID).get();

        if (doc.exists) {
            return doc.data() as DeadlineConfig;
        }

        // NO FALLBACK allowed per user requirement.
        // If config is missing in Firestore, it's a critical error.
        throw new Error('Deadline configuration missing in database');
    } catch (error) {
        console.error('Error fetching deadline config:', error);
        // THROW to prevent usage of stale/hardcoded data
        throw new Error('Unstable network detected, please try again later');
    }
}

/**
 * Update deadline configuration in Firestore
 */
export async function updateDeadlineConfig(config: DeadlineConfig, uid?: string): Promise<void> {
    try {
        const configToSave = {
            ...config,
            lastUpdated: new Date().toISOString(),
            lastUpdatedBy: uid || 'system'
        };

        // Remove redundant/UI-only fields if necessary, ensuring we keep the core rules
        // For deadline config, almost everything is essential logic, so we keep it structure-intact.

        await adminDb.collection(COLLECTION_NAME).doc(DOC_ID).set(configToSave, { merge: true });

        // Note: We do NOT write to local JSON file to avoid Vercel ephemeral issues.
        // The source of truth moves to Firestore.

        console.log('✅ Deadline configuration updated in Firestore');
    } catch (error) {
        console.error('Error updating deadline config:', error);
        throw error;
    }
}
