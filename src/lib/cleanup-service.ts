import { db as adminDb, FieldValue } from './firebase-admin';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Event-Driven Cleanup Service
 * No cron jobs - only opportunistic cleanup when system is active
 */
export class CleanupService {

  /**
   * Clean up expired driver swaps and revert bus assignments
   * Called opportunistically when system is active
   */
  static async cleanExpiredSwaps(): Promise<{ cleaned: number; reverted: number }> {
    try {
      const now = new Date();
      let cleaned = 0;
      let reverted = 0;

      // Find all active swaps where endTime has passed
      const activeSwapsSnapshot = await adminDb
        .collection('driver_swap_requests')
        .where('status', '==', 'accepted')
        .get();

      const batch = adminDb.batch();
      const busUpdates: Map<string, string> = new Map(); // busId -> originalDriverId

      for (const doc of activeSwapsSnapshot.docs) {
        const swap = doc.data();

        // Check if swap time period has ended
        if (swap.timePeriod?.endTime) {
          const endTime = new Date(swap.timePeriod.endTime);

          if (endTime <= now) {
            // DELETE the swap document immediately
            batch.delete(doc.ref);

            // Queue bus revert (assignedDriverId back to fromDriverUID)
            busUpdates.set(swap.busId, swap.fromDriverUID);

            cleaned++;
          }
        }
      }

      // Revert bus assignments
      for (const [busId, originalDriverId] of busUpdates.entries()) {
        const busRef = adminDb.collection('buses').doc(busId);
        batch.update(busRef, {
          activeDriverId: originalDriverId,
          updatedAt: FieldValue.serverTimestamp()
        });
        reverted++;

        // Send notification to students
        await this.notifySwapReverted(busId, originalDriverId);
      }

      // Clean up old pending/rejected/cancelled requests (>7 days old)
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const staleRequestsSnapshot = await adminDb
        .collection('driver_swap_requests')
        .where('status', 'in', ['pending', 'rejected', 'cancelled', 'expired'])
        .where('createdAt', '<', sevenDaysAgo)
        .limit(100)
        .get();

      staleRequestsSnapshot.docs.forEach((doc: any) => {
        batch.delete(doc.ref);
        cleaned++;
      });

      // Commit all changes
      await batch.commit();

      console.log(`✅ Cleanup: ${cleaned} swaps cleaned, ${reverted} buses reverted`);
      return { cleaned, reverted };
    } catch (error) {
      console.error('❌ Error cleaning expired swaps:', error);
      return { cleaned: 0, reverted: 0 };
    }
  }

