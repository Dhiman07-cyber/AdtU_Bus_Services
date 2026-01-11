/**
 * Merge Helpers
 * 
 * Functions to compute the merged view of working copy + staging changes.
 * These are used to display the current state in the UI.
 */

import type {
    WorkingCopy,
    DriverStagingRow,
    RouteStagingRow,
    StagingRow,
    DriverDoc,
    BusDoc
} from './stagingModel';

// ============================================
// DRIVER ASSIGNMENT MERGE HELPERS
// ============================================

export interface MergedDriverAssignment {
    driverUid: string | null;
    employeeId: string | null;
    name: string | null;
    isReserved: boolean;
    source: 'live' | 'staged';          // where this info came from
    stagingRowId?: string;              // if staged, which row
}

/**
 * Compute who is assigned to a specific bus, considering staging changes.
 * 
 * Rules:
 * 1. If there's a staging row for this bus with type="driver":
 *    - changeType = 'assign' or 'swap' → display newOperator
 *    - changeType = 'reserve' → display newOperator (the new driver taking over)
 * 2. Else fallback to workingCopy.buses[busId].assignedDriverId
 */
export function computeAssignedDriverForBus(
    busId: string,
    workingCopy: WorkingCopy
): MergedDriverAssignment {
    // Look for staging row for this bus
    const driverStagingRow = workingCopy.staging.find(
        (row): row is DriverStagingRow =>
            row.type === 'driver' && row.busId === busId
    );

    if (driverStagingRow) {
        // Return the new operator from staging
        return {
            driverUid: driverStagingRow.newOperator.driverUid,
            employeeId: driverStagingRow.newOperator.employeeId,
            name: driverStagingRow.newOperator.name,
            isReserved: false,
            source: 'staged',
            stagingRowId: driverStagingRow.id
        };
    }

    // Fallback to live data
    const bus = workingCopy.buses.get(busId);
    if (!bus) {
        return {
            driverUid: null,
            employeeId: null,
            name: null,
            isReserved: true,
            source: 'live'
        };
    }

    const assignedDriverId = bus.assignedDriverId || bus.activeDriverId;
    if (!assignedDriverId) {
        return {
            driverUid: null,
            employeeId: null,
            name: null,
            isReserved: true,
            source: 'live'
        };
    }

    const driver = workingCopy.drivers.get(assignedDriverId);
    if (!driver) {
        return {
            driverUid: assignedDriverId,
            employeeId: null,
            name: 'Unknown',
            isReserved: false,
            source: 'live'
        };
    }

    return {
        driverUid: driver.uid,
        employeeId: driver.employeeId,
        name: driver.fullName,
        isReserved: driver.isReserved || false,
        source: 'live'
    };
}

export interface MergedBusAssignment {
    busId: string | null;
    busLabel: string | null;
    busNumber: string | null;
    source: 'live' | 'staged';
    stagingRowId?: string;
}

/**
 * Compute what bus a driver is currently shown assigned to, considering staging.
 * 
 * Rules:
 * 1. If driver appears as newOperator.driverUid in a staging row → show that bus
 * 2. If driver appears as previousOperator.driverUid in a swap row → show the other bus
 *    (newOperator.previousBusId if they're swapping from there)
 * 3. Else fallback to workingCopy.drivers[driverUid].assignedBusId
 */
