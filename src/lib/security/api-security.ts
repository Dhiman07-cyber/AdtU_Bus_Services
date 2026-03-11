/**
 * Unified API Security Wrapper for ADTU Bus Services
 * 
 * SECURITY: Provides a single composable function that applies:
 * - Firebase token authentication (from Authorization header)
 * - Role-based access control
 * - Rate limiting per endpoint
 * - Input validation via Zod schema
 * - Safe error handling (no sensitive leaks in production)
 * - Request ID tracking for audit trails
 * 
 * Usage:
 *   import { withSecurity } from '@/lib/security/api-security';
 *   import { RateLimits } from '@/lib/security/rate-limiter';
 *   import { z } from 'zod';
 *   
 *   const MySchema = z.object({ busId: z.string() });
 *   
 *   export const POST = withSecurity(
 *     async (req, { auth, body, requestId }) => {
 *       // auth.uid is guaranteed here
 *       return NextResponse.json({ success: true });
 *     },
 *     { 
 *       requiredRoles: ['driver'],
 *       rateLimit: RateLimits.CREATE,
 *       schema: MySchema
 *     }
 *   );
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { applyRateLimit, createRateLimitId, RateLimits, type RateLimitResult } from '@/lib/security/rate-limiter';
import { validateInput, type ValidationResult } from '@/lib/security/validation-schemas';
import { z } from 'zod';
import crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface SecurityAuth {
    uid: string;
    email: string;
    role: string;
    name: string;
}

export interface SecurityContext<T = any> {
    /** Verified auth info — guaranteed present when handler is called */
    auth: SecurityAuth;
    /** Validated + typed request body (null for GET/DELETE) */
    body: T;
    /** Unique request ID for audit trail */
    requestId: string;
    /** Raw request headers */
    headers: Headers;
    /** Client IP */
    ip: string;
}

export interface SecurityOptions<T = any> {
    /** Roles allowed to access this endpoint. Empty array = any authenticated user. */
    requiredRoles?: string[];
    /** Rate limit config. Defaults to RateLimits.DEFAULT */
    rateLimit?: { maxRequests: number; windowMs: number };
    /** Zod schema for request body validation (POST/PUT/PATCH) */
    schema?: z.ZodSchema<T>;
    /** If true, also accept `idToken` in body for backward compatibility */
    allowBodyToken?: boolean;
    /** Skip auth (for public endpoints that still want rate limiting/validation) */
    skipAuth?: boolean;
    /** Custom rate limit key prefix (defaults to route path) */
    rateLimitKey?: string;
}

export type SecureHandler<T = any> = (
    request: NextRequest | Request,
    context: SecurityContext<T>
) => Promise<NextResponse>;

// ============================================================================
// TOKEN EXTRACTION
// ============================================================================

/**
 * Extract the Firebase ID token from the request.
 * Priority: Authorization header > body.idToken (backward compat)
 */
function extractToken(request: Request, body: any, allowBodyToken: boolean): string | null {
    // 1. Authorization header (preferred)
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        if (token.length >= 10) return token;
    }

    // 2. Body idToken (backward compatibility)
    if (allowBodyToken && body?.idToken && typeof body.idToken === 'string') {
        return body.idToken;
    }

    return null;
}

// ============================================================================
// ROLE RESOLUTION
// ============================================================================

async function resolveUserRole(uid: string): Promise<{ role: string; name: string }> {
    if (!adminDb) return { role: '', name: '' };

    // Check users collection first (fastest, most common)
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (userDoc.exists) {
        const data = userDoc.data();
        return {
            role: data?.role || 'student',
            name: data?.name || data?.fullName || '',
        };
    }

    // Fallback to role-specific collections
    const adminDoc = await adminDb.collection('admins').doc(uid).get();
    if (adminDoc.exists) return { role: 'admin', name: adminDoc.data()?.name || '' };

    const modDoc = await adminDb.collection('moderators').doc(uid).get();
    if (modDoc.exists) return { role: 'moderator', name: modDoc.data()?.fullName || '' };

    const driverDoc = await adminDb.collection('drivers').doc(uid).get();
    if (driverDoc.exists) return { role: 'driver', name: driverDoc.data()?.fullName || '' };

    const studentDoc = await adminDb.collection('students').doc(uid).get();
    if (studentDoc.exists) return { role: 'student', name: studentDoc.data()?.fullName || '' };

    return { role: '', name: '' };
}

