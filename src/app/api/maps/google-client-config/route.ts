import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { getSystemConfig } from '@/lib/system-config-service';
import { applyRateLimit, createRateLimitId, RateLimits } from '@/lib/security/rate-limiter';
import { logMapObservability } from '@/lib/maps/map-observability';

const ALLOWED_ROLES = new Set(['student', 'driver', 'admin']);

function mapsGloballyDisabled(): boolean {
    return process.env.DISABLE_GOOGLE_MAPS === '1' || process.env.DISABLE_GOOGLE_MAPS === 'true';
}

/**
 * Returns Google Maps JS API key only when:
 * - Caller is authenticated (Firebase ID token)
 * - User role is student, driver, or admin
 * - System config mapProvider is google
 * - Server has GOOGLE_MAPS_API_KEY and maps are not emergency-disabled
 *
 * Never returns explanatory errors to clients — only ok: false for failures.
 */
export async function GET(req: NextRequest) {
    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ ok: false }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
        }

        const token = authHeader.slice(7);
        let decoded;
        try {
            decoded = await adminAuth.verifyIdToken(token);
        } catch {
            logMapObservability({ category: 'auth', code: 'maps_bootstrap_token_invalid' });
            return NextResponse.json({ ok: false }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
        }

        const uid = decoded.uid;
        const userRl = await applyRateLimit(createRateLimitId(uid, 'maps-google-client-config'), RateLimits.MAPS_CLIENT_CONFIG);
        if (!userRl.allowed) {
            return NextResponse.json(
                { ok: false },
                { status: 429, headers: { ...userRl.headers, 'Cache-Control': 'no-store' } }
            );
        }

        const userDoc = await adminDb.collection('users').doc(uid).get();
        const role = userDoc.exists ? String(userDoc.data()?.role || '') : '';
        if (!ALLOWED_ROLES.has(role)) {
            logMapObservability({ category: 'auth', code: 'maps_bootstrap_role_denied', detail: { uid } });
            return NextResponse.json({ ok: false }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
        }

        if (mapsGloballyDisabled()) {
            logMapObservability({ category: 'config', code: 'maps_disabled_flag', detail: { uid } });
            return NextResponse.json({ ok: false }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
        }

        let sys;
        try {
            sys = await getSystemConfig();
        } catch (e) {
            logMapObservability({ category: 'config', code: 'maps_bootstrap_system_config_failed', detail: { message: String(e) } });
            return NextResponse.json({ ok: false }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
        }

        if (sys.mapProvider !== 'google') {
            return NextResponse.json({ ok: false }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
        }

        const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
        if (!apiKey) {
            logMapObservability({ category: 'config', code: 'maps_bootstrap_missing_server_key' });
            return NextResponse.json({ ok: false }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
        }

        return NextResponse.json(
            { ok: true, apiKey },
            { status: 200, headers: { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' } }
        );
    } catch (e) {
        logMapObservability({ category: 'unknown', code: 'maps_bootstrap_unhandled', detail: { message: String(e) } });
        return NextResponse.json({ ok: false }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
    }
}