  /**
   * Clean up old audit logs (>30 days)
   * Called opportunistically
   */
  static async cleanOldAuditLogs(): Promise<number> {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      let deleted = 0;

      const oldAuditSnapshot = await adminDb
        .collection('driver_swap_audit')
        .where('timestamp', '<', thirtyDaysAgo)
        .limit(100)
        .get();

      const batch = adminDb.batch();

      oldAuditSnapshot.docs.forEach((doc: any) => {
        batch.delete(doc.ref);
        deleted++;
      });

      await batch.commit();

      console.log(`✅ Cleanup: ${deleted} old audit logs deleted`);
      return deleted;
    } catch (error) {
      console.error('❌ Error cleaning old audit logs:', error);
      return 0;
    }
  }

  /**
   * Master cleanup function - runs all cleanup tasks
   * Call this opportunistically when system is active
   */
  static async runOpportunisticCleanup(): Promise<void> {
    console.log('🧹 Running opportunistic cleanup...');

    try {
      const results = await Promise.allSettled([
        this.cleanExpiredSwaps(),
        this.cleanOldAuditLogs()
      ]);

      console.log('✅ Opportunistic cleanup completed:', results);
    } catch (error) {
      console.error('❌ Error during opportunistic cleanup:', error);
    }
  }

  /**
   * Check and auto-revert a specific swap if time expired
   * Called when driver logs in or accesses system
   */
  static async checkAndRevertExpiredSwap(busId: string): Promise<boolean> {
    try {
      const now = new Date();

      // Find active swap for this bus
      const swapsSnapshot = await adminDb
        .collection('driver_swap_requests')
        .where('busId', '==', busId)
        .where('status', '==', 'accepted')
        .limit(1)
        .get();

      if (swapsSnapshot.empty) return false;

      const swapDoc = swapsSnapshot.docs[0];
      const swap = swapDoc.data();

      // Check if swap has expired
      if (swap.timePeriod?.endTime) {
        const endTime = new Date(swap.timePeriod.endTime);

        if (endTime <= now) {
          // Revert the swap
          await adminDb.runTransaction(async (transaction: any) => {
            const busRef = adminDb.collection('buses').doc(busId);

            transaction.update(busRef, {
              activeDriverId: swap.fromDriverUID,
              updatedAt: FieldValue.serverTimestamp()
            });

            // DELETE the expired swap document
            transaction.delete(swapDoc.ref);
          });

          // Notify stakeholders
          await this.notifySwapReverted(busId, swap.fromDriverUID);

          console.log(`✅ Auto-reverted expired swap for bus ${busId}`);
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('❌ Error checking/reverting swap:', error);
      return false;
    }
  }

  /**
   * Send notifications when swap is auto-reverted
   */
  private static async notifySwapReverted(busId: string, originalDriverId: string): Promise<void> {
    try {
      // Get bus and driver details
      const [busDoc, driverDoc] = await Promise.all([
        adminDb.collection('buses').doc(busId).get(),
        adminDb.collection('drivers').doc(originalDriverId).get()
      ]);

      const busNumber = busDoc.data()?.busNumber || busId;
      const driverName = driverDoc.data()?.fullName || 'the original driver';

      // Notify students
      const studentsSnapshot = await adminDb
        .collection('students')
        .where('busId', '==', busId)
        .get();

      const studentUIDs = studentsSnapshot.docs
        .map((doc: any) => doc.data().uid)
        .filter((uid: any) => uid);

      if (studentUIDs.length > 0) {
        // Calculate expiry (1 day from now)
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 1);
        expiryDate.setHours(23, 59, 59, 999);

        await adminDb.collection('notifications').add({
          title: `Driver Change Complete — ${busNumber}`,
          message: `${driverName} is back as your regular driver for Bus ${busNumber}.`,
          type: 'info',
          category: 'general',
          audience: studentUIDs,
          status: 'sent',
          createdBy: 'system',
          createdAt: FieldValue.serverTimestamp(),
          expiresAt: expiryDate.toISOString()
        });
      }

      // Notify moderators and admins
      const [moderatorsSnapshot, adminsSnapshot] = await Promise.all([
        adminDb.collection('moderators').get(),
        adminDb.collection('admins').get()
      ]);

      const moderatorUIDs = moderatorsSnapshot.docs.map((doc: any) => doc.data().uid).filter((uid: any) => uid);
      const adminUIDs = adminsSnapshot.docs.map((doc: any) => doc.data().uid).filter((uid: any) => uid);
      const managementUIDs = [...moderatorUIDs, ...adminUIDs];

      if (managementUIDs.length > 0) {
        // Calculate expiry (1 day from now)
        const mgmtExpiryDate = new Date();
        mgmtExpiryDate.setDate(mgmtExpiryDate.getDate() + 1);
        mgmtExpiryDate.setHours(23, 59, 59, 999);

        await adminDb.collection('notifications').add({
          title: 'Driver Swap Auto-Completed',
          message: `Bus ${busNumber} swap period ended. ${driverName} resumed duties.`,
          type: 'info',
          category: 'notices',
          audience: managementUIDs,
          status: 'sent',
          createdBy: 'system',
          createdAt: FieldValue.serverTimestamp(),
          expiresAt: mgmtExpiryDate.toISOString()
        });
      }
    } catch (error) {
      console.error('❌ Error sending revert notifications:', error);
    }
  }

  /**
   * Cleanup orphaned data (safety check)
   * Called rarely, only when critical operations happen
   */
  static async cleanupOrphanedData(): Promise<void> {
    try {
      // Find buses with activeDriverId but no active swap
      const busesSnapshot = await adminDb
        .collection('buses')
        .where('activeDriverId', '!=', null)
        .get();

      for (const busDoc of busesSnapshot.docs) {
        const busData = busDoc.data();

        // Skip if activeDriverId same as assignedDriverId (not a swap)
        if (busData.activeDriverId === busData.assignedDriverId) continue;

        // Check if there's an active swap for this bus
        const swapsSnapshot = await adminDb
          .collection('driver_swap_requests')
          .where('busId', '==', busDoc.id)
          .where('status', '==', 'accepted')
          .limit(1)
          .get();

        // If no active swap found, revert to assigned driver
        if (swapsSnapshot.empty) {
          await busDoc.ref.update({
            activeDriverId: busData.assignedDriverId,
            updatedAt: FieldValue.serverTimestamp()
          });
          console.log(`⚠️ Reverted orphaned swap for bus ${busDoc.id}`);
        }
      }
    } catch (error) {
      console.error('❌ Error cleaning orphaned data:', error);
    }
  }
}
