/**
 * Staging Adapter
 * 
 * Helps bridge the new staging model with existing page implementations.
 * Provides conversion functions and simplified interfaces.
 */

import type {
    DriverStagingRow,
    RouteStagingRow,
    DriverDoc,
    BusDoc,
    RouteDoc,
} from '@/lib/staging/stagingModel';
import {
    createDriverStagingRow,
    createReserveStagingRow,
    createSwapStagingRow,
    createRouteStagingRow,
    formatBusLabel,
    generateStagingId,
} from '@/lib/staging/stagingModel';

// ============================================
// LEGACY TYPE ADAPTERS
// ============================================

/**
 * Legacy driver data interface (from existing pages)
 */
interface LegacyDriverData {
    id: string;
    fullName?: string;
    name?: string;
    employeeId?: string;
    driverId?: string;
    assignedBusId?: string;
    busId?: string;
    assignedRouteId?: string;
    routeId?: string;
    isReserved?: boolean;
    status?: string;
    shift?: string;
    profilePhotoUrl?: string;
}

/**
 * Legacy bus data interface (from existing pages)
 */
interface LegacyBusData {
    id: string;
    busId: string;
    busNumber: string;
    routeId?: string;
    routeName?: string;
    assignedDriverId?: string;
    activeDriverId?: string;
    activeTripId?: string;
    status?: string;
    capacity?: number;
    currentMembers?: number;
}

/**
 * Legacy route data interface (from existing pages)
 */
interface LegacyRouteData {
    id: string;
    routeId: string;
    routeName: string;
    totalStops: number;
    stops?: Array<{ name: string; sequence: number; stopId?: string }>;
    active?: boolean;
}

// ============================================
// CONVERSION FUNCTIONS
// ============================================

/**
 * Convert legacy driver data to new DriverDoc format
 */
export function legacyToDriverDoc(legacy: LegacyDriverData): DriverDoc {
    return {
        uid: legacy.id,
        employeeId: legacy.employeeId || legacy.driverId || '',
        fullName: legacy.fullName || legacy.name || 'Unknown',
        assignedBusId: legacy.assignedBusId || legacy.busId || null,
        assignedRouteId: legacy.assignedRouteId || legacy.routeId || null,
        isReserved: legacy.isReserved || legacy.status === 'reserved' || false,
        shift: legacy.shift,
        status: legacy.status,
        profilePhotoUrl: legacy.profilePhotoUrl,
    };
}

/**
 * Convert legacy bus data to new BusDoc format
 */
export function legacyToBusDoc(legacy: LegacyBusData): BusDoc {
    return {
        busId: legacy.busId || legacy.id,
        busNumber: legacy.busNumber || '',
        assignedDriverId: legacy.assignedDriverId || null,
        activeDriverId: legacy.activeDriverId || null,
        routeId: legacy.routeId || null,
        routeName: legacy.routeName,
        activeTripId: legacy.activeTripId || null,
        status: legacy.status,
        capacity: legacy.capacity,
        currentMembers: legacy.currentMembers,
    };
}

/**
 * Convert legacy route data to new RouteDoc format
 */
export function legacyToRouteDoc(legacy: LegacyRouteData): RouteDoc {
    return {
        routeId: legacy.routeId || legacy.id,
        routeName: legacy.routeName || '',
        stops: legacy.stops || [],
        totalStops: legacy.totalStops || legacy.stops?.length || 0,
        active: legacy.active !== false,
    };
}

// ============================================
// STAGING ROW CREATION HELPERS
// ============================================

export interface CreateAssignmentOptions {
    selectedDriver: LegacyDriverData;
    targetBus: LegacyBusData;
    allDrivers: LegacyDriverData[];
    adminUid: string;
    action: 'assign' | 'reserve' | 'swap';
}

/**
 * Create a staging row from legacy data
 */
export function createStagingFromLegacy(options: CreateAssignmentOptions): DriverStagingRow {
    const { selectedDriver, targetBus, allDrivers, adminUid, action } = options;

    // Convert to new format
    const driverDoc = legacyToDriverDoc(selectedDriver);
    const busDoc = legacyToBusDoc(targetBus);

    // Find current operator on the target bus
    const currentDriverId = targetBus.assignedDriverId || targetBus.activeDriverId;
    const currentDriver = currentDriverId
        ? allDrivers.find(d => d.id === currentDriverId)
        : null;
    const currentDriverDoc = currentDriver ? legacyToDriverDoc(currentDriver) : null;

    // Create appropriate staging row based on action
    switch (action) {
        case 'swap':
            if (!currentDriverDoc) {
                throw new Error('Cannot swap: no current driver on target bus');
            }
            return createSwapStagingRow(
                busDoc.busId,
                busDoc.busNumber,
                currentDriverDoc,
                driverDoc,
                adminUid
            );

        case 'reserve':
            if (!currentDriverDoc) {
                // No current driver, just assign
                return createDriverStagingRow(
                    busDoc.busId,
                    busDoc.busNumber,
                    driverDoc,
                    null,
                    adminUid
                );
            }
            return createReserveStagingRow(
                busDoc.busId,
                busDoc.busNumber,
                currentDriverDoc,
                driverDoc,
                adminUid
            );

        case 'assign':
        default:
            return createDriverStagingRow(
                busDoc.busId,
                busDoc.busNumber,
                driverDoc,
                currentDriverDoc,
                adminUid
            );
    }
}

export interface CreateRouteAssignmentOptions {
    targetBus: LegacyBusData;
    newRoute: LegacyRouteData;
    adminUid: string;
}

/**
 * Create a route staging row from legacy data
 */
