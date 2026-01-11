import { createClient } from '@supabase/supabase-js';
import { db as adminDb, FieldValue } from './firebase-admin';
import { DriverSwapRequest, DriverSwapAudit } from './types';
import type { Transaction } from 'firebase-admin/firestore';
import { CleanupService } from './cleanup-service';
import { NotificationService } from './notifications/NotificationService';
import { NotificationTarget } from './notifications/types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Core Driver Swap Service - Handles all swap operations atomically
 */
export class DriverSwapService {
  /**
   * Validates if a driver can request a swap
   */
  static async validateSwapRequest(
    fromDriverUID: string,
    toDriverUID: string,
    busId: string
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Opportunistic cleanup: Check if there's an expired swap for this bus
      await CleanupService.checkAndRevertExpiredSwap(busId).catch(err =>
        console.error('Cleanup error during validation:', err)
      );
      // Check if fromDriver is the current active/assigned driver
      const busDoc = await adminDb.collection('buses').doc(busId).get();
      if (!busDoc.exists) {
        return { valid: false, error: 'Bus not found' };
      }

      const busData = busDoc.data();
      const busCurrentDriver = busData?.activeDriverId || busData?.assignedDriverId || busData?.driverUid;

      console.log('🔍 Driver Swap Validation - Step 1: Bus Document Check:', {
        busId,
        busNumber: busData?.busNumber,
        fromDriverUID: fromDriverUID.substring(0, 8) + '...',
        busCurrentDriver: busCurrentDriver?.substring(0, 8) + '...',
        activeDriverId: busData?.activeDriverId,
        assignedDriverId: busData?.assignedDriverId,
        driverUid: busData?.driverUid
      });

      // Check the requesting driver's document to verify they're actually assigned to this bus
      const fromDriverDoc = await adminDb.collection('drivers').doc(fromDriverUID).get();
      if (!fromDriverDoc.exists) {
        return { valid: false, error: 'Your driver account not found' };
      }

      const fromDriverData = fromDriverDoc.data();
      const driverAssignedBus = fromDriverData?.assignedBusId || fromDriverData?.busId;

      console.log('🔍 Driver Swap Validation - Step 2: Driver Document Check:', {
        driverUID: fromDriverUID.substring(0, 8) + '...',
        driverName: fromDriverData?.fullName || fromDriverData?.name,
        driverAssignedBus,
        requestedBus: busId,
        match: driverAssignedBus === busId
      });

      // Primary validation: Check if driver's document shows they're assigned to this bus
      if (driverAssignedBus !== busId) {
        console.error('❌ Driver not assigned to this bus:', {
          driverAssignedBus,
          requestedBus: busId,
          driverName: fromDriverData?.fullName || fromDriverData?.name
        });
        return {
          valid: false,
          error: `You are not assigned to this bus. Your assigned bus: ${driverAssignedBus || 'None'}`
        };
      }

      // Secondary check: If bus document has stale data, log warning but allow it
      // The driver's document is the source of truth
      if (busCurrentDriver && busCurrentDriver !== fromDriverUID) {
        console.warn('⚠️ Bus document has stale driver reference - will be fixed on swap accept:', {
          busCurrentDriver: busCurrentDriver.substring(0, 8) + '...',
          actualDriver: fromDriverUID.substring(0, 8) + '...',
          note: 'Driver document is source of truth'
        });

        // Auto-fix the bus document to match the driver's assignment
        console.log('🔧 Auto-fixing bus document to match driver assignment...');
        try {
          await busDoc.ref.update({
            activeDriverId: fromDriverUID,
            assignedDriverId: fromDriverUID,
            updatedAt: FieldValue.serverTimestamp()
          });
          console.log('✅ Bus document fixed');
        } catch (error) {
          console.error('❌ Failed to auto-fix bus document:', error);
          // Don't fail the request, just log the error
        }
      }

      // Check if toDriver is a valid driver
      const toDriverDoc = await adminDb.collection('drivers').doc(toDriverUID).get();
      if (!toDriverDoc.exists) {
        return { valid: false, error: 'Target driver not found' };
      }

      const toDriverData = toDriverDoc.data();

      console.log('🔍 Target Driver Check:', {
        toDriverUID,
        toDriverName: toDriverData?.fullName || toDriverData?.name,
        status: toDriverData?.status,
        hasStatus: !!toDriverData?.status
      });

      // Check if driver is inactive (only block if explicitly set to 'inactive' or 'suspended')
      const driverStatus = toDriverData?.status?.toLowerCase();
      if (driverStatus && (driverStatus === 'inactive' || driverStatus === 'suspended' || driverStatus === 'disabled')) {
        return { valid: false, error: `Target driver is ${driverStatus}` };
      }

      // If no status or status is active/Active, allow it
      // This handles: undefined, null, 'active', 'Active', or any other positive status

      // Check if toDriver is reserved or not already assigned to another bus
      const toDriverBusId = toDriverData?.assignedBusId || toDriverData?.busId;

      console.log('🔍 Target Driver Bus Assignment Check:', {
        toDriverUID: toDriverUID.substring(0, 8) + '...',
        assignedBusId: toDriverBusId,
        isReserved: !toDriverBusId || toDriverBusId === 'reserved'
      });

      // Check if target driver already has an active swap (as recipient)
      console.log('🔍 Checking if target driver has active swaps...');
      const activeSwapsAsRecipient = await adminDb.collection('driver_swap_requests')
        .where('toDriverUID', '==', toDriverUID)
        .where('status', '==', 'accepted')
        .get();

      if (!activeSwapsAsRecipient.empty) {
        const activeSwap = activeSwapsAsRecipient.docs[0].data();
        console.log('❌ Target driver already in active swap:', {
          swapId: activeSwapsAsRecipient.docs[0].id,
          withBus: activeSwap.busNumber,
          fromDriver: activeSwap.fromDriverName
        });
        return {
          valid: false,
          error: `${toDriverData?.fullName || 'Target driver'} is already in an active swap with ${activeSwap.busNumber}. They cannot accept another swap until the current one ends.`
        };
      }

      // Check if target driver has pending swaps (as recipient)
      const pendingSwapsAsRecipient = await adminDb.collection('driver_swap_requests')
        .where('toDriverUID', '==', toDriverUID)
        .where('status', '==', 'pending')
        .get();

      if (pendingSwapsAsRecipient.size > 0) {
        console.log(`⚠️ Target driver has ${pendingSwapsAsRecipient.size} pending swap request(s)`);
        // Allow this - they can receive multiple pending requests and choose which to accept
      }

      // If driver is marked as reserved, they're available for swap
      if (!toDriverBusId || toDriverBusId === 'reserved') {
        console.log('✅ Target driver is Reserved - available for swap');
      } else {
        // Check if they're actively driving another bus
        const busesSnapshot = await adminDb.collection('buses')
          .where('activeDriverId', '==', toDriverUID)
          .get();

        console.log('   Active bus assignments:', { busesFound: busesSnapshot.size });

        if (!busesSnapshot.empty) {
          const assignedBus = busesSnapshot.docs[0].data();
          console.log('   Target driver currently assigned to:', {
            busId: assignedBus.busId,
            busNumber: assignedBus.busNumber,
            requestedBusId: busId
          });

          if (assignedBus.busId !== busId) {
            return {
              valid: false,
              error: `Target driver is already assigned to another bus (${assignedBus.busNumber || assignedBus.busId})`
            };
          }
        }
      }

      // Check for pending requests for the same bus from this driver
      const existingPendingFromSameDriver = await adminDb.collection('driver_swap_requests')
        .where('busId', '==', busId)
        .where('fromDriverUID', '==', fromDriverUID)
        .where('status', '==', 'pending')
        .get();

      if (!existingPendingFromSameDriver.empty) {
        return { valid: false, error: 'You already have a pending swap request for this bus' };
      }

      // Check for active swaps for this bus
      const activeSwapsForBus = await adminDb.collection('driver_swap_requests')
        .where('busId', '==', busId)
        .where('status', '==', 'accepted')
        .get();

      if (!activeSwapsForBus.empty) {
        const activeSwap = activeSwapsForBus.docs[0].data();
        return {
          valid: false,
          error: `This bus is already in an active swap with ${activeSwap.toDriverName}. Cannot create another swap until the current one ends.`
        };
      }

      return { valid: true };
    } catch (error) {
      console.error('Validation error:', error);
      return { valid: false, error: 'Validation failed' };
    }
  }

  /**
   * Create a new swap request
   */
  static async createSwapRequest(
    fromDriverUID: string,
    toDriverUID: string,
    busId: string,
    routeId: string,
    timePeriod: any
  ): Promise<{ success: boolean; requestId?: string; error?: string }> {
    try {
      // Validate request
      const validation = await this.validateSwapRequest(fromDriverUID, toDriverUID, busId);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Get driver and bus details
      const [fromDriverDoc, toDriverDoc, busDoc] = await Promise.all([
        adminDb.collection('drivers').doc(fromDriverUID).get(),
        adminDb.collection('drivers').doc(toDriverUID).get(),
        adminDb.collection('buses').doc(busId).get()
      ]);

      const fromDriverData = fromDriverDoc.data();
      const toDriverData = toDriverDoc.data();
      const fromDriverName = fromDriverData?.fullName || fromDriverData?.name;
      const toDriverName = toDriverData?.fullName || toDriverData?.name;
      const busNumber = busDoc.data()?.busNumber;
      const routeName = busDoc.data()?.route?.routeName;

      // Determine if this is an assignment (to reserved driver) or a true swap (to active driver)
      const toDriverBusId = toDriverData?.assignedBusId || toDriverData?.busId;
      const isReservedTarget = !toDriverBusId || toDriverBusId === 'reserved';
      const swapType = isReservedTarget ? 'assignment' : 'swap';

      // If it's a true swap, get the target driver's bus info
      let secondaryBusId: string | null = null;
      let secondaryBusNumber: string | null = null;
      let secondaryRouteId: string | null = null;
      let secondaryRouteName: string | null = null;

      if (!isReservedTarget && toDriverBusId) {
        const secondaryBusDoc = await adminDb.collection('buses').doc(toDriverBusId).get();
        if (secondaryBusDoc.exists) {
          const secondaryBusData = secondaryBusDoc.data();
          secondaryBusId = toDriverBusId;
          secondaryBusNumber = secondaryBusData?.busNumber || null;
          secondaryRouteId = secondaryBusData?.routeId || null;
          secondaryRouteName = secondaryBusData?.route?.routeName || secondaryBusData?.routeName || null;
        }
      }

      console.log(`📋 Swap Request Type: ${swapType}`, {
        fromDriver: fromDriverName,
        toDriver: toDriverName,
        primaryBus: busNumber,
        secondaryBus: secondaryBusNumber || 'N/A (Reserved)'
      });

      // Calculate expiry (20 minutes from now)
      const expiresAt = new Date(Date.now() + 20 * 60 * 1000);

      // Build the request document - only include fields that have values
      const requestData: Record<string, any> = {
        fromDriverUID,
        fromDriverName,
        toDriverUID,
        toDriverName,
        busId,
        busNumber,
        swapType,
        status: 'pending',
        timePeriod,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt
      };

      // Only add routeId/routeName if they exist
      if (routeId) requestData.routeId = routeId;
      if (routeName) requestData.routeName = routeName;

      // Only add secondary bus info for true swaps (not assignments to reserved drivers)
      if (swapType === 'swap' && secondaryBusId) {
        requestData.secondaryBusId = secondaryBusId;
        if (secondaryBusNumber) requestData.secondaryBusNumber = secondaryBusNumber;
        if (secondaryRouteId) requestData.secondaryRouteId = secondaryRouteId;
        if (secondaryRouteName) requestData.secondaryRouteName = secondaryRouteName;
      }

      // Create request in Firestore with minimal fields
      const requestRef = await adminDb.collection('driver_swap_requests').add(requestData);

      // NOTE: Audit log creation removed - no longer needed for swap requests

      // Send notifications
      await this.sendSwapRequestNotifications(
        requestRef.id,
        fromDriverName,
        toDriverName,
        busNumber,
        toDriverUID
      );

      // Trigger opportunistic cleanup in background
      CleanupService.runOpportunisticCleanup().catch(err =>
        console.error('Background cleanup error:', err)
      );

      return { success: true, requestId: requestRef.id };
    } catch (error: any) {
      console.error('Error creating swap request:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Accept a swap request (atomic transaction)
   */
  static async acceptSwapRequest(
    requestId: string,
    acceptorUID: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const requestDoc = await adminDb.collection('driver_swap_requests').doc(requestId).get();
      if (!requestDoc.exists) {
        return { success: false, error: 'Request not found' };
      }

      const requestData = requestDoc.data() as DriverSwapRequest;

      // Debug log all fields
      console.log('🔍 Swap request data:', {
        busId: requestData.busId,
        fromDriverUID: requestData.fromDriverUID,
        toDriverUID: requestData.toDriverUID,
        routeId: requestData.routeId,
        secondaryBusId: requestData.secondaryBusId,
        swapType: requestData.swapType,
        status: requestData.status
      });

      // Validate all required fields exist and are valid strings
      if (!requestData.busId || typeof requestData.busId !== 'string' || requestData.busId.trim() === '') {
        console.error('❌ Invalid busId in swap request:', requestData.busId);
        return { success: false, error: 'Invalid swap request: missing or invalid busId' };
      }
      if (!requestData.fromDriverUID || typeof requestData.fromDriverUID !== 'string' || requestData.fromDriverUID.trim() === '') {
        console.error('❌ Invalid fromDriverUID in swap request:', requestData.fromDriverUID);
        return { success: false, error: 'Invalid swap request: missing or invalid fromDriverUID' };
      }
      if (!requestData.toDriverUID || typeof requestData.toDriverUID !== 'string' || requestData.toDriverUID.trim() === '') {
        console.error('❌ Invalid toDriverUID in swap request:', requestData.toDriverUID);
        return { success: false, error: 'Invalid swap request: missing or invalid toDriverUID' };
      }

      // Validate acceptor is the target driver
      if (requestData.toDriverUID !== acceptorUID) {
        return { success: false, error: 'You are not authorized to accept this request' };
      }

      // Validate request is still pending
      if (requestData.status !== 'pending') {
        return { success: false, error: `Request is already ${requestData.status}` };
      }

      // Check if request has expired
      const expiresAt = requestData.expiresAt instanceof Date ? requestData.expiresAt : new Date(requestData.expiresAt as string);
      if (expiresAt < new Date()) {
        // DELETE the expired document immediately
        await requestDoc.ref.delete();
        console.log(`🗑️ Deleted expired swap request: ${requestId}`);
        return { success: false, error: 'Request has expired' };
      }

      // Get bus document for snapshot
      const busDoc = await adminDb.collection('buses').doc(requestData.busId).get();
      const beforeSnapshot = busDoc.data();

      console.log('🔄 Starting driver swap transaction...');
      console.log(`   From: ${requestData.fromDriverName} (${requestData.fromDriverUID.substring(0, 8)}...)`);
      console.log(`   To: ${requestData.toDriverName} (${requestData.toDriverUID.substring(0, 8)}...)`);
      console.log(`   Bus: ${requestData.busNumber} (${requestData.busId})`);
      console.log(`   Route: ${requestData.routeName} (${requestData.routeId})`);

      // Perform atomic swap using Firestore transaction
      await adminDb.runTransaction(async (transaction: any) => {
        const busRef = adminDb.collection('buses').doc(requestData.busId);
        const requestRef = adminDb.collection('driver_swap_requests').doc(requestId);
        const fromDriverRef = adminDb.collection('drivers').doc(requestData.fromDriverUID);
        const toDriverRef = adminDb.collection('drivers').doc(requestData.toDriverUID);

        // Read current bus state in transaction
        const currentBusDoc = await transaction.get(busRef);
        if (!currentBusDoc.exists) {
          throw new Error('Bus not found');
        }

        const currentBusData = currentBusDoc.data();
        const currentActiveDriver = currentBusData?.activeDriverId || currentBusData?.assignedDriverId;

        console.log('   📋 Current bus state:', {
          activeDriverId: currentBusData?.activeDriverId,
          assignedDriverId: currentBusData?.assignedDriverId
        });

        // Validate the fromDriver is still the active driver
        if (currentActiveDriver !== requestData.fromDriverUID) {
          throw new Error('Bus driver has changed since request was created');
        }

        // Determine swap type from request data
        // Treat as assignment if: explicitly marked, or secondaryBusId is missing/empty/null
        const hasValidSecondaryBus = requestData.secondaryBusId &&
          typeof requestData.secondaryBusId === 'string' &&
          requestData.secondaryBusId.trim() !== '';
        const isAssignment = requestData.swapType === 'assignment' || !hasValidSecondaryBus;

        if (isAssignment) {
          // SCENARIO 1: Assignment to Reserved Driver
          // fromDriver becomes reserved, toDriver takes over the bus
          console.log('   📋 Processing as ASSIGNMENT (to reserved driver)');

          // Update bus document - set toDriver as active driver
          const busUpdate = {
            activeDriverId: requestData.toDriverUID,
            assignedDriverId: requestData.toDriverUID,
            updatedAt: FieldValue.serverTimestamp()
          };
          transaction.update(busRef, busUpdate);
          console.log('   ✅ Bus updated:', busUpdate);

          // Update fromDriver - make them reserved (remove bus assignment)
          const fromDriverUpdate = {
            assignedBusId: null,
            busId: null,
            assignedRouteId: null,
            routeId: null,
            status: 'active',
            updatedAt: FieldValue.serverTimestamp()
          };
          transaction.update(fromDriverRef, fromDriverUpdate);
          console.log(`   ✅ From driver (${requestData.fromDriverName}) set to reserved`);

          // Update toDriver - assign them to the bus
          const toDriverUpdate = {
            assignedBusId: requestData.busId,
            busId: requestData.busId,
            assignedRouteId: requestData.routeId,
            routeId: requestData.routeId,
            status: 'active',
            updatedAt: FieldValue.serverTimestamp()
          };
          transaction.update(toDriverRef, toDriverUpdate);
          console.log(`   ✅ To driver (${requestData.toDriverName}) assigned to bus ${requestData.busId}`);

        } else {
          // SCENARIO 2: True Swap between two active drivers
          // Both drivers exchange their bus assignments
          console.log('   📋 Processing as TRUE SWAP (both drivers have buses)');
          console.log(`   ↔️ Exchanging: ${requestData.busNumber} ⟷ ${requestData.secondaryBusNumber}`);

          // Validate secondaryBusId exists and is a valid string
          if (!requestData.secondaryBusId || typeof requestData.secondaryBusId !== 'string' || requestData.secondaryBusId.trim() === '') {
            throw new Error('Secondary bus ID is missing or invalid for swap operation');
          }

          // Get the secondary bus reference
          const secondaryBusRef = adminDb.collection('buses').doc(requestData.secondaryBusId);
          const secondaryBusDoc = await transaction.get(secondaryBusRef);

          if (!secondaryBusDoc.exists) {
            throw new Error('Secondary bus not found for swap');
          }

          // Update PRIMARY bus - assign toDriver
          const primaryBusUpdate = {
            activeDriverId: requestData.toDriverUID,
            assignedDriverId: requestData.toDriverUID,
            updatedAt: FieldValue.serverTimestamp()
          };
          transaction.update(busRef, primaryBusUpdate);
          console.log(`   ✅ Primary bus (${requestData.busNumber}) assigned to ${requestData.toDriverName}`);

          // Update SECONDARY bus - assign fromDriver
          const secondaryBusUpdate = {
            activeDriverId: requestData.fromDriverUID,
            assignedDriverId: requestData.fromDriverUID,
            updatedAt: FieldValue.serverTimestamp()
          };
          transaction.update(secondaryBusRef, secondaryBusUpdate);
          console.log(`   ✅ Secondary bus (${requestData.secondaryBusNumber}) assigned to ${requestData.fromDriverName}`);

          // Update fromDriver - assign to secondary bus
          const fromDriverUpdate = {
            assignedBusId: requestData.secondaryBusId,
            busId: requestData.secondaryBusId,
            assignedRouteId: requestData.secondaryRouteId,
            routeId: requestData.secondaryRouteId,
            status: 'active',
            updatedAt: FieldValue.serverTimestamp()
          };
          transaction.update(fromDriverRef, fromDriverUpdate);
          console.log(`   ✅ From driver (${requestData.fromDriverName}) assigned to ${requestData.secondaryBusNumber}`);

          // Update toDriver - assign to primary bus
          const toDriverUpdate = {
            assignedBusId: requestData.busId,
            busId: requestData.busId,
            assignedRouteId: requestData.routeId,
            routeId: requestData.routeId,
            status: 'active',
            updatedAt: FieldValue.serverTimestamp()
          };
          transaction.update(toDriverRef, toDriverUpdate);
          console.log(`   ✅ To driver (${requestData.toDriverName}) assigned to ${requestData.busNumber}`);
        }

        // Update request status
        transaction.update(requestRef, {
          status: 'accepted',
          acceptedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          actor: acceptorUID
        });
        console.log('   ✅ Request status updated to accepted');
      });

      console.log('🎉 Driver swap transaction completed successfully!');

      // Get after snapshot
      const afterBusDoc = await adminDb.collection('buses').doc(requestData.busId).get();
      const afterSnapshot = afterBusDoc.data();

      // Create audit log
      await this.createAuditLog(
        requestId,
        requestData.busId,
        'accepted',
        acceptorUID,
        requestData.toDriverName,
        'driver',
        requestData.fromDriverUID,
        requestData.toDriverUID,
        { beforeSnapshot, afterSnapshot }
      );

      // Update active trips if any
      await this.updateActiveTrips(requestData.busId, requestData.fromDriverUID, requestData.toDriverUID);

      // Send notifications
      await this.sendSwapAcceptedNotifications(
        requestData.fromDriverUID,
        requestData.fromDriverName || '',
        requestData.toDriverUID,
        requestData.toDriverName || '',
        requestData.busId,
        requestData.busNumber || '',
        requestData.routeId,
        requestData.routeName || ''
      );

      // Update Supabase real-time permissions
      await this.updateSupabasePermissions(requestData.busId, requestData.toDriverUID);

      // Trigger opportunistic cleanup in background
      CleanupService.runOpportunisticCleanup().catch(err =>
        console.error('Background cleanup error:', err)
      );

      return { success: true };
    } catch (error: any) {
      console.error('Error accepting swap request:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Reject a swap request
   * NOTE: On rejection, the request is DELETED from Firestore (no audit log created)
   */
  static async rejectSwapRequest(
    requestId: string,
    rejectorUID: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const requestDoc = await adminDb.collection('driver_swap_requests').doc(requestId).get();
      if (!requestDoc.exists) {
        return { success: false, error: 'Request not found' };
      }

      const requestData = requestDoc.data() as DriverSwapRequest;

      // Validate rejector is the target driver
      if (requestData.toDriverUID !== rejectorUID) {
        return { success: false, error: 'You are not authorized to reject this request' };
      }

      // Send notification BEFORE deleting the document
      await this.sendSwapRejectedNotification(
        requestData.fromDriverUID,
        requestData.toDriverName || '',
        requestData.busNumber || ''
      );

      // DELETE the swap request document immediately (no audit log needed)
      await requestDoc.ref.delete();
      console.log(`🗑️ Deleted rejected swap request: ${requestId}`);

      return { success: true };
    } catch (error: any) {
      console.error('Error rejecting swap request:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * End/Revert a swap (when time period expires or manually ended)
   */
  static async endSwap(
    requestId: string,
    reason: 'expired' | 'completed' | 'reverted',
    actorUID?: string,
    actorName?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const requestDoc = await adminDb.collection('driver_swap_requests').doc(requestId).get();
      if (!requestDoc.exists) {
        return { success: false, error: 'Request not found' };
      }

      const requestData = requestDoc.data() as DriverSwapRequest;

      if (requestData.status !== 'accepted') {
        return { success: false, error: `Cannot end swap with status: ${requestData.status}` };
      }

      console.log('🔄 Ending driver swap...');
      console.log(`   Reason: ${reason}`);
      console.log(`   From: ${requestData.fromDriverName} (${requestData.fromDriverUID.substring(0, 8)}...)`);
      console.log(`   To: ${requestData.toDriverName} (${requestData.toDriverUID.substring(0, 8)}...)`);
      console.log(`   Bus: ${requestData.busNumber} (${requestData.busId})`);

      // Determine swap type - use robust check for secondaryBusId
      const hasValidSecondaryBus = requestData.secondaryBusId &&
        typeof requestData.secondaryBusId === 'string' &&
        requestData.secondaryBusId.trim() !== '';
      const isAssignment = requestData.swapType === 'assignment' || !hasValidSecondaryBus;

      // Perform atomic revert using transaction
      await adminDb.runTransaction(async (transaction: any) => {
        const busRef = adminDb.collection('buses').doc(requestData.busId);
        const fromDriverRef = adminDb.collection('drivers').doc(requestData.fromDriverUID);
        const toDriverRef = adminDb.collection('drivers').doc(requestData.toDriverUID);

        if (isAssignment) {
          // REVERT SCENARIO 1: Assignment - restore fromDriver to bus, toDriver becomes reserved
          console.log('   📋 Reverting ASSIGNMENT...');

          // Restore bus to original driver AND clear activeTripId
          const busUpdate = {
            activeDriverId: requestData.fromDriverUID,
            assignedDriverId: requestData.fromDriverUID,
            activeTripId: null,
            updatedAt: FieldValue.serverTimestamp()
          };
          transaction.update(busRef, busUpdate);
          console.log('   ✅ Bus restored to original driver (activeTripId cleared)');

          // Restore fromDriver - reassign to their original bus
          const fromDriverUpdate = {
            assignedBusId: requestData.busId,
            busId: requestData.busId,
            assignedRouteId: requestData.routeId,
            routeId: requestData.routeId,
            status: 'active',
            updatedAt: FieldValue.serverTimestamp()
          };
          transaction.update(fromDriverRef, fromDriverUpdate);
          console.log(`   ✅ From driver (${requestData.fromDriverName}) reassigned to bus`);

          // Make toDriver reserved again
          const toDriverUpdate = {
            assignedBusId: null,
            busId: null,
            assignedRouteId: null,
            routeId: null,
            status: 'active',
            updatedAt: FieldValue.serverTimestamp()
          };
          transaction.update(toDriverRef, toDriverUpdate);
          console.log(`   ✅ To driver (${requestData.toDriverName}) set to reserved`);

        } else {
          // REVERT SCENARIO 2: True Swap - exchange buses back to original assignments
          console.log('   📋 Reverting TRUE SWAP...');
          console.log(`   ↔️ Restoring: ${requestData.fromDriverName} → ${requestData.busNumber}, ${requestData.toDriverName} → ${requestData.secondaryBusNumber}`);

          // Validate secondaryBusId before accessing
          if (!requestData.secondaryBusId || typeof requestData.secondaryBusId !== 'string' || requestData.secondaryBusId.trim() === '') {
            throw new Error('Secondary bus ID is missing or invalid for swap revert operation');
          }

          const secondaryBusRef = adminDb.collection('buses').doc(requestData.secondaryBusId);

          // Restore PRIMARY bus to fromDriver
          const primaryBusUpdate = {
            activeDriverId: requestData.fromDriverUID,
            assignedDriverId: requestData.fromDriverUID,
            activeTripId: null,
            updatedAt: FieldValue.serverTimestamp()
          };
          transaction.update(busRef, primaryBusUpdate);
          console.log(`   ✅ Primary bus (${requestData.busNumber}) restored to ${requestData.fromDriverName}`);

          // Restore SECONDARY bus to toDriver
          const secondaryBusUpdate = {
            activeDriverId: requestData.toDriverUID,
            assignedDriverId: requestData.toDriverUID,
            activeTripId: null,
            updatedAt: FieldValue.serverTimestamp()
          };
          transaction.update(secondaryBusRef, secondaryBusUpdate);
          console.log(`   ✅ Secondary bus (${requestData.secondaryBusNumber}) restored to ${requestData.toDriverName}`);

          // Restore fromDriver to primary bus
          const fromDriverUpdate = {
            assignedBusId: requestData.busId,
            busId: requestData.busId,
            assignedRouteId: requestData.routeId,
            routeId: requestData.routeId,
            status: 'active',
            updatedAt: FieldValue.serverTimestamp()
          };
          transaction.update(fromDriverRef, fromDriverUpdate);
          console.log(`   ✅ From driver (${requestData.fromDriverName}) restored to ${requestData.busNumber}`);

          // Restore toDriver to secondary bus
          const toDriverUpdate = {
            assignedBusId: requestData.secondaryBusId,
            busId: requestData.secondaryBusId,
            assignedRouteId: requestData.secondaryRouteId,
            routeId: requestData.secondaryRouteId,
            status: 'active',
            updatedAt: FieldValue.serverTimestamp()
          };
          transaction.update(toDriverRef, toDriverUpdate);
          console.log(`   ✅ To driver (${requestData.toDriverName}) restored to ${requestData.secondaryBusNumber}`);
        }
      });

      console.log('🎉 Swap ended successfully! Drivers restored to original assignments.');

      // IMMEDIATE CLEANUP - Delete swap-related documents immediately
      console.log('🧹 Starting immediate cleanup of swap-related documents...');

      try {
        // 1. Delete the swap request document immediately
        await adminDb.collection('driver_swap_requests').doc(requestId).delete();
        console.log('   ✅ Deleted driver_swap_requests document');

        // 2. Delete all audit logs for this swap
        const auditLogs = await adminDb
          .collection('driver_swap_audit')
          .where('requestId', '==', requestId)
          .get();

        if (!auditLogs.empty) {
          const auditBatch = adminDb.batch();
          auditLogs.docs.forEach((doc: any) => {
            auditBatch.delete(doc.ref);
          });
          await auditBatch.commit();
          console.log(`   ✅ Deleted ${auditLogs.size} driver_swap_audit document(s)`);
        } else {
          console.log('   ℹ️  No audit logs found for this swap');
        }

        console.log('🎉 Immediate cleanup completed successfully!');
      } catch (cleanupError: any) {
        console.error('⚠️  Warning: Error during immediate cleanup:', cleanupError);
        // Don't fail the entire operation if cleanup fails
        // The swap has already been reverted successfully
      }

      return { success: true };
    } catch (error: any) {
      console.error('❌ Error ending swap:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clean up old completed/expired swap requests (SAFETY NET ONLY)
   * NOTE: Swap documents are now deleted IMMEDIATELY when swap ends.
   * This function serves as a safety net to catch any orphaned documents.
   * Deletes swap request documents older than 7 days.
   */
  static async cleanupOldSwapRequests(): Promise<{ deleted: number; errors: string[] }> {
    try {
      console.log('🧹 Starting cleanup of old swap request documents...');

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const errors: string[] = [];
      let deletedCount = 0;

      // Get completed/expired swaps older than 7 days
      const oldSwaps = await adminDb
        .collection('driver_swap_requests')
        .where('status', 'in', ['completed', 'expired', 'rejected', 'cancelled'])
        .get();

      console.log(`   Found ${oldSwaps.size} completed/expired swap requests`);

      // Use batch delete for efficiency
      const batch = adminDb.batch();
      let batchCount = 0;
      const MAX_BATCH_SIZE = 500; // Firestore limit

      for (const doc of oldSwaps.docs) {
        const requestData = doc.data();
        const endedAt = requestData.endedAt?.toDate?.() || requestData.updatedAt?.toDate?.() || new Date(requestData.updatedAt);

        // Only delete if older than 7 days
        if (endedAt < sevenDaysAgo) {
          try {
            batch.delete(doc.ref);
            batchCount++;
            deletedCount++;

            // Commit batch if we reach the limit
            if (batchCount >= MAX_BATCH_SIZE) {
              await batch.commit();
              console.log(`   ✅ Batch deleted ${batchCount} documents`);
              batchCount = 0;
            }
          } catch (error: any) {
            console.error(`   ❌ Error deleting ${doc.id}:`, error);
            errors.push(`Failed to delete ${doc.id}: ${error.message}`);
          }
        }
      }

      // Commit remaining documents
      if (batchCount > 0) {
        await batch.commit();
        console.log(`   ✅ Final batch deleted ${batchCount} documents`);
      }

      console.log(`✅ Cleanup completed: Deleted ${deletedCount} old swap request documents`);
      if (errors.length > 0) {
        console.error(`⚠️ Errors during cleanup: ${errors.join(', ')}`);
      }

      return { deleted: deletedCount, errors };
    } catch (error: any) {
      console.error('❌ Error during cleanup:', error);
      return { deleted: 0, errors: [error.message] };
    }
  }

  /**
   * Revert a swap (admin only) - uses endSwap internally
   */
  static async revertSwap(
    requestId: string,
    adminUID: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const requestDoc = await adminDb.collection('driver_swap_requests').doc(requestId).get();
      if (!requestDoc.exists) {
        return { success: false, error: 'Request not found' };
      }

      const requestData = requestDoc.data() as DriverSwapRequest;

      if (requestData.status !== 'accepted') {
        return { success: false, error: 'Only accepted swaps can be reverted' };
      }

      // Get admin details
      const adminDoc = await adminDb.collection('admins').doc(adminUID).get();
      const adminName = adminDoc.data()?.name || 'Admin';

      // Use endSwap to perform the revert
      const result = await this.endSwap(requestId, 'reverted', adminUID, adminName);

      if (!result.success) {
        return result;
      }

      // Create audit log
      await this.createAuditLog(
        requestId,
        requestData.busId,
        'reverted',
        adminUID,
        adminName,
        'admin',
        requestData.toDriverUID,
        requestData.fromDriverUID,
        { revertedAt: new Date() }
      );

      // Send notifications
      await this.sendRevertNotifications(
        requestData.fromDriverUID,
        requestData.fromDriverName || '',
        requestData.toDriverUID,
        requestData.toDriverName || '',
        requestData.busNumber || '',
        adminName
      );

      return result;
    } catch (error: any) {
      console.error('Error reverting swap:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check and expire old swap requests
   * NOTE: Will skip expiring if there's an active trip on the bus to allow trip completion
   */
  static async checkAndExpireSwaps(): Promise<{ expired: number; skipped: number; errors: string[] }> {
    try {
      console.log('🔍 Checking for expired swap requests...');

      const now = new Date();
      const errors: string[] = [];
      let expiredCount = 0;
      let skippedCount = 0;

      // Get all accepted swaps
      const acceptedSwaps = await adminDb
        .collection('driver_swap_requests')
        .where('status', '==', 'accepted')
        .get();

      console.log(`   Found ${acceptedSwaps.size} active swaps`);

      for (const doc of acceptedSwaps.docs) {
        const requestData = doc.data();
        const timePeriod = requestData.timePeriod;

        try {
          // Calculate if swap has expired
          const acceptedAt = requestData.acceptedAt?.toDate?.() || new Date(requestData.acceptedAt);
          let shouldExpire = false;
          let expiryTime: Date | null = null;

          if (timePeriod?.type === 'first_trip') {
            // Expire after 4 hours
            expiryTime = new Date(acceptedAt.getTime() + 4 * 60 * 60 * 1000);
            shouldExpire = now > expiryTime;
          } else if (timePeriod?.type === 'one_day') {
            // Expire after 24 hours
            expiryTime = new Date(acceptedAt.getTime() + 24 * 60 * 60 * 1000);
            shouldExpire = now > expiryTime;
          } else if (timePeriod?.type === 'two_days') {
            // Expire after 48 hours
            expiryTime = new Date(acceptedAt.getTime() + 48 * 60 * 60 * 1000);
            shouldExpire = now > expiryTime;
          } else if (timePeriod?.type === 'custom' && timePeriod?.endTime) {
            // Expire after custom end time
            expiryTime = new Date(timePeriod.endTime);
            shouldExpire = now > expiryTime;
          }

          if (shouldExpire) {
            // Check if there's an active trip on the bus before expiring
            const busDoc = await adminDb.collection('buses').doc(requestData.busId).get();
            const busData = busDoc.data();
            const activeTripId = busData?.activeTripId;

            if (activeTripId) {
              // Check if the trip is actually still active
              const tripDoc = await adminDb.collection('trip_sessions').doc(activeTripId).get();
              const tripData = tripDoc.data();

              if (tripDoc.exists && tripData && !tripData.endedAt) {
                // Trip is still ongoing - don't end the swap yet
                console.log(`   ⏳ Swap ${doc.id} expired but trip ${activeTripId} is still active. Skipping for now...`);
                console.log(`      → Bus: ${requestData.busNumber}, Driver: ${requestData.toDriverName}`);
                console.log(`      → Trip will be allowed to complete before swap ends`);

                // Mark the swap as pending expiry if not already marked
                if (!requestData.pendingExpiry) {
                  await doc.ref.update({
                    pendingExpiry: true,
                    pendingExpirySince: now,
                    expiredAt: expiryTime,
                    updatedAt: FieldValue.serverTimestamp()
                  });
                  console.log(`      → Marked swap as pending expiry`);
                }

                skippedCount++;
                continue;
              }
            }

            // No active trip or trip has ended - safe to expire the swap
            console.log(`   ⏰ Expiring swap: ${doc.id} (${requestData.fromDriverName} → ${requestData.toDriverName})`);

            const result = await this.endSwap(doc.id, 'expired');

            if (result.success) {
              expiredCount++;
            } else {
              errors.push(`Failed to expire ${doc.id}: ${result.error}`);
            }
          }
        } catch (error: any) {
          console.error(`   ❌ Error processing swap ${doc.id}:`, error);
          errors.push(`Error processing ${doc.id}: ${error.message}`);
        }
      }

      // Also check for swaps that were marked as pending expiry and whose trips have now ended
      const pendingExpirySwaps = await adminDb
        .collection('driver_swap_requests')
        .where('status', '==', 'accepted')
        .where('pendingExpiry', '==', true)
        .get();

      if (pendingExpirySwaps.size > 0) {
        console.log(`\n   🔍 Checking ${pendingExpirySwaps.size} swaps with pending expiry...`);

        for (const doc of pendingExpirySwaps.docs) {
          const requestData = doc.data();

          try {
            const busDoc = await adminDb.collection('buses').doc(requestData.busId).get();
            const busData = busDoc.data();
            const activeTripId = busData?.activeTripId;

            let tripEnded = true;

            if (activeTripId) {
              const tripDoc = await adminDb.collection('trip_sessions').doc(activeTripId).get();
              const tripData = tripDoc.data();
              tripEnded = !tripDoc.exists || !tripData || !!tripData.endedAt;
            }

            if (tripEnded) {
              console.log(`   ✅ Trip ended for pending swap ${doc.id}. Now expiring...`);

              const result = await this.endSwap(doc.id, 'expired');

              if (result.success) {
                expiredCount++;
              } else {
                errors.push(`Failed to expire pending ${doc.id}: ${result.error}`);
              }
            } else {
              console.log(`   ⏳ Trip still active for ${doc.id}. Will check again later.`);
              skippedCount++;
            }
          } catch (error: any) {
            console.error(`   ❌ Error processing pending swap ${doc.id}:`, error);
            errors.push(`Error processing pending ${doc.id}: ${error.message}`);
          }
        }
      }

      console.log(`✅ Expired ${expiredCount} swaps, skipped ${skippedCount} (trips in progress)`);
      if (errors.length > 0) {
        console.error(`⚠️ Errors: ${errors.join(', ')}`);
      }

      return { expired: expiredCount, skipped: skippedCount, errors };
    } catch (error: any) {
      console.error('❌ Error checking expired swaps:', error);
      return { expired: 0, skipped: 0, errors: [error.message] };
    }
  }

  /**
   * Create audit log entry
   */
  private static async createAuditLog(
    requestId: string,
    busId: string,
    action: string,
    actorUID: string,
    actorName?: string,
    actorRole?: string,
    fromDriverUID?: string,
    toDriverUID?: string,
    metadata?: any
  ): Promise<void> {
    try {
      await adminDb.collection('driver_swap_audit').add({
        requestId,
        busId,
        action,
        actorUID,
        actorName,
        actorRole,
        fromDriverUID,
        toDriverUID,
        timestamp: FieldValue.serverTimestamp(),
        metadata,
        ...metadata
      });
    } catch (error) {
      console.error('Error creating audit log:', error);
    }
  }

  /**
   * Update active trips with new driver
   */
  private static async updateActiveTrips(
    busId: string,
    fromDriverUID: string,
    toDriverUID: string
  ): Promise<void> {
    try {
      const activeTripsSnapshot = await adminDb
        .collection('trip_sessions')
        .where('busId', '==', busId)
        .where('endedAt', '==', null)
        .get();

      for (const tripDoc of activeTripsSnapshot.docs) {
        await tripDoc.ref.update({
          driverUid: toDriverUID,
          previousDriverUid: fromDriverUID,
          swappedAt: FieldValue.serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error updating active trips:', error);
    }
  }

  /**
   * Update Supabase real-time permissions
   */
  private static async updateSupabasePermissions(busId: string, newDriverUID: string): Promise<void> {
    try {
      // Update bus_locations table
      const { error } = await supabase
        .from('bus_locations')
        .upsert({
          bus_id: busId,
          driver_uid: newDriverUID,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error updating Supabase permissions:', error);
      }

      // Broadcast channel update
      const channel = supabase.channel(`bus:${busId}`);
      await channel.send({
        type: 'broadcast',
        event: 'driver_changed',
        payload: {
          busId,
          newDriverUID,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error updating Supabase:', error);
    }
  }

  /**
   * Send swap request notifications
   */
  private static async sendSwapRequestNotifications(
    requestId: string,
    fromDriverName: string,
    toDriverName: string,
    busNumber: string,
    toDriverUID: string
  ): Promise<void> {
    try {
      const notificationService = new NotificationService();

      const sender = {
        userId: 'system',
        userName: 'System',
        userRole: 'admin' as const,
        employeeId: undefined
      };

      const target: NotificationTarget = {
        type: 'specific_users',
        specificUserIds: [toDriverUID]
      };

      const content = `${fromDriverName} has requested you to take over Bus ${busNumber}. Please review and respond to this swap request in your Driver Swap Requests page.`;
      const title = '🔄 Driver Swap Request';

      // Create notification for target driver using new system
      await notificationService.createNotification(
        sender,
        target,
        content,
        title,
        { requestId, type: 'trip' }
      );

      // Send real-time notification via Supabase
      const channel = supabase.channel(`driver:${toDriverUID}`);
      await channel.send({
        type: 'broadcast',
        event: 'swap_request',
        payload: {
          requestId,
          fromDriverName,
          busNumber
        }
      });
    } catch (error) {
      console.error('Error sending notifications:', error);
    }
  }

  /**
   * Send swap accepted notifications
   */
  private static async sendSwapAcceptedNotifications(
    fromDriverUID: string,
    fromDriverName: string,
    toDriverUID: string,
    toDriverName: string,
    busId: string,
    busNumber: string,
    routeId: string,
    routeName: string
  ): Promise<void> {
    try {
      const notificationService = new NotificationService();
      const sender = {
        userId: 'system',
        userName: 'System',
        userRole: 'admin' as const,
        employeeId: undefined
      };

      // Notification for original driver
      await notificationService.createNotification(
        sender,
        { type: 'specific_users', specificUserIds: [fromDriverUID] },
        `${toDriverName} accepted your swap request for Bus ${busNumber}. Your active duties have been removed for this bus.`,
        '✅ Swap Accepted',
        { busId, type: 'trip' }
      );

      // Notification for new driver
      await notificationService.createNotification(
        sender,
        { type: 'specific_users', specificUserIds: [toDriverUID] },
        `You are now active driver for Bus ${busNumber} on Route ${routeName}.`,
        '✅ Swap Confirmed',
        { busId, routeId, type: 'trip' }
      );

      // Notification for students
      const studentsSnapshot = await adminDb
        .collection('students')
        .where('busId', '==', busId)
        .get();

      const studentUIDs = studentsSnapshot.docs.map((doc: any) => doc.data().uid).filter((uid: any) => uid);

      if (studentUIDs.length > 0) {
        await notificationService.createNotification(
          sender,
          { type: 'specific_users', specificUserIds: studentUIDs },
          `Notice: Driver ${toDriverName} will operate Bus ${busNumber} (Route: ${routeName}) today instead of ${fromDriverName}.`,
          `🚌 Driver Change — ${busNumber}`,
          { busId, routeId, type: 'trip' }
        );
      }

      // Notification for moderators and admins
      const moderatorsSnapshot = await adminDb.collection('moderators').get();
      const adminsSnapshot = await adminDb.collection('admins').get();

      const moderatorUIDs = moderatorsSnapshot.docs.map((doc: any) => doc.data().uid).filter((uid: any) => uid);
      const adminUIDs = adminsSnapshot.docs.map((doc: any) => doc.data().uid).filter((uid: any) => uid);
      const managementUIDs = [...moderatorUIDs, ...adminUIDs];

      if (managementUIDs.length > 0) {
        await notificationService.createNotification(
          sender,
          { type: 'specific_users', specificUserIds: managementUIDs },
          `Driver ${toDriverName} is now operating Bus ${busNumber} (Route: ${routeName}) instead of ${fromDriverName}.`,
          '📋 Driver Swap Executed',
          { busId, routeId, fromDriverUID, toDriverUID, type: 'notice' }
        );
      }
    } catch (error) {
      console.error('Error sending accepted notifications:', error);
    }
  }

  /**
   * Send swap rejected notification
   */
  private static async sendSwapRejectedNotification(
    fromDriverUID: string,
    toDriverName: string,
    busNumber: string
  ): Promise<void> {
    try {
      const notificationService = new NotificationService();
      const sender = {
        userId: 'system',
        userName: 'System',
        userRole: 'admin' as const,
        employeeId: undefined
      };

      await notificationService.createNotification(
        sender,
        { type: 'specific_users', specificUserIds: [fromDriverUID] },
        `${toDriverName} rejected your swap request for Bus ${busNumber}.`,
        '❌ Swap Request Rejected',
        { busNumber, type: 'trip' }
      );
    } catch (error) {
      console.error('Error sending rejected notification:', error);
    }
  }

  /**
   * Send revert notifications
   */
  private static async sendRevertNotifications(
    fromDriverUID: string,
    fromDriverName: string,
    toDriverUID: string,
    toDriverName: string,
    busNumber: string,
    adminName: string
  ): Promise<void> {
    try {
      const notificationService = new NotificationService();
      const sender = {
        userId: 'system',
        userName: 'System',
        userRole: 'admin' as const,
        employeeId: undefined
      };

      // Notify both drivers
      await notificationService.createNotification(
        sender,
        { type: 'specific_users', specificUserIds: [fromDriverUID, toDriverUID] },
        `Administrator ${adminName} has reverted the driver swap for Bus ${busNumber}. ${fromDriverName} is now the active driver again.`,
        '↩️ Swap Reverted by Admin',
        { busNumber, adminName, type: 'notice' }
      );
    } catch (error) {
      console.error('Error sending revert notifications:', error);
    }
  }

  /**
   * Check and expire old pending requests
   * Handles two scenarios:
   * 1. Acceptance window expired (20 minutes without response)
   * 2. Swap time period expired (e.g., request for Dec 19 but it's now Dec 20)
   */
  static async expirePendingRequests(): Promise<{ expired: number; cancelled: number; errors: string[] }> {
    try {
      const now = new Date();
      const pendingRequestsSnapshot = await adminDb
        .collection('driver_swap_requests')
        .where('status', '==', 'pending')
        .get();

      let expiredCount = 0;
      let cancelledCount = 0;
      const errors: string[] = [];

      console.log(`🔍 Checking ${pendingRequestsSnapshot.size} pending swap requests...`);

      for (const doc of pendingRequestsSnapshot.docs) {
        try {
          await adminDb.runTransaction(async (transaction: any) => {
            const freshDoc = await transaction.get(doc.ref);
            if (!freshDoc.exists || freshDoc.data()?.status !== 'pending') return;

            const data = freshDoc.data();
            // Check 1: Has the acceptance window (20 minutes) expired?
            const expiresAt = data.expiresAt?.toDate?.() || new Date(data.expiresAt);
            const acceptanceExpired = expiresAt < now;

            // Check 2: Has the swap's requested time period passed?
            const timePeriod = data.timePeriod;
            let timePeriodExpired = false;

            if (timePeriod?.endTime) {
              const endTime = new Date(timePeriod.endTime);
              timePeriodExpired = endTime < now;
            } else if (timePeriod?.type === 'one_day') {
              const startTime = timePeriod.startTime ? new Date(timePeriod.startTime) : new Date(data.createdAt?.toDate?.() || data.createdAt);
              const impliedEndTime = new Date(startTime.getTime() + 24 * 60 * 60 * 1000);
              timePeriodExpired = impliedEndTime < now;
            } else if (timePeriod?.type === 'two_days') {
              const startTime = timePeriod.startTime ? new Date(timePeriod.startTime) : new Date(data.createdAt?.toDate?.() || data.createdAt);
              const impliedEndTime = new Date(startTime.getTime() + 48 * 60 * 60 * 1000);
              timePeriodExpired = impliedEndTime < now;
            }

            if (timePeriodExpired) {
              // Swap time period has passed - delete the request
              console.log(`   🚫 Deleting swap ${doc.id} - time period expired`);

              transaction.delete(doc.ref);

              // Notify requester
              const notifRef = adminDb.collection('notifications').doc();
              transaction.set(notifRef, {
                title: 'Swap Request Cancelled',
                message: `Your swap request for Bus ${data.busNumber} was automatically cancelled because the requested time period has passed.`,
                type: 'info',
                category: 'general',
                audience: [data.fromDriverUID],
                status: 'sent',
                createdBy: 'system',
                createdAt: FieldValue.serverTimestamp()
              });

              cancelledCount++;
            } else if (acceptanceExpired) {
              // Acceptance window expired - delete the request
              console.log(`   ⏰ Deleting swap ${doc.id} - acceptance window passed`);

              transaction.delete(doc.ref);

              // Notify requester using the nice message requested by USER
              const notifRef = adminDb.collection('notifications').doc();
              transaction.set(notifRef, {
                title: 'Swap Request Expired',
                message: `${data.toDriverName} didn't respond to your request within the 20-minute window.`,
                type: 'info',
                category: 'general',
                audience: [data.fromDriverUID],
                status: 'sent',
                createdBy: 'system',
                createdAt: FieldValue.serverTimestamp()
              });

              expiredCount++;
            }
          });
        } catch (error: any) {
          console.error(`   ❌ Error processing pending swap ${doc.id}:`, error);
          errors.push(`Error processing ${doc.id}: ${error.message}`);
        }
      }

      console.log(`✅ Pending requests cleanup: ${expiredCount} expired (window), ${cancelledCount} cancelled (time period past)`);
      return { expired: expiredCount, cancelled: cancelledCount, errors };
    } catch (error: any) {
      console.error('Error expiring requests:', error);
      return { expired: 0, cancelled: 0, errors: [error.message] };
    }
  }
}
