/**
 * Enhanced Firestore error handling utilities
 * Handles common Firestore connection errors and provides recovery strategies
 */

export interface FirestoreErrorInfo {
  code: string;
  message: string;
  isRetryable: boolean;
  retryAfter?: number;
  userMessage: string;
}

// Global flag to track sign-out state - prevents spurious permission errors
let isSigningOut = false;
let signOutTimestamp = 0;
const SIGNOUT_SUPPRESSION_WINDOW = 3000; // 3 seconds

export function setSigningOut(value: boolean) {
  isSigningOut = value;
  if (value) {
    signOutTimestamp = Date.now();
  }
}

export function getSigningOutState() {
  // If explicitly set to signing out, return true
  if (isSigningOut) return true;

  // Also return true if we're within the suppression window after last signout
  if (signOutTimestamp > 0 && Date.now() - signOutTimestamp < SIGNOUT_SUPPRESSION_WINDOW) {
    return true;
  }

  return false;
}

/**
 * Check if an error should be suppressed (not logged or shown to user)
 */
export function shouldSuppressFirestoreError(error: any): boolean {
  if (getSigningOutState()) return true;

  const errorCode = error?.code || '';
  const errorMessage = error?.message || '';

  // Suppress permission errors during signout scenarios
  const suppressedCodes = ['permission-denied', 'unauthenticated'];
  const suppressedMessages = [
    'Missing or insufficient permissions',
    'Failed to get document because the client is offline',
    'The client is offline',
    'Network request failed',
  ];

  if (suppressedCodes.includes(errorCode)) return true;
  if (suppressedMessages.some(msg => errorMessage.includes(msg))) return true;

  return false;
}

export const FIRESTORE_ERROR_CODES = {
  UNAVAILABLE: 'unavailable',
  DEADLINE_EXCEEDED: 'deadline-exceeded',
  PERMISSION_DENIED: 'permission-denied',
  UNAUTHENTICATED: 'unauthenticated',
  NOT_FOUND: 'not-found',
  ALREADY_EXISTS: 'already-exists',
  RESOURCE_EXHAUSTED: 'resource-exhausted',
  FAILED_PRECONDITION: 'failed-precondition',
  ABORTED: 'aborted',
  OUT_OF_RANGE: 'out-of-range',
  UNIMPLEMENTED: 'unimplemented',
  INTERNAL: 'internal',
  QUIC_PROTOCOL_ERROR: 'quic-protocol-error',
  NETWORK_ERROR: 'network-error',
  TIMEOUT: 'timeout'
} as const;

export function getFirestoreErrorInfo(error: any): FirestoreErrorInfo {
  const errorCode = error?.code || error?.name || 'unknown';
  const errorMessage = error?.message || 'Unknown error occurred';

  // Handle specific error types
  switch (errorCode) {
    case FIRESTORE_ERROR_CODES.UNAVAILABLE:
    case FIRESTORE_ERROR_CODES.DEADLINE_EXCEEDED:
    case FIRESTORE_ERROR_CODES.TIMEOUT:
      return {
        code: errorCode,
        message: errorMessage,
        isRetryable: true,
        retryAfter: 5000, // 5 seconds
        userMessage: 'Service temporarily unavailable. Retrying...'
      };

    case FIRESTORE_ERROR_CODES.QUIC_PROTOCOL_ERROR:
    case FIRESTORE_ERROR_CODES.NETWORK_ERROR:
      return {
        code: errorCode,
        message: errorMessage,
        isRetryable: true,
        retryAfter: 3000, // 3 seconds
        userMessage: 'Network connection issue. Retrying...'
      };

    case FIRESTORE_ERROR_CODES.PERMISSION_DENIED:
      return {
        code: errorCode,
        message: errorMessage,
        isRetryable: false,
        userMessage: 'Access denied. Please check your permissions.'
      };

    case FIRESTORE_ERROR_CODES.UNAUTHENTICATED:
      return {
        code: errorCode,
        message: errorMessage,
        isRetryable: false,
        userMessage: 'Please sign in to continue.'
      };

    case FIRESTORE_ERROR_CODES.RESOURCE_EXHAUSTED:
      return {
        code: errorCode,
        message: errorMessage,
        isRetryable: true,
        retryAfter: 10000, // 10 seconds
        userMessage: 'Service is busy. Retrying in a moment...'
      };

    case FIRESTORE_ERROR_CODES.ABORTED:
      return {
        code: errorCode,
        message: errorMessage,
        isRetryable: true,
        retryAfter: 2000, // 2 seconds
        userMessage: 'Operation was interrupted. Retrying...'
      };

    default:
      return {
        code: errorCode,
        message: errorMessage,
        isRetryable: false,
        userMessage: 'An unexpected error occurred. Please try again.'
      };
  }
}