export function createRouteStagingFromLegacy(options: CreateRouteAssignmentOptions): RouteStagingRow {
    const { targetBus, newRoute, adminUid } = options;

    const busDoc = legacyToBusDoc(targetBus);
    const routeDoc = legacyToRouteDoc(newRoute);

    return createRouteStagingRow(
        busDoc.busId,
        busDoc.busNumber,
        targetBus.routeId || null,
        targetBus.routeName || null,
        routeDoc,
        adminUid
    );
}

// ============================================
// BUS LABEL HELPERS
// ============================================

/**
 * Get standardized bus label from legacy bus data
 */
export function getBusLabelFromLegacy(bus: LegacyBusData): string {
    return formatBusLabel(bus.busId || bus.id, bus.busNumber);
}

/**
 * Format driver display name with employee ID
 */
export function formatDriverDisplay(driver: LegacyDriverData): string {
    const name = driver.fullName || driver.name || 'Unknown';
    const code = driver.employeeId || driver.driverId || driver.id;
    return `${name} (${code})`;
}

// ============================================
// STAGING STATE HELPERS
// ============================================

/**
 * Check if a driver is affected by staging (as new or previous operator)
 */
export function isDriverInStaging(
    driverId: string,
    staging: DriverStagingRow[]
): boolean {
    return staging.some(
        row => row.newOperator.driverUid === driverId ||
            row.previousOperator.driverUid === driverId
    );
}

/**
 * Check if a bus has a staged assignment
 */
export function isBusInStaging(
    busId: string,
    staging: DriverStagingRow[]
): boolean {
    return staging.some(row => row.busId === busId);
}

/**
 * Get the staged assignment for a specific bus
 */
export function getStagingForBus(
    busId: string,
    staging: DriverStagingRow[]
): DriverStagingRow | undefined {
    return staging.find(row => row.busId === busId);
}

/**
 * Get all staging rows that affect a specific driver
 */
export function getStagingForDriver(
    driverId: string,
    staging: DriverStagingRow[]
): DriverStagingRow[] {
    return staging.filter(
        row => row.newOperator.driverUid === driverId ||
            row.previousOperator.driverUid === driverId
    );
}

// ============================================
// MERGED VIEW HELPERS
// ============================================

/**
 * Compute what bus a driver should be shown as assigned to,
 * considering staging changes (simplified version for legacy usage)
 */
export function computeMergedBusForDriver(
    driverId: string,
    drivers: LegacyDriverData[],
    buses: LegacyBusData[],
    staging: DriverStagingRow[]
): { busId: string | null; busLabel: string | null; source: 'staged' | 'live' } {
    // Check if driver is new operator in any staging row
    const asNewOp = staging.find(row => row.newOperator.driverUid === driverId);
    if (asNewOp) {
        return {
            busId: asNewOp.busId,
            busLabel: asNewOp.busLabel,
            source: 'staged'
        };
    }

    // Check if driver is previous operator in a swap
    const asPrevInSwap = staging.find(
        row => row.isSwap && row.previousOperator.driverUid === driverId
    );
    if (asPrevInSwap && asPrevInSwap.newOperator.previousBusId) {
        const otherBus = buses.find(b =>
            b.id === asPrevInSwap.newOperator.previousBusId ||
            b.busId === asPrevInSwap.newOperator.previousBusId
        );
        if (otherBus) {
            return {
                busId: otherBus.busId || otherBus.id,
                busLabel: getBusLabelFromLegacy(otherBus),
                source: 'staged'
            };
        }
    }

    // Check if driver was displaced (becomes reserved)
    const asDisplaced = staging.find(
        row => !row.isSwap && row.previousOperator.driverUid === driverId
    );
    if (asDisplaced) {
        return {
            busId: null,
            busLabel: null,
            source: 'staged'
        };
    }

    // Fallback to live data
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) {
        return { busId: null, busLabel: null, source: 'live' };
    }

    const assignedBusId = driver.assignedBusId || driver.busId;
    if (!assignedBusId) {
        return { busId: null, busLabel: null, source: 'live' };
    }

    const bus = buses.find(b => b.id === assignedBusId || b.busId === assignedBusId);
    if (!bus) {
        return { busId: assignedBusId, busLabel: null, source: 'live' };
    }

    return {
        busId: bus.busId || bus.id,
        busLabel: getBusLabelFromLegacy(bus),
        source: 'live'
    };
}

/**
 * Compute who should be shown as driver of a bus,
 * considering staging changes (simplified version for legacy usage)
 */
export function computeMergedDriverForBus(
    busId: string,
    drivers: LegacyDriverData[],
    buses: LegacyBusData[],
    staging: DriverStagingRow[]
): { driverId: string | null; driverName: string | null; source: 'staged' | 'live' } {
    // Check for staging row for this bus
    const stagingRow = staging.find(row => row.busId === busId);
    if (stagingRow) {
        return {
            driverId: stagingRow.newOperator.driverUid,
            driverName: stagingRow.newOperator.name,
            source: 'staged'
        };
    }

    // Also check if this bus is the "other bus" in a swap
    const swapRow = staging.find(
        row => row.isSwap && row.newOperator.previousBusId === busId
    );
    if (swapRow) {
        return {
            driverId: swapRow.previousOperator.driverUid,
            driverName: swapRow.previousOperator.name,
            source: 'staged'
        };
    }

    // Fallback to live data
    const bus = buses.find(b => b.id === busId || b.busId === busId);
    if (!bus) {
        return { driverId: null, driverName: null, source: 'live' };
    }

    const driverId = bus.assignedDriverId || bus.activeDriverId;
    if (!driverId) {
        return { driverId: null, driverName: null, source: 'live' };
    }

    const driver = drivers.find(d => d.id === driverId);
    return {
        driverId,
        driverName: driver?.fullName || driver?.name || 'Unknown',
        source: 'live'
    };
}

export {
    formatBusLabel,
    generateStagingId,
};
