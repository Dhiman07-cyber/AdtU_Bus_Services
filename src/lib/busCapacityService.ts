/**
 * Bus Capacity Management Service
 * Handles intelligent seat allocation, capacity tracking, and smart bus suggestions
 */

import { adminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export interface BusCapacity {
  busId: string;
  busNumber: string;
  capacity: number; // Max seats/capacity
  currentMembers: number;
  routeId: string;
  shift: string;
  isFull: boolean;
}

export interface AlternativeBusResult {
  success: boolean;
  alternativeBuses?: BusCapacity[];
  message: string;
  adminAlert?: boolean;
}

/**
 * Get capacity display string (deprecated - use inline template)
 * @deprecated Use `${currentMembers}/${capacity}` directly in templates
 */
export function formatCapacityDisplay(currentMembers: number, capacity: number): string {
  return `${currentMembers}/${capacity}`;
}

/**
 * Check if bus has available seats
 */
export async function checkBusCapacity(busId: string): Promise<{
  available: boolean;
  currentMembers: number;
  capacity: number;
}> {
  try {
    const busDoc = await adminDb.collection('buses').doc(busId).get();

    if (!busDoc.exists) {
      throw new Error(`Bus ${busId} not found`);
    }

    const busData = busDoc.data();
    const currentMembers = busData?.currentMembers || 0;
    const capacity = busData?.capacity || 55;

    const available = currentMembers < capacity;

    console.log(`🔍 Bus ${busId} capacity check:`, {
      currentMembers,
      capacity,
      available,
      display: `${currentMembers}/${capacity}`
    });

    return {
      available,
      currentMembers,
      capacity
    };
  } catch (error) {
    console.error(`Error checking bus capacity for ${busId}:`, error);
    throw error;
  }
}

/**
 * Increment bus capacity when student is added
 */
export async function incrementBusCapacity(busId: string, studentUid: string, shift?: string): Promise<void> {
  try {
    const busRef = adminDb.collection('buses').doc(busId);
    const busDoc = await busRef.get();

    if (!busDoc.exists) {
      throw new Error(`Bus ${busId} not found`);
    }

    const busData = busDoc.data();
    const oldMembers = busData?.currentMembers || 0;
    const currentMembers = oldMembers + 1;
    const capacity = busData?.capacity || 55;

    // Prepare load updates
    const updates: any = {
      currentMembers: currentMembers,
      updatedAt: new Date().toISOString()
    };

    // Update Load counts if shift is provided
    if (shift) {
      const normalizedShift = shift.toLowerCase();
      const currentLoad = busData?.load || { morningCount: 0, eveningCount: 0 };

      if (normalizedShift === 'morning' || normalizedShift === 'both') {
        updates['load.morningCount'] = (currentLoad.morningCount || 0) + 1;
      }
      if (normalizedShift === 'evening' || normalizedShift === 'both') {
        updates['load.eveningCount'] = (currentLoad.eveningCount || 0) + 1;
      }
    }

    // Update bus document
    await busRef.update(updates);

    console.log(`✅ Bus ${busId} capacity incremented:`, {
      oldDisplay: `${oldMembers}/${capacity}`,
      newDisplay: `${currentMembers}/${capacity}`,
      studentAdded: studentUid,
      shift: shift || 'not provided'
    });

    // Check if bus is now full and send admin alert
    if (currentMembers >= capacity) {
      await sendBusFullAlert(busId, busData?.busNumber, busData?.routeId);
    }
  } catch (error) {
    console.error(`Error incrementing bus capacity for ${busId}:`, error);
    throw error;
  }
}

/**
 * Decrement bus capacity when student is removed/expired
 */
export async function decrementBusCapacity(busId: string, studentUid: string, shift?: string): Promise<void> {
  try {
    const busRef = adminDb.collection('buses').doc(busId);
    const busDoc = await busRef.get();

    if (!busDoc.exists) {
      throw new Error(`Bus ${busId} not found`);
    }

    const busData = busDoc.data();
    const oldMembers = busData?.currentMembers || 0;
    const currentMembers = Math.max(0, oldMembers - 1); // Never go below 0
    const capacity = busData?.capacity || 55;

    // Prepare updates
    const updates: any = {
      currentMembers: currentMembers,
      updatedAt: new Date().toISOString()
    };

    // Update Load counts if shift is provided
    if (shift) {
      const normalizedShift = shift.toLowerCase();
      const currentLoad = busData?.load || { morningCount: 0, eveningCount: 0 };

      if (normalizedShift === 'morning' || normalizedShift === 'both') {
        updates['load.morningCount'] = Math.max(0, (currentLoad.morningCount || 0) - 1);
      }
      if (normalizedShift === 'evening' || normalizedShift === 'both') {
        updates['load.eveningCount'] = Math.max(0, (currentLoad.eveningCount || 0) - 1);
      }
    }

    // Update bus document
    await busRef.update(updates);

    console.log(`✅ Bus ${busId} capacity decremented:`, {
      oldDisplay: `${oldMembers}/${capacity}`,
      newDisplay: `${currentMembers}/${capacity}`,
      studentRemoved: studentUid,
      shift: shift || 'not provided'
    });
  } catch (error) {
    console.error(`Error decrementing bus capacity for ${busId}:`, error);
    throw error;
  }
}

/**
 * Find alternative buses for a given stop/route
 */
export async function findAlternativeBuses(
  stopId: string,
  routeId: string,
  shift: string
): Promise<AlternativeBusResult> {
  try {
    console.log(`🔍 Finding alternative buses for stop: ${stopId}, route: ${routeId}, shift: ${shift}`);

    // Get all buses from Firestore
    const busesSnapshot = await adminDb.collection('buses').get();
    const allBuses = busesSnapshot.docs.map((doc: any) => ({
      busId: doc.id,
      ...doc.data()
    }));

    // Filter buses that pass through this stop and have available seats
    const alternativeBuses: BusCapacity[] = [];

    for (const bus of allBuses) {
      // Skip the originally requested route's bus
      if (bus.routeId === routeId) continue;

      // Check shift compatibility
      const busShift = bus.shift?.toLowerCase() || 'both';
      const requestedShift = shift?.toLowerCase() || 'morning';
      const shiftMatch = busShift === 'both' || busShift === requestedShift;

      if (!shiftMatch) continue;

      // Check if bus route passes through the requested stop
      const route = bus.route;
      if (!route || !route.stops) continue;

      const passesThrough = route.stops.some((stop: any) =>
        stop.stopId === stopId || stop.name === stopId
      );

      if (!passesThrough) continue;

      // Check capacity
      const currentMembers = bus.currentMembers || 0;
      const capacity = bus.capacity || 55;
      const available = currentMembers < capacity;

      if (available) {
        alternativeBuses.push({
          busId: bus.busId,
          busNumber: bus.busNumber,
          capacity: capacity,
          currentMembers,
          routeId: bus.routeId,
          shift: bus.shift,
          isFull: false
        });
      }
    }

    // If alternative buses found
    if (alternativeBuses.length > 0) {
      // Sort by most available seats
      alternativeBuses.sort((a, b) =>
        (b.capacity - b.currentMembers) - (a.capacity - a.currentMembers)
      );

      return {
        success: true,
        alternativeBuses,
        message: `Found ${alternativeBuses.length} alternative bus(es) that pass through your stop with available seats.`
      };
    }

    // No alternatives found - this is critical, trigger admin alert
    console.warn(`⚠️ No alternative buses found for stop ${stopId}`);

    // Send high-demand alert to admins
    await sendHighDemandAlert(routeId, stopId);

    return {
      success: false,
      message: 'All buses serving your area are currently full. An administrator has been notified and will assist you shortly.',
      adminAlert: true
    };
  } catch (error) {
    console.error('Error finding alternative buses:', error);
    return {
      success: false,
      message: 'Unable to find alternative buses at this time. Please contact support.'
    };
  }
}

/**
 * Send alert to admins when bus is full
 */
async function sendBusFullAlert(busId: string, busNumber: string, routeId: string): Promise<void> {
  try {
    // Get all admins
    const adminsSnapshot = await adminDb.collection('admins').get();

    const notificationData = {
      type: 'BusFull',
      title: '🚌 Bus Capacity Full',
      body: `Bus ${busNumber} (${busId}) on ${routeId} has reached full capacity. Consider increasing capacity or adding another bus.`,
      priority: 'high',
      links: {
        busId,
        routeId,
        action: '/admin/buses'
      },
      read: false,
      createdAt: new Date().toISOString()
    };

    // Send notification to all admins
    const batch = adminDb.batch();
    adminsSnapshot.docs.forEach((adminDoc: any) => {
      const notifRef = adminDb.collection('notifications').doc();
      batch.set(notifRef, {
        notifId: notifRef.id,
        toUid: adminDoc.id,
        toRole: 'admin',
        ...notificationData
      });
    });

    await batch.commit();
    console.log(`📢 Bus full alert sent to ${adminsSnapshot.size} admin(s) for bus ${busId}`);
  } catch (error) {
    console.error('Error sending bus full alert:', error);
  }
}

/**
 * Send high-demand alert to admins when no alternatives exist
 */
async function sendHighDemandAlert(routeId: string, stopId: string): Promise<void> {
  try {
    // Get all admins and moderators
    const adminsSnapshot = await adminDb.collection('admins').get();
    const moderatorsSnapshot = await adminDb.collection('moderators').get();

    const notificationData = {
      type: 'HighDemand',
      title: '⚠️ High Demand Alert',
      body: `All buses serving ${stopId} (${routeId}) are at full capacity. Students are unable to register. Action required: Increase capacity or add buses to this route.`,
      priority: 'critical',
      links: {
        routeId,
        stopId,
        action: '/admin/buses'
      },
      read: false,
      createdAt: new Date().toISOString()
    };

    // Send to all admins and moderators
    const batch = adminDb.batch();

    adminsSnapshot.docs.forEach((doc: any) => {
      const notifRef = adminDb.collection('notifications').doc();
      batch.set(notifRef, {
        notifId: notifRef.id,
        toUid: doc.id,
        toRole: 'admin',
        ...notificationData
      });
    });

    moderatorsSnapshot.docs.forEach((doc: any) => {
      const notifRef = adminDb.collection('notifications').doc();
      batch.set(notifRef, {
        notifId: notifRef.id,
        toUid: doc.id,
        toRole: 'moderator',
        ...notificationData
      });
    });

    await batch.commit();
    console.log(`📢 High-demand alert sent to ${adminsSnapshot.size + moderatorsSnapshot.size} staff member(s)`);
  } catch (error) {
    console.error('Error sending high-demand alert:', error);
  }
}

/**
 * Validate and suggest bus for student
 * Main entry point for smart bus allocation
 */
export async function validateAndSuggestBus(params: {
  routeId: string;
  stopId: string;
  shift: string;
}): Promise<{
  canAssign: boolean;
  busId?: string;
  message: string;
  alternatives?: BusCapacity[];
  requiresAdminAttention?: boolean;
}> {
  try {
    const { routeId, stopId, shift } = params;

    // Derive busId from routeId (route_X → bus_X)
    const busId = routeId.replace('route_', 'bus_');

    // Check if primary bus has capacity
    const capacityCheck = await checkBusCapacity(busId);

    if (capacityCheck.available) {
      return {
        canAssign: true,
        busId,
        message: `Seat available on Bus ${busId} (${capacityCheck.currentMembers}/${capacityCheck.capacity})`
      };
    }

    // Primary bus full, find alternatives
    console.log(`🔄 Primary bus ${busId} is full (${capacityCheck.currentMembers}/${capacityCheck.capacity}), searching alternatives...`);

    const alternativeResult = await findAlternativeBuses(stopId, routeId, shift);

    if (alternativeResult.success && alternativeResult.alternativeBuses && alternativeResult.alternativeBuses.length > 0) {
      const bestAlternative = alternativeResult.alternativeBuses[0];

      return {
        canAssign: false, // Don't auto-assign, let user choose
        message: `Bus ${busId} is full (${capacityCheck.currentMembers}/${capacityCheck.capacity}). However, ${alternativeResult.message}`,
        alternatives: alternativeResult.alternativeBuses
      };
    }

    // No alternatives found - critical situation
    return {
      canAssign: false,
      message: alternativeResult.message,
      requiresAdminAttention: true
    };
  } catch (error) {
    console.error('Error in validateAndSuggestBus:', error);
    return {
      canAssign: false,
      message: 'Unable to validate bus capacity. Please try again or contact support.'
    };
  }
}
