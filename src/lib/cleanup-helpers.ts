/**
 * Cleanup Helper Functions
 * Utilities for deleting data from Firestore and associated resources
 */

import { adminDb } from './firebase-admin';
import { decrementBusCapacity } from './busCapacityService';

/**
 * Delete profile image from Cloudinary
 */
export async function deleteCloudinaryImage(imageUrl: string): Promise<boolean> {
  if (!imageUrl || !imageUrl.includes('cloudinary')) {
    return false;
  }

  try {
    // Extract public_id from Cloudinary URL
    // URL format: https://res.cloudinary.com/{cloud_name}/image/upload/v{version}/{public_id}.{format}
    const urlParts = imageUrl.split('/');
    const uploadIndex = urlParts.indexOf('upload');

    if (uploadIndex === -1 || uploadIndex + 2 >= urlParts.length) {
      console.error('Invalid Cloudinary URL format');
      return false;
    }

    // Get everything after "upload/v{version}/" and remove file extension
    const publicIdWithExt = urlParts.slice(uploadIndex + 2).join('/');
    const publicId = publicIdWithExt.split('.')[0];

    console.log('Deleting Cloudinary image with public_id:', publicId);

    // If Cloudinary API credentials are available, delete via API
    if (process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
      const crypto = require('crypto');
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;
      const timestamp = Math.round(Date.now() / 1000);

      // Generate signature
      const signatureString = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
      const signature = crypto
        .createHash('sha1')
        .update(signatureString)
        .digest('hex');

      // Make DELETE request to Cloudinary
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            public_id: publicId,
            api_key: apiKey,
            timestamp: timestamp.toString(),
            signature: signature
          })
        }
      );

      const result = await response.json();
      console.log('Cloudinary deletion result:', result);
      return result.result === 'ok';
    } else {
      console.warn('Cloudinary API credentials not found, skipping image deletion');
      return false;
    }
  } catch (error) {
    console.error('Error deleting Cloudinary image:', error);
    return false;
  }
}

/**
 * Delete user and associated data from Firestore, Firebase Auth, and Cloudinary
 * 
 * IMPORTANT: Google Account Deletion Process
 * - This function deletes the user from Firebase Authentication
 * - For Google-authenticated users, it attempts to disconnect the Google provider
 * - However, the actual Google account itself cannot be deleted programmatically
 * - The Google account remains active but is disconnected from Firebase Auth
 * - Users cannot re-register with the same Google account unless manually reconnected
 * 
 * What happens to Google accounts:
 * 1. Google provider is disconnected from Firebase Auth
 * 2. Firebase Auth user record is deleted
 * 3. Google account remains active but cannot be used to sign in
 * 4. User would need to manually reconnect their Google account to re-register
 */
