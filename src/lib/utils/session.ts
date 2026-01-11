/**
 * Session Management Utilities
 * Helper functions for calculating session dates and validity
 */

/**
 * Calculate session end year based on start year and duration
 */
export function calculateSessionEndYear(startYear: number, durationYears: number): number {
  return startYear + durationYears;
}

/**
 * Calculate validUntil date (July 1st of end year)
 */
export function calculateValidUntil(startYear: number, durationYears: number): string {
  const endYear = calculateSessionEndYear(startYear, durationYears);
  // July 1st of the end year
  return new Date(endYear, 6, 1, 0, 0, 0, 0).toISOString();
}

/**
 * Get the default session start year
 * If before July, returns current year
 * If July or after, returns next year
 */
export function getDefaultSessionStartYear(): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed
  
  // If we're in July (6) or later, default to next year
  if (currentMonth >= 6) {
    return currentYear + 1;
  }
  
  return currentYear;
}

/**
 * Check if a student's service is expired
 */
export function isSessionExpired(validUntil: string): boolean {
  return new Date(validUntil) < new Date();
}

/**
 * Check if a student's service will expire within the next N days
 */
export function isExpiringWithinDays(validUntil: string, days: number): boolean {
  const expiryDate = new Date(validUntil);
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  
  return expiryDate <= futureDate && expiryDate >= new Date();
}

/**
 * Check if a student needs a June reminder (expires in current year's July)
 */
export function needsJuneReminder(validUntil: string): boolean {
  const expiryDate = new Date(validUntil);
  const now = new Date();
  const currentYear = now.getFullYear();
  
  // Check if expiry is in July of current year
  return expiryDate.getFullYear() === currentYear && 
         expiryDate.getMonth() === 6; // July
}

/**
 * Calculate estimated fees based on duration and shift
 */
export function calculateEstimatedFees(
  durationYears: number, 
  shift: 'morning' | 'evening' | 'both',
  baseFeePerYear: number = 1200
): number {
  const shiftMultiplier = shift === 'both' ? 1.5 : 1;
  return baseFeePerYear * durationYears * shiftMultiplier;
}

/**
 * Format session period as human-readable string
 */
export function formatSessionPeriod(startYear: number, endYear: number): string {
  return `${startYear}-${endYear}`;
}

/**
 * Get session year options for dropdown
 */
export function getSessionYearOptions(yearsAhead: number = 3): Array<{value: number, label: string}> {
  const startYear = getDefaultSessionStartYear();
  const options = [];
  
  for (let i = 0; i < yearsAhead; i++) {
    const year = startYear + i;
    options.push({
      value: year,
      label: `${year}-${year + 1}`
    });
  }
  
  return options;
}

/**
 * Validate session dates
 */
export function validateSessionDates(startYear: number, durationYears: number): {
  valid: boolean;
  error?: string;
} {
  const currentYear = new Date().getFullYear();
  
  if (startYear < currentYear) {
    return {
      valid: false,
      error: 'Session start year cannot be in the past'
    };
  }
  
  if (startYear > currentYear + 5) {
    return {
      valid: false,
      error: 'Session start year too far in the future'
    };
  }
  
  if (durationYears < 1 || durationYears > 5) {
    return {
      valid: false,
      error: 'Duration must be between 1 and 5 years'
    };
  }
  
  return { valid: true };
}

/**
 * Get days remaining until expiry
 */
export function getDaysUntilExpiry(validUntil: string): number {
  const expiryDate = new Date(validUntil);
  const now = new Date();
  const diffTime = expiryDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
}

/**
 * Get expiry status with color coding
 */
export function getExpiryStatus(validUntil: string): {
  status: 'active' | 'expiring_soon' | 'expired';
  color: 'green' | 'yellow' | 'red';
  message: string;
} {
  const daysRemaining = getDaysUntilExpiry(validUntil);
  
  if (daysRemaining <= 0) {
    return {
      status: 'expired',
      color: 'red',
      message: 'Service expired'
    };
  }
  
  if (daysRemaining <= 30) {
    return {
      status: 'expiring_soon',
      color: 'yellow',
      message: `Expires in ${daysRemaining} days`
    };
  }
  
  return {
    status: 'active',
    color: 'green',
    message: `Active (${daysRemaining} days remaining)`
  };
}