export function computeAssignedBusForDriver(
    driverUid: string,
    workingCopy: WorkingCopy
): MergedBusAssignment {
    // Check if driver is the new operator in any staging row
    const asNewOperator = workingCopy.staging.find(
        (row): row is DriverStagingRow =>
            row.type === 'driver' && row.newOperator.driverUid === driverUid
    );

    if (asNewOperator) {
        const bus = workingCopy.buses.get(asNewOperator.busId);
        return {
            busId: asNewOperator.busId,
            busLabel: asNewOperator.busLabel,
            busNumber: bus?.busNumber || null,
            source: 'staged',
            stagingRowId: asNewOperator.id
        };
    }

    // Check if driver is the previous operator in a swap row
    const asPrevOperatorInSwap = workingCopy.staging.find(
        (row): row is DriverStagingRow =>
            row.type === 'driver' &&
            row.changeType === 'swap' &&
            row.previousOperator.driverUid === driverUid
    );

    if (asPrevOperatorInSwap) {
        // The previous operator is being swapped to the new operator's original bus
        const newBusId = asPrevOperatorInSwap.newOperator.previousBusId;
        if (newBusId) {
            const bus = workingCopy.buses.get(newBusId);
            if (bus) {
                // Import formatBusLabel inline to avoid circular deps
                const label = formatBusLabelDirect(newBusId, bus.busNumber);
                return {
                    busId: newBusId,
                    busLabel: label,
                    busNumber: bus.busNumber,
                    source: 'staged',
                    stagingRowId: asPrevOperatorInSwap.id
                };
            }
        }
        // If swapping but new operator had no bus, previous operator becomes reserved
        return {
            busId: null,
            busLabel: null,
            busNumber: null,
            source: 'staged',
            stagingRowId: asPrevOperatorInSwap.id
        };
    }

    // Check if driver's bus was taken by someone else (they become reserved)
    const asPrevOperatorReserved = workingCopy.staging.find(
        (row): row is DriverStagingRow =>
            row.type === 'driver' &&
            (row.changeType === 'assign' || row.changeType === 'reserve') &&
            row.previousOperator.driverUid === driverUid
    );

    if (asPrevOperatorReserved) {
        // This driver's bus was taken, they're now reserved
        return {
            busId: null,
            busLabel: null,
            busNumber: null,
            source: 'staged',
            stagingRowId: asPrevOperatorReserved.id
        };
    }

    // Fallback to live data
    const driver = workingCopy.drivers.get(driverUid);
    if (!driver || !driver.assignedBusId) {
        return {
            busId: null,
            busLabel: null,
            busNumber: null,
            source: 'live'
        };
    }

    const bus = workingCopy.buses.get(driver.assignedBusId);
    if (!bus) {
        return {
            busId: driver.assignedBusId,
            busLabel: null,
            busNumber: null,
            source: 'live'
        };
    }

    return {
        busId: bus.busId,
        busLabel: formatBusLabelDirect(bus.busId, bus.busNumber),
        busNumber: bus.busNumber,
        source: 'live'
    };
}

/**
 * Check if a driver is currently shown as reserved (considering staging)
 */
export function isDriverReservedMerged(
    driverUid: string,
    workingCopy: WorkingCopy
): boolean {
    const busAssignment = computeAssignedBusForDriver(driverUid, workingCopy);
    return busAssignment.busId === null;
}

// ============================================
// ROUTE ASSIGNMENT MERGE HELPERS
// ============================================

export interface MergedRouteAssignment {
    routeId: string | null;
    routeName: string | null;
    stopCount: number;
    source: 'live' | 'staged';
    stagingRowId?: string;
}

/**
 * Compute what route a bus is currently assigned to, considering staging.
 */
export function computeAssignedRouteForBus(
    busId: string,
    workingCopy: WorkingCopy
): MergedRouteAssignment {
    // Look for route staging row for this bus
    const routeStagingRow = workingCopy.staging.find(
        (row): row is RouteStagingRow =>
            row.type === 'route' && row.busId === busId
    );

    if (routeStagingRow) {
        return {
            routeId: routeStagingRow.newRouteId,
            routeName: routeStagingRow.newRouteName,
            stopCount: routeStagingRow.newRouteStopsCount,
            source: 'staged',
            stagingRowId: routeStagingRow.id
        };
    }

    // Fallback to live data
    const bus = workingCopy.buses.get(busId);
    if (!bus || !bus.routeId) {
        return {
            routeId: null,
            routeName: null,
            stopCount: 0,
            source: 'live'
        };
    }

    const route = workingCopy.routes.get(bus.routeId);
    if (!route) {
        return {
            routeId: bus.routeId,
            routeName: bus.routeName || 'Unknown',
            stopCount: 0,
            source: 'live'
        };
    }

    return {
        routeId: route.routeId,
        routeName: route.routeName,
        stopCount: route.totalStops || route.stops?.length || 0,
        source: 'live'
    };
}