export function shouldRetryFirestoreOperation(error: any, retryCount: number = 0): boolean {
  const maxRetries = 3;
  const errorInfo = getFirestoreErrorInfo(error);

  return retryCount < maxRetries && errorInfo.isRetryable;
}

export function getRetryDelay(error: any, retryCount: number = 0): number {
  const errorInfo = getFirestoreErrorInfo(error);
  const baseDelay = errorInfo.retryAfter || 1000;

  // Exponential backoff with jitter
  const exponentialDelay = baseDelay * Math.pow(2, retryCount);
  const jitter = Math.random() * 1000; // Add up to 1 second of jitter

  return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
}

export function logFirestoreError(error: any, context: string = 'Firestore operation'): void {
  const errorInfo = getFirestoreErrorInfo(error);

  // Suppress permission errors during sign-out - these are expected
  if (isSigningOut && (errorInfo.code === FIRESTORE_ERROR_CODES.PERMISSION_DENIED ||
    errorInfo.code === FIRESTORE_ERROR_CODES.UNAUTHENTICATED)) {
    return; // Silent - expected during sign-out
  }

  if (errorInfo.isRetryable) {
    console.warn(`⚠️ ${context} failed (retryable):`, {
      code: errorInfo.code,
      message: errorInfo.message,
      retryAfter: errorInfo.retryAfter
    });
  } else {
    console.error(`❌ ${context} failed:`, {
      code: errorInfo.code,
      message: errorInfo.message,
      userMessage: errorInfo.userMessage
    });
  }
}

export function createRetryableFirestoreOperation<T>(
  operation: () => Promise<T>,
  context: string = 'Firestore operation',
  maxRetries: number = 3
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    let retryCount = 0;

    const attemptOperation = async (): Promise<void> => {
      try {
        const result = await operation();
        resolve(result);
      } catch (error) {
        logFirestoreError(error, context);

        if (shouldRetryFirestoreOperation(error, retryCount) && retryCount < maxRetries) {
          retryCount++;
          const delay = getRetryDelay(error, retryCount);

          console.log(`🔄 Retrying ${context} in ${delay}ms (attempt ${retryCount}/${maxRetries})`);

          setTimeout(attemptOperation, delay);
        } else {
          reject(error);
        }
      }
    };

    attemptOperation();
  });
}

export function isFirestoreConnectionError(error: any): boolean {
  const errorCode = error?.code || error?.name || '';
  const connectionErrors = [
    FIRESTORE_ERROR_CODES.UNAVAILABLE,
    FIRESTORE_ERROR_CODES.DEADLINE_EXCEEDED,
    FIRESTORE_ERROR_CODES.QUIC_PROTOCOL_ERROR,
    FIRESTORE_ERROR_CODES.NETWORK_ERROR,
    FIRESTORE_ERROR_CODES.TIMEOUT
  ];

  return connectionErrors.includes(errorCode) ||
    error?.message?.includes('WebChannelConnection') ||
    error?.message?.includes('transport errored') ||
    error?.message?.includes('ERR_QUIC_PROTOCOL_ERROR');
}

export function createConnectionErrorHandler() {
  let connectionErrorCount = 0;
  let lastErrorTime = 0;
  const MAX_ERRORS_PER_MINUTE = 10;

  return (error: any, context: string = 'Firestore connection') => {
    const now = Date.now();

    // Reset counter if more than a minute has passed
    if (now - lastErrorTime > 60000) {
      connectionErrorCount = 0;
    }

    connectionErrorCount++;
    lastErrorTime = now;

    if (isFirestoreConnectionError(error)) {
      if (connectionErrorCount > MAX_ERRORS_PER_MINUTE) {
        console.error(`🚨 Too many connection errors (${connectionErrorCount}). Consider checking network or Firebase status.`);
      } else {
        logFirestoreError(error, context);
      }
    } else {
      logFirestoreError(error, context);
    }
  };
}

// Global connection error handler instance
export const connectionErrorHandler = createConnectionErrorHandler();