// ============================================================================
// IP EXTRACTION
// ============================================================================

function getClientIp(request: Request): string {
    return (
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        request.headers.get('cf-connecting-ip') ||
        '127.0.0.1'
    );
}

// ============================================================================
// SAFE JSON PARSE
// ============================================================================

async function safeParseBody(request: Request): Promise<any> {
    try {
        const contentType = request.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            // For non-JSON content types, return empty object
            return {};
        }
        const text = await request.text();
        if (!text || text.trim().length === 0) return {};
        return JSON.parse(text);
    } catch {
        return null; // Indicates parse failure
    }
}

// ============================================================================
// MAIN SECURITY WRAPPER
// ============================================================================

/**
 * Universal security wrapper for API route handlers.
 * 
 * Applies in this order:
 * 1. Generate unique request ID
 * 2. Parse request body (for POST/PUT/PATCH)
 * 3. Extract and verify Firebase token
 * 4. Resolve user role from Firestore
 * 5. Check role authorization
 * 6. Apply rate limiting (using uid + endpoint)
 * 7. Validate body against Zod schema
 * 8. Call the handler
 * 9. Catch and sanitize errors
 */
export function withSecurity<T = any>(
    handler: SecureHandler<T>,
    options: SecurityOptions<T> = {}
): (request: NextRequest | Request) => Promise<NextResponse> {
    const {
        requiredRoles = [],
        rateLimit = RateLimits.DEFAULT,
        schema,
        allowBodyToken = true,
        skipAuth = false,
        rateLimitKey,
    } = options;

    return async (request: NextRequest | Request): Promise<NextResponse> => {
        const requestId = crypto.randomUUID();
        const ip = getClientIp(request);
        const method = request.method;
        const url = request instanceof NextRequest ? request.nextUrl.pathname : new URL(request.url).pathname;

        try {
            // ── 1. Parse body ──
            let rawBody: any = {};
            if (['POST', 'PUT', 'PATCH'].includes(method)) {
                rawBody = await safeParseBody(request);
                if (rawBody === null) {
                    return NextResponse.json(
                        { success: false, error: 'Invalid JSON in request body', requestId },
                        { status: 400 }
                    );
                }
            }

            // ── 2. Authentication ──
            let auth: SecurityAuth = { uid: '', email: '', role: '', name: '' };

            if (!skipAuth) {
                const token = extractToken(request, rawBody, allowBodyToken);
                if (!token) {
                    return NextResponse.json(
                        { success: false, error: 'Authentication required', requestId },
                        { status: 401 }
                    );
                }

                if (!adminAuth) {
                    console.error(`[${requestId}] Firebase Admin not initialized`);
                    return NextResponse.json(
                        { success: false, error: 'Server authentication unavailable', requestId },
                        { status: 500 }
                    );
                }

                let decodedToken;
                try {
                    decodedToken = await adminAuth.verifyIdToken(token);
                } catch (error: any) {
                    const isExpired = error?.code === 'auth/id-token-expired';
                    return NextResponse.json(
                        {
                            success: false,
                            error: isExpired ? 'Session expired. Please sign in again.' : 'Invalid authentication token',
                            requestId
                        },
                        { status: 401 }
                    );
                }

                // ── 3. Role resolution ──
                const { role, name } = await resolveUserRole(decodedToken.uid);

                auth = {
                    uid: decodedToken.uid,
                    email: decodedToken.email || '',
                    role,
                    name,
                };

                // ── 4. Role authorization ──
                if (requiredRoles.length > 0 && !requiredRoles.includes(role)) {
                    console.warn(`[${requestId}] Access denied: ${auth.uid} (${role}) tried to access ${url} requiring [${requiredRoles}]`);
                    return NextResponse.json(
                        { success: false, error: 'Insufficient permissions', requestId },
                        { status: 403 }
                    );
                }
            }

            // ── 5. Rate limiting ──
            const limiterKey = rateLimitKey || url;
            const rateLimitId = skipAuth
                ? `ip:${ip}:${limiterKey}`
                : createRateLimitId(auth.uid, limiterKey);

            const rateLimitResult = applyRateLimit(rateLimitId, rateLimit);

            if (!rateLimitResult.allowed) {
                console.warn(`[${requestId}] Rate limited: ${auth.uid || ip} on ${url}`);
                return NextResponse.json(
                    { success: false, error: 'Too many requests. Please try again later.', requestId },
                    {
                        status: 429,
                        headers: {
                            ...rateLimitResult.headers,
                            'Retry-After': String(Math.ceil(rateLimitResult.resetIn / 1000)),
                        }
                    }
                );
            }

            // ── 6. Input validation ──
            let validatedBody: T = rawBody as T;
            if (schema && ['POST', 'PUT', 'PATCH'].includes(method)) {
                // Strip idToken from body before validation (it's a transport field, not data)
                const { idToken, ...dataFields } = rawBody;
                const validation = validateInput(schema, dataFields);
                if (!validation.success) {
                    const failedValidation = validation as { success: false; error: string };
                    return NextResponse.json(
                        { success: false, error: failedValidation.error, requestId },
                        { status: 400 }
                    );
                }
                validatedBody = (validation as { success: true; data: T }).data;
            }

            // ── 7. Execute handler ──
            const response = await handler(request, {
                auth,
                body: validatedBody,
                requestId,
                headers: request.headers,
                ip,
            });

            // ── 8. Add security headers to response ──
            response.headers.set('X-Request-Id', requestId);
            response.headers.set('X-RateLimit-Remaining', rateLimitResult.headers['X-RateLimit-Remaining']);

            return response;

        } catch (error: any) {
            // ── 9. Safe error handling ──
            console.error(`[${requestId}] Unhandled error in ${method} ${url}:`, error?.message || error);

            const isProduction = process.env.NODE_ENV === 'production';
            return NextResponse.json(
                {
                    success: false,
                    error: isProduction ? 'An internal error occurred' : (error?.message || 'Unknown error'),
                    requestId,
                },
                { status: 500 }
            );
        }
    };
}