export async function deleteUserAndData(
  userId: string,
  userType: 'student' | 'driver' | 'moderator'
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`Deleting ${userType} with ID:`, userId);

    // Get user data first to retrieve profile image URL and Firebase Auth UID
    const userDoc = await adminDb.collection(`${userType}s`).doc(userId).get();

    if (!userDoc.exists) {
      return { success: false, error: 'User not found' };
    }

    const userData = userDoc.data();
    const profileImageUrl = userData?.profilePhotoUrl || userData?.photoURL || userData?.avatar;
    const firebaseAuthUid = userData?.uid || userId; // Use uid field if available, fallback to userId

    // Step 1: Delete profile image from Cloudinary if exists
    if (profileImageUrl) {
      console.log('Deleting Cloudinary image:', profileImageUrl);
      const cloudinaryResult = await deleteCloudinaryImage(profileImageUrl);
      if (cloudinaryResult) {
        console.log('Successfully deleted Cloudinary image');
      } else {
        console.warn('Failed to delete Cloudinary image, continuing with other deletions');
      }
    }

    // Step 2: Delete related data based on user type
    if (userType === 'student') {
      // Get the student's busId before deleting to decrement capacity
      const busId = userData?.busId || userData?.currentBusId || userData?.assignedBusId || null;

      // Delete student's applications
      const applicationsQuery = await adminDb.collection('applications')
        .where('applicantUid', '==', userId)
        .get();

      if (applicationsQuery.size > 0) {
        const batch = adminDb.batch();
        applicationsQuery.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`Deleted ${applicationsQuery.size} applications for student:`, userId);
      }

      // Delete student's waiting flags
      const waitingFlagsQuery = await adminDb.collection('waiting_flags')
        .where('student_uid', '==', userId)
        .get();

      if (waitingFlagsQuery.size > 0) {
        const batch = adminDb.batch();
        waitingFlagsQuery.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`Deleted ${waitingFlagsQuery.size} waiting flags for student:`, userId);
      }

      // Decrement bus capacity if student was assigned to a bus
      if (busId) {
        try {
          await decrementBusCapacity(busId, userId);
          console.log(`✅ Decremented bus capacity for bus ${busId}`);
        } catch (busError) {
          console.error(`⚠️ Error decrementing bus capacity for bus ${busId}:`, busError);
          // Continue with deletion even if bus capacity update fails
        }
      }

      // Delete student's notifications
      await deleteUserNotifications(userId);
    } else if (userType === 'driver') {
      // Delete driver's trip logs
      await deleteDriverTripLogs(userId);

      // Delete driver's notifications
      await deleteUserNotifications(userId);
    } else if (userType === 'moderator') {
      // Delete moderator's notifications
      await deleteUserNotifications(userId);
    }

    // Step 3: Delete user document from Firestore
    await adminDb.collection(`${userType}s`).doc(userId).delete();
    console.log(`Deleted ${userType} document from Firestore:`, userId);

    // Also delete from users collection if it exists
    try {
      await adminDb.collection('users').doc(userId).delete();
      console.log(`Deleted user document from users collection:`, userId);
    } catch (userDeleteError) {
      console.log(`User with ID ${userId} not found in users collection or already deleted`);
    }

    // Step 4: Delete from Firebase Authentication with enhanced Google account handling
    try {
      const { adminAuth } = require('./firebase-admin');

      // First, get the user record to check for Google provider
      const userRecord = await adminAuth.getUser(firebaseAuthUid);
      const hasGoogleProvider = userRecord.providerData.some(provider => provider.providerId === 'google.com');

      if (hasGoogleProvider) {
        console.log(`User ${firebaseAuthUid} has Google provider - performing enhanced deletion`);

        // Disconnect Google provider before deletion
        try {
          await adminAuth.updateUser(firebaseAuthUid, {
            providerToDelete: 'google.com'
          });
          console.log(`Successfully disconnected Google provider for user:`, firebaseAuthUid);
        } catch (disconnectError: any) {
          console.log(`Could not disconnect Google provider (user may not have Google linked):`, disconnectError.message);
        }
      }

      // Delete the user from Firebase Authentication
      await adminAuth.deleteUser(firebaseAuthUid);
      console.log(`Successfully deleted user from Firebase Auth:`, firebaseAuthUid);

      // Log additional information for audit
      if (hasGoogleProvider) {
        console.log(`User ${firebaseAuthUid} was deleted with Google account disconnection`);
      }

    } catch (authError: any) {
      if (authError.code === 'auth/user-not-found') {
        console.log(`User with UID ${firebaseAuthUid} not found in Firebase Auth`);
      } else {
        console.error('Error deleting user from Firebase Auth:', authError);
        // Don't fail the entire operation if Firebase Auth deletion fails
      }
    }

    console.log(`Successfully completed deletion of ${userType} with ID:`, userId);
    return { success: true };
  } catch (error: any) {
    console.error(`Error deleting ${userType}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete user's notifications
 */
async function deleteUserNotifications(userId: string): Promise<void> {
  try {
    // Delete from notifications collection
    const notificationsQuery = await adminDb.collection('notifications')
      .where('toUid', '==', userId)
      .get();

    const batch1 = adminDb.batch();
    notificationsQuery.docs.forEach(doc => {
      batch1.delete(doc.ref);
    });
    await batch1.commit();
    console.log(`Deleted ${notificationsQuery.size} notifications for user:`, userId);

    // Delete from notification_read_receipts collection
    const receiptsQuery = await adminDb.collection('notification_read_receipts')
      .where('userId', '==', userId)
      .get();

    const batch2 = adminDb.batch();
    receiptsQuery.docs.forEach(doc => {
      batch2.delete(doc.ref);
    });
    await batch2.commit();
    console.log(`Deleted ${receiptsQuery.size} notification receipts for user:`, userId);
  } catch (error) {
    console.error('Error deleting user notifications:', error);
  }
}

/**
 * Delete driver's trip logs
 */
async function deleteDriverTripLogs(driverId: string): Promise<void> {
  try {
    // Delete from trip_logs or similar collection
    const tripsQuery = await adminDb.collection('trip_logs')
      .where('driverId', '==', driverId)
      .get();

    const batch = adminDb.batch();
    tripsQuery.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    console.log(`Deleted ${tripsQuery.size} trip logs for driver:`, driverId);
  } catch (error) {
    console.error('Error deleting driver trip logs:', error);
  }
}

/**
 * Delete bus and associated data
 */
export async function deleteBusAndData(
  busId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('Deleting bus with ID:', busId);

    // Get bus data
    const busDoc = await adminDb.collection('buses').doc(busId).get();

    if (!busDoc.exists) {
      return { success: false, error: 'Bus not found' };
    }

    // Delete bus document
    await adminDb.collection('buses').doc(busId).delete();
    console.log('Deleted bus document:', busId);

    // Unassign bus from drivers
    const driversQuery = await adminDb.collection('drivers')
      .where('busId', '==', busId)
      .get();

    const batch1 = adminDb.batch();
    driversQuery.docs.forEach(doc => {
      batch1.update(doc.ref, { busId: null, updatedAt: new Date().toISOString() });
    });
    await batch1.commit();
    console.log(`Unassigned bus from ${driversQuery.size} drivers`);

    // Delete bus trip logs
    const tripsQuery = await adminDb.collection('trip_logs')
      .where('busId', '==', busId)
      .get();

    const batch2 = adminDb.batch();
    tripsQuery.docs.forEach(doc => {
      batch2.delete(doc.ref);
    });
    await batch2.commit();
    console.log(`Deleted ${tripsQuery.size} trip logs for bus:`, busId);

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting bus:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete route and associated data
 */
export async function deleteRouteAndData(
  routeId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('Deleting route with ID:', routeId);

    // Delete route document (if it exists)
    const routeDoc = await adminDb.collection('routes').doc(routeId).get();
    if (routeDoc.exists) {
      await adminDb.collection('routes').doc(routeId).delete();
      console.log('Deleted route document:', routeId);
    } else {
      console.warn('Route document not found in routes collection, skipping document deletion but proceeding with cleanup.');
    }

    // Unassign route from buses
    const busesQuery = await adminDb.collection('buses')
      .where('routeId', '==', routeId)
      .get();

    const batch1 = adminDb.batch();
    busesQuery.docs.forEach(doc => {
      batch1.update(doc.ref, { routeId: null, updatedAt: new Date().toISOString() });
    });
    await batch1.commit();
    console.log(`Unassigned route from ${busesQuery.size} buses`);

    // Unassign route from students
    const studentsQuery = await adminDb.collection('students')
      .where('routeId', '==', routeId)
      .get();

    const batch2 = adminDb.batch();
    studentsQuery.docs.forEach(doc => {
      batch2.update(doc.ref, { routeId: null, stopId: null, updatedAt: new Date().toISOString() });
    });
    await batch2.commit();
    console.log(`Unassigned route from ${studentsQuery.size} students`);

    return { success: true };
  } catch (error: any) {
    console.error('Error deleting route:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Clean up trip data when driver ends trip
 */
export async function cleanupTripData(
  tripId: string,
  driverId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('Cleaning up trip data for trip ID:', tripId);

    // Delete trip log from Firestore
    await adminDb.collection('trip_logs').doc(tripId).delete();
    console.log('Deleted trip log:', tripId);

    // Delete real-time location data
    const locationsQuery = await adminDb.collection('real_time_locations')
      .where('tripId', '==', tripId)
      .get();

    const batch1 = adminDb.batch();
    locationsQuery.docs.forEach(doc => {
      batch1.delete(doc.ref);
    });
    await batch1.commit();
    console.log(`Deleted ${locationsQuery.size} location entries for trip:`, tripId);

    // Delete waiting flags for this trip
    const waitingFlagsQuery = await adminDb.collection('waiting_flags')
      .where('tripId', '==', tripId)
      .get();

    const batch2 = adminDb.batch();
    waitingFlagsQuery.docs.forEach(doc => {
      batch2.delete(doc.ref);
    });
    await batch2.commit();
    console.log(`Deleted ${waitingFlagsQuery.size} waiting flags for trip:`, tripId);

    // If using Supabase for real-time tracking, clean up there too
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      await cleanupSupabaseTripData(tripId, driverId);
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error cleaning up trip data:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Clean up trip data from Supabase
 */
async function cleanupSupabaseTripData(tripId: string, driverId: string): Promise<void> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    // Delete from bus_locations table
    await fetch(`${supabaseUrl}/rest/v1/bus_locations?trip_id=eq.${tripId}`, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });

    // Delete from waiting_flags table
    await fetch(`${supabaseUrl}/rest/v1/waiting_flags?trip_id=eq.${tripId}`, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey!,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Cleaned up Supabase trip data for trip:', tripId);
  } catch (error) {
    console.error('Error cleaning up Supabase data:', error);
  }
}

