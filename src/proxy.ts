/**
 * Next.js Proxy - ADTU Smart Bus Management System

 * This proxy runs BEFORE every request and handles:
 * 1. Rate limiting for all API routes
 * 2. Security headers
 * 3. Request logging for monitoring
 * 
 * @see https://nextjs.org/docs/messages/middleware-to-proxy
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ============================================================================
// RATE LIMITING CONFIGURATION
// ============================================================================

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

// Simple in-memory store (works per-instance, good for Vercel Edge)
// For production with multiple instances, consider Upstash Redis
const rateLimitStore = new Map<string, RateLimitEntry>();

// Rate limit configurations by route pattern
const RATE_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
    // Authentication - strict limits
    '/api/auth': { maxRequests: 10, windowMs: 60000 },

    // Payment endpoints - moderate limits
    '/api/payment': { maxRequests: 10, windowMs: 60000 },
    '/api/razorpay': { maxRequests: 10, windowMs: 60000 },

    // Driver location broadcasts - high limits (real-time)
    '/api/driver/broadcast-location': { maxRequests: 120, windowMs: 60000 }, // 2/sec

    // Bus pass operations
    '/api/bus-pass': { maxRequests: 30, windowMs: 60000 },

    // Health checks - high limits (for monitoring)
    '/api/health': { maxRequests: 100, windowMs: 60000 },

    // Admin operations - moderate limits
    '/api/admin': { maxRequests: 60, windowMs: 60000 },

    // Moderator operations
    '/api/moderator': { maxRequests: 60, windowMs: 60000 },

    // Student operations
    '/api/student': { maxRequests: 60, windowMs: 60000 },

    // Webhooks - higher limits for external services
    '/api/webhooks': { maxRequests: 100, windowMs: 60000 },

    // Missed bus requests - moderate limits
    '/api/missed-bus': { maxRequests: 10, windowMs: 60000 },

    // Default for all other API routes
    'default': { maxRequests: 60, windowMs: 60000 }
};

// Endpoints that should NOT be rate limited (emergency/critical)
const RATE_LIMIT_EXEMPT = [
    '/api/health',      // Health checks should always work
    '/api/health/db',   // DB health checks
];

/**
 * Get rate limit config for a given path
 */
function getRateLimitConfig(pathname: string): { maxRequests: number; windowMs: number } {
    // Check for exact matches first
    for (const [pattern, config] of Object.entries(RATE_LIMITS)) {
        if (pattern !== 'default' && pathname.startsWith(pattern)) {
            return config;
        }
    }
    return RATE_LIMITS['default'];
}

/**
 * Get client identifier for rate limiting
 * Uses IP address + forwarded headers
 */
function getClientIdentifier(request: NextRequest): string {
    // Try to get real IP from various headers (Vercel, Cloudflare, etc.)
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const cfConnectingIp = request.headers.get('cf-connecting-ip');

    const ip = cfConnectingIp || realIp || forwardedFor?.split(',')[0]?.trim() || 'unknown';

    // Combine with pathname for per-endpoint limiting
    return `${ip}:${request.nextUrl.pathname}`;
}

/**
 * Check rate limit for a request
 */
function checkRateLimit(
    identifier: string,
    maxRequests: number,
    windowMs: number
): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const entry = rateLimitStore.get(identifier);

    // Cleanup old entries periodically
    if (rateLimitStore.size > 10000) {
        for (const [key, val] of rateLimitStore) {
            if (now > val.resetTime) {
                rateLimitStore.delete(key);
            }
        }
    }

    // No entry or expired - start fresh
    if (!entry || now > entry.resetTime) {
        rateLimitStore.set(identifier, {
            count: 1,
            resetTime: now + windowMs
        });
        return { allowed: true, remaining: maxRequests - 1, resetIn: windowMs };
    }

    // Check if limit exceeded
    if (entry.count >= maxRequests) {
        return {
            allowed: false,
            remaining: 0,
            resetIn: entry.resetTime - now
        };
    }

    // Increment and allow
    entry.count++;
    return {
        allowed: true,
        remaining: maxRequests - entry.count,
        resetIn: entry.resetTime - now
    };
}

// ============================================================================
// PROXY FUNCTION (renamed from middleware in Next.js 16+)
// ============================================================================

export function proxy(request: NextRequest) {
    const pathname = request.nextUrl.pathname;

    // Only process API routes
    if (!pathname.startsWith('/api')) {
        return NextResponse.next();
    }

    // Skip rate limiting for exempt endpoints
    if (RATE_LIMIT_EXEMPT.some(exempt => pathname.startsWith(exempt))) {
        return addSecurityHeaders(NextResponse.next());
    }

    // Get rate limit configuration
    const config = getRateLimitConfig(pathname);
    const clientId = getClientIdentifier(request);

    // Check rate limit
    const { allowed, remaining, resetIn } = checkRateLimit(
        clientId,
        config.maxRequests,
        config.windowMs
    );

    // If rate limited, return 429
    if (!allowed) {
        const response = NextResponse.json(
            {
                error: 'Too Many Requests',
                message: 'Rate limit exceeded. Please slow down.',
                retryAfter: Math.ceil(resetIn / 1000)
            },
            { status: 429 }
        );

        // Add rate limit headers
        response.headers.set('X-RateLimit-Limit', String(config.maxRequests));
        response.headers.set('X-RateLimit-Remaining', '0');
        response.headers.set('X-RateLimit-Reset', String(Math.ceil(resetIn / 1000)));
        response.headers.set('Retry-After', String(Math.ceil(resetIn / 1000)));

        return addSecurityHeaders(response);
    }

    // Allow the request and add headers
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', String(config.maxRequests));
    response.headers.set('X-RateLimit-Remaining', String(remaining));
    response.headers.set('X-RateLimit-Reset', String(Math.ceil(resetIn / 1000)));

    return addSecurityHeaders(response);
}

/**
 * Add security headers to all responses
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
    // Prevent clickjacking
    response.headers.set('X-Frame-Options', 'DENY');

    // Prevent MIME type sniffing
    response.headers.set('X-Content-Type-Options', 'nosniff');

    // XSS Protection (legacy, but still useful)
    response.headers.set('X-XSS-Protection', '1; mode=block');

    // Referrer policy
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions policy (restrict sensitive features)
    response.headers.set(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=(self), payment=(self)'
    );

    return response;
}

// ============================================================================
// PROXY CONFIG
// ============================================================================

export const config = {
    // Only run on API routes (not on static files, images, etc.)
    matcher: [
        '/api/:path*',
    ],
};
