/**
 * Rate Limiting Middleware for ADTU Bus Service
 * 
 * SECURITY: Prevents abuse through request flooding
 * Uses in-memory LRU cache for high performance
 * 
 * Usage:
 * const { allowed, remaining, resetIn } = checkRateLimit(identifier, maxRequests, windowMs);
 */

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

// Simple in-memory cache with LRU-like behavior
class RateLimitCache {
    private cache = new Map<string, RateLimitEntry>();
    private maxSize: number;

    constructor(maxSize: number = 10000) {
        this.maxSize = maxSize;
    }

    get(key: string): RateLimitEntry | undefined {
        const entry = this.cache.get(key);
        if (entry && Date.now() > entry.resetTime) {
            this.cache.delete(key);
            return undefined;
        }
        return entry;
    }

    set(key: string, value: RateLimitEntry): void {
        // Evict oldest entries if at capacity
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey) this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }

    // Cleanup expired entries periodically
    cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache) {
            if (now > entry.resetTime) {
                this.cache.delete(key);
            }
        }
    }
}

const rateLimitCache = new RateLimitCache(10000);

// Cleanup expired entries every 5 minutes
setInterval(() => rateLimitCache.cleanup(), 5 * 60 * 1000);

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetIn: number;
    limit: number;
}

/**
 * Check if a request should be rate limited
 * 
 * @param identifier - Unique identifier (usually userId + endpoint)
 * @param maxRequests - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns Rate limit check result
 */
export function checkRateLimit(
    identifier: string,
    maxRequests: number = 100,
    windowMs: number = 60000
): RateLimitResult {
    const now = Date.now();
    const entry = rateLimitCache.get(identifier);

    if (!entry) {
        // First request in this window
        rateLimitCache.set(identifier, {
            count: 1,
            resetTime: now + windowMs
        });
        return {
            allowed: true,
            remaining: maxRequests - 1,
            resetIn: windowMs,
            limit: maxRequests
        };
    }

    // Check if limit exceeded
    if (entry.count >= maxRequests) {
        return {
            allowed: false,
            remaining: 0,
            resetIn: entry.resetTime - now,
            limit: maxRequests
        };
    }

    // Increment counter
    entry.count++;
    return {
        allowed: true,
        remaining: maxRequests - entry.count,
        resetIn: entry.resetTime - now,
        limit: maxRequests
    };
}

/**
 * Predefined rate limit configurations for different endpoints
 */
export const RateLimits = {
    // Authentication & sensitive operations
    AUTH: { maxRequests: 10, windowMs: 60000 },           // 10 per minute
    LOGIN: { maxRequests: 5, windowMs: 60000 },           // 5 per minute
    PASSWORD_RESET: { maxRequests: 3, windowMs: 300000 }, // 3 per 5 minutes

    // Payment & financial
    PAYMENT_CREATE: { maxRequests: 5, windowMs: 60000 },  // 5 per minute
    PAYMENT_VERIFY: { maxRequests: 10, windowMs: 60000 }, // 10 per minute

    // Bus pass & scanning
    BUS_PASS_GENERATE: { maxRequests: 30, windowMs: 60000 },  // 30 per minute
    BUS_PASS_VERIFY: { maxRequests: 60, windowMs: 60000 },    // 60 per minute (high volume)

    // CRUD operations
    CREATE: { maxRequests: 30, windowMs: 60000 },   // 30 per minute
    READ: { maxRequests: 100, windowMs: 60000 },    // 100 per minute
    UPDATE: { maxRequests: 30, windowMs: 60000 },   // 30 per minute
    DELETE: { maxRequests: 10, windowMs: 60000 },   // 10 per minute

    // Real-time tracking
    LOCATION_UPDATE: { maxRequests: 60, windowMs: 60000 },  // 1 per second max
    WAITING_FLAG: { maxRequests: 20, windowMs: 60000 },     // 20 per minute

    // Admin operations
    ADMIN: { maxRequests: 100, windowMs: 60000 },           // 100 per minute
    BULK_OPERATION: { maxRequests: 5, windowMs: 300000 },   // 5 per 5 minutes

    // Notifications
    NOTIFICATION_CREATE: { maxRequests: 10, windowMs: 60000 },  // 10 per minute

    // General API
    DEFAULT: { maxRequests: 60, windowMs: 60000 },  // 60 per minute
} as const;

/**
 * Helper to apply rate limit and return appropriate response headers
 */
export function applyRateLimit(
    identifier: string,
    config: { maxRequests: number; windowMs: number } = RateLimits.DEFAULT
): RateLimitResult & { headers: Record<string, string> } {
    const result = checkRateLimit(identifier, config.maxRequests, config.windowMs);

    return {
        ...result,
        headers: {
            'X-RateLimit-Limit': String(result.limit),
            'X-RateLimit-Remaining': String(result.remaining),
            'X-RateLimit-Reset': String(Math.ceil(result.resetIn / 1000)),
        }
    };
}

/**
 * Create a rate limit identifier combining user ID and endpoint
 */
export function createRateLimitId(userId: string, endpoint: string): string {
    return `${userId}:${endpoint}`;
}

/**
 * Check if IP-based rate limiting should apply (for unauthenticated endpoints)
 */
export function checkIpRateLimit(
    ip: string,
    endpoint: string,
    maxRequests: number = 30,
    windowMs: number = 60000
): RateLimitResult {
    const identifier = `ip:${ip}:${endpoint}`;
    return checkRateLimit(identifier, maxRequests, windowMs);
}
