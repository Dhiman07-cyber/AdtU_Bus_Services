export type MapFailureCategory =
    | "config"
    | "network"
    | "quota"
    | "auth"
    | "script"
    | "realtime"
    | "unknown";

export interface MapLogPayload {
    category: MapFailureCategory;
    code: string;
    detail?: Record<string, unknown>;
}

/**
 * Structured private logs for operators. Never show these strings to end users.
 */
export function logMapObservability(payload: MapLogPayload): void {
    const line = `[map:${payload.category}] ${payload.code}`;
    if (payload.detail && Object.keys(payload.detail).length > 0) {
        console.error(line, payload.detail);
    } else {
        console.error(line);
    }
}

export function classifyGoogleLoadError(message: string): MapFailureCategory {
    const m = message.toLowerCase();
    if (m.includes("quota") || m.includes("billing") || m.includes("over_map")) return "quota";
    if (m.includes("invalidkey") || m.includes("keyinvalid") || m.includes("api key")) return "config";
    if (m.includes("network") || m.includes("failed to fetch")) return "network";
    return "script";
}