// ============================================
// STAGING MUTATION HELPERS
// ============================================

/**
 * Apply a staging row to the working copy (mutates in place)
 * This updates the in-memory state to reflect what UI should show
 */
export function applyStagingRowToWorkingCopy(
    row: StagingRow,
    workingCopy: WorkingCopy
): void {
    if (row.type === 'driver') {
        applyDriverStagingRow(row, workingCopy);
    } else if (row.type === 'route') {
        applyRouteStagingRow(row, workingCopy);
    }
}

function applyDriverStagingRow(
    row: DriverStagingRow,
    workingCopy: WorkingCopy
): void {
    const bus = workingCopy.buses.get(row.busId);
    if (!bus) return;

    // Update the bus to point to new driver
    if (row.newOperator.driverUid) {
        bus.assignedDriverId = row.newOperator.driverUid;
        bus.activeDriverId = row.newOperator.driverUid;

        // Update the new driver to point to this bus
        const newDriver = workingCopy.drivers.get(row.newOperator.driverUid);
        if (newDriver) {
            newDriver.assignedBusId = row.busId;
            newDriver.isReserved = false;
        }
    }

    // Handle previous operator
    if (row.previousOperator.driverUid) {
        const prevDriver = workingCopy.drivers.get(row.previousOperator.driverUid);
        if (prevDriver) {
            if (row.changeType === 'swap' && row.newOperator.previousBusId) {
                // Swap: previous operator goes to new operator's old bus
                prevDriver.assignedBusId = row.newOperator.previousBusId;
                prevDriver.isReserved = false;

                // Update that bus too
                const otherBus = workingCopy.buses.get(row.newOperator.previousBusId);
                if (otherBus) {
                    otherBus.assignedDriverId = row.previousOperator.driverUid;
                    otherBus.activeDriverId = row.previousOperator.driverUid;
                }
            } else {
                // Reserve/Assign: previous operator becomes reserved
                prevDriver.assignedBusId = null;
                prevDriver.isReserved = true;
            }
        }
    }

    // Clear old bus assignment for new driver if they came from another bus
    if (row.newOperator.previousBusId && row.newOperator.previousBusId !== row.busId) {
        const oldBus = workingCopy.buses.get(row.newOperator.previousBusId);
        if (oldBus && row.changeType !== 'swap') {
            // Only clear if not a swap (swap handles this above)
            if (oldBus.assignedDriverId === row.newOperator.driverUid) {
                oldBus.assignedDriverId = null;
                oldBus.activeDriverId = null;
            }
        }
    }
}

function applyRouteStagingRow(
    row: RouteStagingRow,
    workingCopy: WorkingCopy
): void {
    const bus = workingCopy.buses.get(row.busId);
    if (!bus) return;

    bus.routeId = row.newRouteId;
    bus.routeName = row.newRouteName;
}

/**
 * Remove a staging row and revert working copy changes
 */
