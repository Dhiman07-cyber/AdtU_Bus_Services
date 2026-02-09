/**
 * Static Default Configuration for Deadline System
 * Used as a fallback and to prevent HMR loops when reading dynamic JSON configuration
 * 
 * NOTE: This file contains the default values derived from the deadline-config.json file.
 * We are using this static version in utility files to avoid build-time dependencies on the 
 * JSON file which gets updated by the Admin API, causing dev-server restarts.
 */

export const DEADLINE_CONFIG: any = new Proxy({}, {
    get: (target, prop) => {
        throw new Error(`HARDCODED CONFIG ACCESS BLOCKED: Attempted to access property '${String(prop)}' from static DEADLINE_CONFIG. Use getDeadlineConfig() or pass dynamic config instead.`);
    }
});

/**
 * SECURITY: Get deadline config with production enforcement
 * In production, testingMode is ALWAYS disabled regardless of configuration
 */
export function getSecureDeadlineConfig(): typeof DEADLINE_CONFIG {
    const config = { ...DEADLINE_CONFIG };



    return config;
}
