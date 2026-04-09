/**
 * API Authentication Utility for ADTU Bus Services
 * 
 * SECURITY: Centralized authentication verification for all API routes.
 * Eliminates the need for each route to implement its own auth logic.
 * 
 * Usage:
 *   const auth = await verifyApiAuth(request);
 *   if (!auth.authenticated) return auth.response;
 *   // Use auth.uid, auth.role, auth.email
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

// PERF: Module-scoped role cache (5-min TTL) — avoids Firestore reads for repeat auth checks
const _authRoleCache = new Map<string, { role: string; name: string; employeeId: string; expiresAt: number }>();
const AUTH_ROLE_CACHE_TTL = 5 * 60 * 1000;

// ============================================================================
// TYPES
// ============================================================================

export interface AuthResult {
    authenticated: true;
    uid: string;
    email: string;
    role: string;
    name: string;
    employeeId?: string;
    response?: undefined;
}

export interface AuthFailure {
    authenticated: false;
    response: NextResponse;
    uid?: undefined;
    email?: undefined;
    role?: undefined;
    name?: undefined;
    employeeId?: undefined;
}

export type ApiAuthResult = AuthResult | AuthFailure;

// ============================================================================
// CORE AUTH VERIFICATION
// ============================================================================

/**
 * Verify the authentication token from API request headers.
 * Extracts the Bearer token, verifies it with Firebase Admin SDK,
 * and looks up the user's role from Firestore.
 * 
 * @param request - The incoming Next.js request
 * @param requiredRoles - Optional list of roles allowed to access this route
 * @returns AuthResult on success, AuthFailure with response on failure
 */
export async function verifyApiAuth(
    request: NextRequest | Request,
    requiredRoles?: string[]
): Promise<ApiAuthResult> {
    try {
        // 1. Extract token from Authorization header
        const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                authenticated: false,
                response: NextResponse.json(
                    { success: false, error: 'Authentication required' },
                    { status: 401 }
                ),
            };
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        if (!token || token.length < 10) {
            return {
                authenticated: false,
                response: NextResponse.json(
                    { success: false, error: 'Invalid authentication token' },
                    { status: 401 }
                ),
            };
        }

        // 2. Verify token with Firebase Admin SDK
        if (!adminAuth) {
            console.error('Firebase Admin Auth not initialized');
            return {
                authenticated: false,
                response: NextResponse.json(
                    { success: false, error: 'Server authentication unavailable' },
                    { status: 500 }
                ),
            };
        }

        let decodedToken;
        try {
            decodedToken = await adminAuth.verifyIdToken(token);
        } catch (error: any) {
            const isExpired = error?.code === 'auth/id-token-expired';
            return {
                authenticated: false,
                response: NextResponse.json(
                    { success: false, error: isExpired ? 'Session expired. Please sign in again.' : 'Invalid authentication token' },
                    { status: 401 }
                ),
            };
        }

        const uid = decodedToken.uid;
        const email = decodedToken.email || '';



        // 3. Look up user role from Firestore (with cache)
        let role = '';
        let name = '';
        let employeeId = '';

        const cached = _authRoleCache.get(uid);
        if (cached && Date.now() < cached.expiresAt) {
            role = cached.role;
            name = cached.name;
            employeeId = cached.employeeId;
        } else if (adminDb) {
            // PERF: Check users collection first (most common), then parallel fallback
            const userDoc = await adminDb.collection('users').doc(uid).get();
            if (userDoc.exists) {
                role = userDoc.data()?.role || 'student';
                name = userDoc.data()?.name || userDoc.data()?.fullName || '';
            } else {
                // Parallel lookup across all role-specific collections
                const [adminDoc, modDoc, driverDoc, studentDoc] = await Promise.all([
                    adminDb.collection('admins').doc(uid).get(),
                    adminDb.collection('moderators').doc(uid).get(),
                    adminDb.collection('drivers').doc(uid).get(),
                    adminDb.collection('students').doc(uid).get(),
                ]);

                if (adminDoc.exists) {
                    role = 'admin';
                    name = adminDoc.data()?.name || adminDoc.data()?.fullName || '';
                    employeeId = adminDoc.data()?.employeeId || '';
                } else if (modDoc.exists) {
                    role = 'moderator';
                    name = modDoc.data()?.fullName || modDoc.data()?.name || '';
                    employeeId = modDoc.data()?.employeeId || modDoc.data()?.staffId || '';
                } else if (driverDoc.exists) {
                    role = 'driver';
                    name = driverDoc.data()?.fullName || driverDoc.data()?.name || '';
                    employeeId = driverDoc.data()?.driverId || '';
                } else if (studentDoc.exists) {
                    role = 'student';
                    name = studentDoc.data()?.fullName || studentDoc.data()?.name || '';
                }
            }

            // Cache the result
            if (role) {
                _authRoleCache.set(uid, { role, name, employeeId, expiresAt: Date.now() + AUTH_ROLE_CACHE_TTL });
                // Evict oldest if over 2000 entries
                if (_authRoleCache.size > 2000) {
                    const firstKey = _authRoleCache.keys().next().value;
                    if (firstKey) _authRoleCache.delete(firstKey);
                }
            }
        }

        // 4. Check role authorization if required
        if (requiredRoles && requiredRoles.length > 0) {
            if (!role || !requiredRoles.includes(role)) {
                return {
                    authenticated: false,
                    response: NextResponse.json(
                        { success: false, error: 'Insufficient permissions' },
                        { status: 403 }
                    ),
                };
            }
        }

        return {
            authenticated: true,
            uid,
            email,
            role,
            name,
            employeeId,
        };

    } catch (error: any) {
        console.error('[API Auth] Unexpected error:', error?.message);
        return {
            authenticated: false,
            response: NextResponse.json(
                { success: false, error: 'Authentication failed' },
                { status: 500 }
            ),
        };
    }
}

/**
 * Quick auth check that only verifies the token (no role lookup).
 * Use for routes where you only need to confirm the user is logged in.
 */
export async function verifyTokenOnly(
    request: NextRequest | Request
): Promise<{ uid: string; email: string } | null> {
    try {
        const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) return null;

        const token = authHeader.substring(7);
        if (!token || !adminAuth) return null;

        const decodedToken = await adminAuth.verifyIdToken(token);
        return { uid: decodedToken.uid, email: decodedToken.email || '' };
    } catch {
        return null;
    }
}

/**
 * Verify that the request comes with a valid CRON_SECRET.
 * Used for cron job endpoints.
 */
export function verifyCronSecret(request: NextRequest): boolean {
    const cronSecret = process.env.CRON_SECRET;

    // SECURITY: Fail-closed — if CRON_SECRET is not configured, deny all requests
    if (!cronSecret) {
        console.error('🚫 CRON_SECRET not configured — all cron requests are blocked');
        return false;
    }

    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');

    if (authHeader === `Bearer ${cronSecret}`) {
        return true;
    }

    console.warn('⚠️ Invalid cron secret in request');
    return false;
}