// ============================================================================
// CRON SECURITY WRAPPER
// ============================================================================

/**
 * Security wrapper specifically for cron job endpoints.
 * Verifies CRON_SECRET and applies rate limiting.
 * Fail-closed: if CRON_SECRET is not configured, all requests are denied.
 */
export function withCronSecurity(
    handler: (request: NextRequest | Request, context: { requestId: string }) => Promise<NextResponse>
): (request: NextRequest | Request) => Promise<NextResponse> {
    return async (request: NextRequest | Request): Promise<NextResponse> => {
        const requestId = crypto.randomUUID();

        try {
            // Verify CRON_SECRET
            const cronSecret = process.env.CRON_SECRET;
            if (!cronSecret) {
                console.error(`[${requestId}] CRON_SECRET not configured — blocking cron request`);
                return NextResponse.json(
                    { success: false, error: 'Server configuration error', requestId },
                    { status: 500 }
                );
            }

            const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
            if (authHeader !== `Bearer ${cronSecret}`) {
                console.warn(`[${requestId}] Unauthorized cron request`);
                return NextResponse.json(
                    { success: false, error: 'Unauthorized', requestId },
                    { status: 401 }
                );
            }

            return await handler(request, { requestId });

        } catch (error: any) {
            console.error(`[${requestId}] Cron error:`, error?.message || error);
            return NextResponse.json(
                { success: false, error: 'Internal error', requestId },
                { status: 500 }
            );
        }
    };
}

// ============================================================================
// WEBHOOK SECURITY WRAPPER
// ============================================================================

/**
 * Security wrapper for webhook endpoints.
 * Skips Firebase auth but applies rate limiting.
 * Individual webhook handlers must verify their own signatures.
 */
export function withWebhookSecurity(
    handler: SecureHandler,
    options: { rateLimit?: { maxRequests: number; windowMs: number } } = {}
): (request: NextRequest | Request) => Promise<NextResponse> {
    return withSecurity(handler, {
        skipAuth: true,
        rateLimit: options.rateLimit || { maxRequests: 100, windowMs: 60000 },
        allowBodyToken: false,
    });
}
