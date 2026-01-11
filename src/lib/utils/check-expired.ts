/**
 * Frontend utility to check if a student's service is expired
 * This is used for derived state - NO FIRESTORE OPERATIONS
 */

/**
 * Check if service is expired based on validUntil field
 * @param validUntil - Can be Firestore Timestamp, Date, string, or null
 * @returns true if expired, false if active
 */
export function isServiceExpired(validUntil: any): boolean {
  if (!validUntil) return true;
  
  try {
    let expiryDate: Date;
    
    // Handle Firestore Timestamp
    if (validUntil?.toDate && typeof validUntil.toDate === 'function') {
      expiryDate = validUntil.toDate();
    }
    // Handle Firebase Timestamp seconds/nanoseconds
    else if (validUntil?.seconds) {
      expiryDate = new Date(validUntil.seconds * 1000);
    }
    // Handle Date object
    else if (validUntil instanceof Date) {
      expiryDate = validUntil;
    }
    // Handle string
    else if (typeof validUntil === 'string') {
      expiryDate = new Date(validUntil);
    }
    else {
      return true; // Unknown format, consider expired
    }
    
    return expiryDate < new Date();
  } catch (error) {
    console.error('Error checking expiry:', error);
    return true; // On error, consider expired for safety
  }
}

/**
 * Get days until expiry
 * @param validUntil - Can be Firestore Timestamp, Date, string, or null
 * @returns number of days until expiry (negative if already expired)
 */
export function getDaysUntilExpiry(validUntil: any): number {
  if (!validUntil) return -999;
  
  try {
    let expiryDate: Date;
    
    // Handle Firestore Timestamp
    if (validUntil?.toDate && typeof validUntil.toDate === 'function') {
      expiryDate = validUntil.toDate();
    }
    // Handle Firebase Timestamp seconds/nanoseconds
    else if (validUntil?.seconds) {
      expiryDate = new Date(validUntil.seconds * 1000);
    }
    // Handle Date object
    else if (validUntil instanceof Date) {
      expiryDate = validUntil;
    }
    // Handle string
    else if (typeof validUntil === 'string') {
      expiryDate = new Date(validUntil);
    }
    else {
      return -999;
    }
    
    const now = new Date();
    const diffTime = expiryDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  } catch (error) {
    console.error('Error calculating days until expiry:', error);
    return -999;
  }
}

/**
 * Format expiry message for UI
 * @param validUntil - Can be Firestore Timestamp, Date, string, or null
 * @returns formatted message string
 */
export function getExpiryMessage(validUntil: any): string {
  const days = getDaysUntilExpiry(validUntil);
  
  if (days === -999) {
    return 'No valid subscription';
  }
  
  if (days < 0) {
    return `Expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} ago`;
  }
  
  if (days === 0) {
    return 'Expires today';
  }
  
  if (days === 1) {
    return 'Expires tomorrow';
  }
  
  if (days <= 7) {
    return `Expires in ${days} days`;
  }
  
  if (days <= 30) {
    const weeks = Math.floor(days / 7);
    return `Expires in ${weeks} week${weeks !== 1 ? 's' : ''}`;
  }
  
  const months = Math.floor(days / 30);
  return `Expires in ${months} month${months !== 1 ? 's' : ''}`;
}
