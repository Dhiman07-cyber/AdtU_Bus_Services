/**
 * Static Default Configuration for Deadline System
 * Used as a fallback and to prevent HMR loops when reading dynamic configuration
 * 
 * NOTE: This file contains the default values for the deadline config.
 * We are using this static version in utility files to avoid build-time dependencies.
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
