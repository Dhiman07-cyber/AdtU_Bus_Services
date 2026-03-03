/**
 * Safe Error Handling Utility for ADTU Bus Services
 * 
 * SECURITY: Prevents leaking internal error details to clients.
 * In production, all error messages are sanitized to generic messages.
 * In development, full error details are preserved for debugging.
 * 
 * Usage:
 *   return NextResponse.json(
 *     { success: false, error: safeErrorMessage(error) },
 *     { status: 500 }
 *   );
 */

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Known error patterns that are safe to show to users
 */
const SAFE_ERROR_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
    { pattern: /not found/i, message: 'Resource not found' },
    { pattern: /unauthorized|unauthenticated/i, message: 'Authentication required' },
    { pattern: /forbidden|permission denied/i, message: 'Insufficient permissions' },
    { pattern: /validation failed/i, message: 'Invalid input data' },
    { pattern: /rate limit/i, message: 'Too many requests. Please try again later.' },
    { pattern: /already exists/i, message: 'Resource already exists' },
    { pattern: /timeout/i, message: 'Request timed out. Please try again.' },
    { pattern: /file.*too large/i, message: 'File size exceeds the maximum limit' },
    { pattern: /invalid file type/i, message: 'File type not allowed' },
    { pattern: /missing.*required/i, message: 'Missing required fields' },
    { pattern: /token.*expired/i, message: 'Session expired. Please sign in again.' },
    { pattern: /invalid.*token/i, message: 'Invalid authentication' },
];

/**
 * Convert any error to a safe, user-facing message.
 * In production, strips internal details. In development, preserves them.
 */
export function safeErrorMessage(error: unknown, fallback?: string): string {
    const defaultMessage = fallback || 'An unexpected error occurred';

    if (!error) return defaultMessage;

    const message = error instanceof Error
        ? error.message
        : typeof error === 'string'
            ? error
            : defaultMessage;

    // In development, return full error for debugging
    if (!isProduction) {
        return message;
    }

    // In production, check if the error matches a safe pattern
    for (const { pattern, message: safeMessage } of SAFE_ERROR_PATTERNS) {
        if (pattern.test(message)) {
            return safeMessage;
        }
    }

    // Default: return generic message (never leak internals)
    return defaultMessage;
}

/**
 * Create a safe error response object for API routes.
 * Returns a sanitized error in production, full details in development.
 */
export function safeErrorResponse(
    error: unknown,
    fallback?: string
): { success: false; error: string } {
    return {
        success: false,
        error: safeErrorMessage(error, fallback),
    };
}

/**
 * Log the full error server-side (always), return safe message for client.
 * Use this in catch blocks.
 */
export function handleApiError(
    error: unknown,
    context: string,
    fallback?: string
): { success: false; error: string } {
    // Always log full error server-side
    console.error(`[${context}]`, error);

    return safeErrorResponse(error, fallback);
}