export function removeStagingRowFromWorkingCopy(
    rowId: string,
    workingCopy: WorkingCopy
): void {
    const idx = workingCopy.staging.findIndex(r => r.id === rowId);
    if (idx === -1) return;

    const row = workingCopy.staging[idx];

    // Remove from staging
    workingCopy.staging.splice(idx, 1);

    // Revert changes by restoring from original
    if (row.type === 'driver') {
        // Restore the bus from original
        const originalBus = workingCopy.originalBuses.get(row.busId);
        if (originalBus) {
            const bus = workingCopy.buses.get(row.busId);
            if (bus) {
                bus.assignedDriverId = originalBus.assignedDriverId;
                bus.activeDriverId = originalBus.activeDriverId;
            }
        }

        // Restore drivers involved
        if (row.newOperator.driverUid) {
            const originalDriver = workingCopy.originalDrivers.get(row.newOperator.driverUid);
            const driver = workingCopy.drivers.get(row.newOperator.driverUid);
            if (originalDriver && driver) {
                driver.assignedBusId = originalDriver.assignedBusId;
                driver.isReserved = originalDriver.isReserved;
            }
        }

        if (row.previousOperator.driverUid) {
            const originalDriver = workingCopy.originalDrivers.get(row.previousOperator.driverUid);
            const driver = workingCopy.drivers.get(row.previousOperator.driverUid);
            if (originalDriver && driver) {
                driver.assignedBusId = originalDriver.assignedBusId;
                driver.isReserved = originalDriver.isReserved;
            }
        }

        // Restore new operator's previous bus if applicable
        if (row.newOperator.previousBusId) {
            const originalBus = workingCopy.originalBuses.get(row.newOperator.previousBusId);
            const bus = workingCopy.buses.get(row.newOperator.previousBusId);
            if (originalBus && bus) {
                bus.assignedDriverId = originalBus.assignedDriverId;
                bus.activeDriverId = originalBus.activeDriverId;
            }
        }
    } else if (row.type === 'route') {
        // Restore the bus route from original
        const originalBus = workingCopy.originalBuses.get(row.busId);
        if (originalBus) {
            const bus = workingCopy.buses.get(row.busId);
            if (bus) {
                bus.routeId = originalBus.routeId;
                bus.routeName = originalBus.routeName;
            }
        }
    }
}

/**
 * Clear all staging and restore to original state
 */
export function clearAllStaging(workingCopy: WorkingCopy): void {
    workingCopy.staging = [];

    // Restore all buses to original
    for (const [busId, originalBus] of workingCopy.originalBuses) {
        const bus = workingCopy.buses.get(busId);
        if (bus) {
            bus.assignedDriverId = originalBus.assignedDriverId;
            bus.activeDriverId = originalBus.activeDriverId;
            bus.routeId = originalBus.routeId;
            bus.routeName = originalBus.routeName;
        }
    }

    // Restore all drivers to original
    for (const [driverUid, originalDriver] of workingCopy.originalDrivers) {
        const driver = workingCopy.drivers.get(driverUid);
        if (driver) {
            driver.assignedBusId = originalDriver.assignedBusId;
            driver.isReserved = originalDriver.isReserved;
        }
    }
}

// ============================================
// UTILITY HELPERS
// ============================================

/**
 * Direct bus label formatter (avoids circular import)
 */
function formatBusLabelDirect(busId: string, busNumber: string): string {
    const match = busId.match(/^bus_(\d+)$/i);
    if (match) {
        return `Bus-${parseInt(match[1], 10)} (${busNumber})`;
    }
    return `${busNumber} (${busId})`;
}

/**
 * Get all drivers affected by current staging
 */
export function getAffectedDrivers(workingCopy: WorkingCopy): Set<string> {
    const affected = new Set<string>();

    for (const row of workingCopy.staging) {
        if (row.type === 'driver') {
            if (row.newOperator.driverUid) {
                affected.add(row.newOperator.driverUid);
            }
            if (row.previousOperator.driverUid) {
                affected.add(row.previousOperator.driverUid);
            }
        }
    }

    return affected;
}

/**
 * Get all buses affected by current staging
 */
export function getAffectedBuses(workingCopy: WorkingCopy): Set<string> {
    const affected = new Set<string>();

    for (const row of workingCopy.staging) {
        affected.add(row.busId);
        if (row.type === 'driver' && row.newOperator.previousBusId) {
            affected.add(row.newOperator.previousBusId);
        }
    }

    return affected;
}
