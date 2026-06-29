/**
 * Shared Firestore collection name constants.
 *
 * Every service and API route that references a Firestore collection
 * MUST import the name from here to prevent silent drift.
 */

/** Top-level settings document collection (deadline, ui, system config, etc.) */
export const SETTINGS_COLLECTION = 'settings';
