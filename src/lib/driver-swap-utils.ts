import { createClient } from '@supabase/supabase-js';
import { db as adminDb } from '@/lib/firebase-admin';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { CleanupService } from './cleanup-service';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Get the effective driver for a bus (checks activeDriverId first, then assignedDriverId)
 * Also performs opportunistic cleanup of expired swaps
 */
export async function getEffectiveDriver(busId: string): Promise<string | null> {
  try {
    // Opportunistic cleanup: Check if swap has expired for this bus
    await CleanupService.checkAndRevertExpiredSwap(busId).catch(err => 
      console.error('Cleanup error in getEffectiveDriver:', err)
    );

    // Get bus document from Firestore
    const busDoc = await adminDb.collection('buses').doc(busId).get();
    if (!busDoc.exists) {
      console.error(`❌ Bus ${busId} not found`);
      return null;
    }

    const busData = busDoc.data();
    
    // Check activeDriverId first (set after swap acceptance)
    if (busData?.activeDriverId) {
      console.log(`✅ Bus ${busId} has active driver:`, busData.activeDriverId);
      return busData.activeDriverId;
    }
    
    // Fall back to assignedDriverId (permanent/scheduled driver)
    const assignedDriver = busData?.assignedDriverId || busData?.driverUid || busData?.driver_uid;
    console.log(`✅ Bus ${busId} assigned driver:`, assignedDriver);
    return assignedDriver || null;

  } catch (error) {
    console.error('❌ Error getting effective driver:', error);
    return null;
  }
}

/**
 * Check if a driver is authorized to perform actions on a bus
 */
export async function isDriverAuthorized(driverUid: string, busId: string): Promise<boolean> {
  const effectiveDriver = await getEffectiveDriver(busId);
  return effectiveDriver === driverUid;
}

/**
 * Get active bus assignment for a driver (where they are activeDriverId)
 */
export async function getActiveAssignment(driverUid: string): Promise<any | null> {
  try {
    // Check if driver is activeDriverId on any bus
    const snapshot = await adminDb
      .collection('buses')
      .where('activeDriverId', '==', driverUid)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const busDoc = snapshot.docs[0];
      return {
        busId: busDoc.id,
        ...busDoc.data(),
        isTemporary: busDoc.data().assignedDriverId !== driverUid
      };
    }

    // Check if driver is assignedDriverId (permanent assignment)
    const permanentSnapshot = await adminDb
      .collection('buses')
      .where('assignedDriverId', '==', driverUid)
      .limit(1)
      .get();

    if (!permanentSnapshot.empty) {
      const busDoc = permanentSnapshot.docs[0];
      return {
        busId: busDoc.id,
        ...busDoc.data(),
        isTemporary: false
      };
    }

    return null;
  } catch (error) {
    console.error('❌ Error getting active assignment:', error);
    return null;
  }
}

/**
 * Get all pending incoming swap requests for a driver
 */
export async function getPendingIncomingRequests(driverUid: string): Promise<any[]> {
  try {
    // Get from Firestore instead of Supabase
    const snapshot = await adminDb
      .collection('driver_swap_requests')
      .where('toDriverUID', '==', driverUid)
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc: DocumentSnapshot) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('❌ Error getting pending requests:', error);
    return [];
  }
}/**
 * Validate if a driver can publish location for a bus
 */
export async function canDriverPublishLocation(driverUid: string, busId: string): Promise<boolean> {
  const effectiveDriver = await getEffectiveDriver(busId);
  return effectiveDriver === driverUid;
}

/**
 * Get swap request by ID
 */
export async function getSwapRequest(requestId: string): Promise<any | null> {
  try {
    const doc = await adminDb.collection('driver_swap_requests').doc(requestId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error('❌ Error getting swap request:', error);
    return null;
  }
}

/**
 * Get all swap requests for a bus
 */
export async function getBusSwapHistory(busId: string): Promise<any[]> {
  try {
    const snapshot = await adminDb
      .collection('driver_swap_requests')
      .where('busId', '==', busId)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    return snapshot.docs.map((doc: DocumentSnapshot) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('❌ Error getting bus swap history:', error);
    return [];
  }
}

