/**
 * Pure helpers for GPS/display sanity (unit-testable, no I/O).
 */

export function isValidLatLng(lat: number, lng: number): boolean {
    if (lat === 0 && lng === 0) return false;
    return (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat) <= 90 &&
        Math.abs(lng) <= 180
    );
}

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 6371000;
    const φ1 = (a.lat * Math.PI) / 180;
    const φ2 = (b.lat * Math.PI) / 180;
    const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
    const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
    const x =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
    return R * c;
}

export function parseIsoMs(ts: string | undefined | null): number {
    if (!ts) return 0;
    const n = Date.parse(ts);
    return Number.isFinite(n) ? n : 0;
}

/** Reject stale out-of-order telemetry. */
export function isNewerTimestamp(incomingTs: string | undefined | null, lastTs: string | undefined | null): boolean {
    const a = parseIsoMs(incomingTs);
    const b = parseIsoMs(lastTs);
    if (!lastTs || b <= 0) return true;
    return a >= b - 500; // small clock skew tolerance
}

/**
 * Reject impossible jumps vs last accepted fix (telemetry glitch / duplicate tab).
 */
export function isImpossibleJump(
    prev: { lat: number; lng: number; atMs: number } | null,
    next: { lat: number; lng: number; atMs: number },
    maxMps: number
): boolean {
    if (!prev) return false;
    const dt = Math.max(1, (next.atMs - prev.atMs) / 1000);
    const d = haversineMeters(prev, next);
    return d / dt > maxMps;
}

export interface DisplayThrottleOpts {
    minIntervalMs: number;
    minMoveMeters: number;
    /** When tab hidden, require longer interval */
    hiddenIntervalMs: number;
}

export interface ThrottleState {
    lastEmitMs: number;
    lastLat?: number;
    lastLng?: number;
}

/**
 * Whether to push a UI update (student-side / map repaint).
 */
export function shouldEmitDisplayUpdate(
    next: { lat: number; lng: number },
    nowMs: number,
    state: ThrottleState | null,
    opts: DisplayThrottleOpts,
    pageHidden: boolean
): { emit: boolean; nextState: ThrottleState } {
    const interval = pageHidden ? opts.hiddenIntervalMs : opts.minIntervalMs;
    if (!state) {
        return {
            emit: true,
            nextState: { lastEmitMs: nowMs, lastLat: next.lat, lastLng: next.lng },
        };
    }
    const elapsed = nowMs - state.lastEmitMs;
    if (state.lastLat === undefined || state.lastLng === undefined) {
        return {
            emit: true,
            nextState: { lastEmitMs: nowMs, lastLat: next.lat, lastLng: next.lng },
        };
    }
    const moved = haversineMeters({ lat: state.lastLat, lng: state.lastLng }, next);
    if (elapsed >= interval || moved >= opts.minMoveMeters) {
        return {
            emit: true,
            nextState: { lastEmitMs: nowMs, lastLat: next.lat, lastLng: next.lng },
        };
    }
    return {
        emit: false,
        nextState: state,
    };
}
