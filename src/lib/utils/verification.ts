/**
 * Verification Code Utilities
 * Helper functions for verification code generation and validation
 */

import * as crypto from 'crypto';

/**
 * Generate a cryptographically secure N-digit verification code
 */
export function generateVerificationCode(length: number = 6): string {
  const max = Math.pow(10, length);
  const code = crypto.randomInt(0, max);
  return code.toString().padStart(length, '0');
}

/**
 * Hash a verification code using SHA-256
 */
export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Verify a code against its hash
 */
export function verifyCodeHash(code: string, hash: string): boolean {
  return hashCode(code) === hash;
}

/**
 * Check if a verification code has expired
 */
export function isCodeExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

/**
 * Calculate expiry time (default 12 hours from now)
 */
export function calculateCodeExpiry(hoursFromNow: number = 12): string {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + hoursFromNow);
  return expiry.toISOString();
}

/**
 * Format code for display (e.g., "123 456" instead of "123456")
 */
export function formatCodeForDisplay(code: string): string {
  return code.match(/.{1,3}/g)?.join(' ') || code;
}

/**
 * Validate code format (must be N digits)
 */
export function validateCodeFormat(code: string, length: number = 6): {
  valid: boolean;
  error?: string;
} {
  if (!code) {
    return { valid: false, error: 'Code is required' };
  }
  
  if (code.length !== length) {
    return { valid: false, error: `Code must be ${length} digits` };
  }
  
  if (!/^\d+$/.test(code)) {
    return { valid: false, error: 'Code must contain only digits' };
  }
  
  return { valid: true };
}

/**
 * Get time remaining before code expires
 */
export function getTimeRemaining(expiresAt: string): {
  hours: number;
  minutes: number;
  expired: boolean;
} {
  const now = new Date();
  const expiry = new Date(expiresAt);
  const diffMs = expiry.getTime() - now.getTime();
  
  if (diffMs <= 0) {
    return { hours: 0, minutes: 0, expired: true };
  }
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  return { hours, minutes, expired: false };
}

/**
 * Format remaining time as human-readable string
 */
export function formatTimeRemaining(expiresAt: string): string {
  const { hours, minutes, expired } = getTimeRemaining(expiresAt);
  
  if (expired) {
    return 'Expired';
  }
  
  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }
  
  return `${minutes}m remaining`;
}

/**
 * Check if code attempts have been exceeded
 */
export function hasExceededAttempts(attempts: number, maxAttempts: number): boolean {
  return attempts >= maxAttempts;
}

/**
 * Calculate remaining attempts
 */
export function getRemainingAttempts(attempts: number, maxAttempts: number): number {
  return Math.max(0, maxAttempts - attempts);
}

