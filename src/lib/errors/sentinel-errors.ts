/**
 * Sentinel Error Classes
 *
 * Domain-specific errors thrown inside Firestore transactions to signal
 * specific failure conditions. These are caught by the surrounding
 * transaction handler and converted to appropriate HTTP responses.
 *
 * Usage:
 *   throw new CapacityFullError();
 *   // caught in transaction → 409 Conflict response
 */

/** Thrown when the target bus has no free seat (lost the last-seat race). */
export class CapacityFullError extends Error {}

/** Thrown when the application was already consumed (duplicate / retry). */
export class ApprovalConflictError extends Error {}

/** Thrown when the application was already consumed during rejection. */
export class ApplicationGoneError extends Error {}
