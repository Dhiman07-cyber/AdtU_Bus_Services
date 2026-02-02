import { FieldValue } from 'firebase-admin/firestore';

/**
 * Utility functions for managing the 'updatedBy' audit trail field
 * 
 * The updatedBy field is an array that tracks who modified a document and when.
 * Format for Admin: "{User-Name} ( Admin : Timestamp )"
 * Format for Moderator: "{User-Name} ( Employee-ID : Timestamp )"
 * Example: "Akash Deep ( Admin : 2026-01-26T23:00:00.000Z )"
 * Example: "John Doe ( EMP-123 : 2026-01-26T23:00:00.000Z )"
 */

/**
 * Creates a formatted updatedBy entry string
 * @param userName - The name of the user making the update
 * @param roleOrEmployeeId - 'Admin' for admins, or the employee ID for moderators (e.g., 'EMP-123')
 * @returns Formatted string like "User Name ( Admin : 2026-01-26T23:00:00.000Z )" or "User Name ( EMP-123 : 2026-01-26T23:00:00.000Z )"
 */
export function createUpdatedByEntry(userName: string, roleOrEmployeeId: string = 'Admin'): string {
    const timestamp = new Date().toISOString();
    return `${userName} ( ${roleOrEmployeeId} : ${timestamp} )`;
}

/**
 * Creates the updatedBy array for new document creation
 * @param userName - The name of the user creating the document
 * @param roleOrEmployeeId - 'Admin' for admins, or the employee ID for moderators
 * @returns Object with updatedBy array containing the initial entry
 */
export function getInitialUpdatedBy(userName: string, roleOrEmployeeId: string = 'Admin'): { updatedBy: string[] } {
    return {
        updatedBy: [createUpdatedByEntry(userName, roleOrEmployeeId)]
    };
}

/**
 * Returns Firestore FieldValue to append a new entry to the updatedBy array
 * @param userName - The name of the user making the update
 * @param roleOrEmployeeId - 'Admin' for admins, or the employee ID for moderators
 * @returns Object with updatedBy FieldValue.arrayUnion
 */
export function appendUpdatedBy(userName: string, roleOrEmployeeId: string = 'Admin'): { updatedBy: FirebaseFirestore.FieldValue } {
    return {
        updatedBy: FieldValue.arrayUnion(createUpdatedByEntry(userName, roleOrEmployeeId))
    };
}

/**
 * Gets the user's display name for the updatedBy entry
 * Priority: fullName > name > email > 'Unknown User'
 */
export function getUserDisplayName(userData: any): string {
    return userData?.fullName || userData?.name || userData?.email || 'Unknown User';
}

/**
 * Gets complete user info for updatedBy from admin/moderator document
 * Returns object with name and roleOrEmployeeId
 */
export async function getUpdaterInfo(
    adminDb: FirebaseFirestore.Firestore,
    userId: string
): Promise<{ name: string; roleOrEmployeeId: string }> {
    // Try admins collection first
    const adminDoc = await adminDb.collection('admins').doc(userId).get();
    if (adminDoc.exists) {
        const data = adminDoc.data();
        return {
            name: data?.fullName || data?.name || 'Admin',
            roleOrEmployeeId: 'Admin'
        };
    }

    // Try moderators collection
    const modDoc = await adminDb.collection('moderators').doc(userId).get();
    if (modDoc.exists) {
        const data = modDoc.data();
        return {
            name: data?.fullName || data?.name || 'Moderator',
            roleOrEmployeeId: data?.employeeId || data?.staffId || 'MOD'
        };
    }

    // Fallback to users collection
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (userDoc.exists) {
        const data = userDoc.data();
        return {
            name: data?.fullName || data?.name || data?.email || 'Unknown User',
            roleOrEmployeeId: 'Unknown'
        };
    }

    return { name: 'Unknown User', roleOrEmployeeId: 'Unknown' };
}
