/**
 * Staging Model Types & Helpers
 * 
 * Defines the canonical data structures for staging driver and route assignments.
 * All staging rows are bus-centered operations.
 */

// ============================================
// DRIVER DATA TYPES
// ============================================

export interface DriverDoc {
    uid: string;           // doc id
    employeeId: string;    // e.g., "DB-01"
    fullName: string;
    assignedBusId: string | null;
    assignedRouteId: string | null;
    isReserved: boolean;
    shift?: string;
    status?: string;
    profilePhotoUrl?: string;
    updatedAt?: any;
    updatedBy?: string;
}

export interface BusDoc {
    busId: string;            // doc id
    busNumber: string;        // AS-01-PC-9094
    assignedDriverId: string | null;
    activeDriverId: string | null;
    routeId: string | null;
    routeName?: string;
    activeTripId: string | null;
    status?: string;
    capacity?: number;
    currentMembers?: number;
    updatedAt?: any;
    updatedBy?: string;
}

export interface RouteDoc {
    routeId: string;          // doc id
    routeName: string;
    stops: Array<{ name: string; stopId?: string; sequence: number }>;
    totalStops: number;
    active: boolean;
    updatedAt?: any;
}

// ============================================
// WORKING COPY STRUCTURE
// ============================================

export interface WorkingCopy {
    drivers: Map<string, DriverDoc>;
    buses: Map<string, BusDoc>;
    routes: Map<string, RouteDoc>;
    staging: StagingRow[];
    // Keep original snapshot for rollback
    originalDrivers: Map<string, DriverDoc>;
    originalBuses: Map<string, BusDoc>;
}

// ============================================
// STAGING ROW TYPES
// ============================================

export type ChangeType = "assign" | "reserve" | "swap" | "routeChange";

export interface OperatorInfo {
    driverUid: string | null;
    employeeId: string | null;
    name: string | null;
}

export interface NewOperatorInfo extends OperatorInfo {
    previousBusId: string | null;  // where newOperator came from (nullable)
}

/**
 * Canonical staging row - bus-centered operation for driver assignments
 */
export interface DriverStagingRow {
    id: string;                     // uuid client-side
    type: "driver";
    busId: string;                  // target bus doc id
    busLabel: string;               // "Bus-1 (AS-01-PC-9094)"
    previousOperator: OperatorInfo; // snapshot from workingCopy BEFORE staging
    changeType: "assign" | "reserve" | "swap";
    newOperator: NewOperatorInfo;
    isSwap: boolean;                // true if previousOperator && newOperator && different drivers
    createdAt: number;
    createdBy: string;
}

/**
 * Canonical staging row - bus-centered operation for route assignments
 */
export interface RouteStagingRow {
    id: string;                     // uuid client-side
    type: "route";
    busId: string;                  // target bus doc id
    busLabel: string;               // "Bus-1 (AS-01-PC-9094)"
    previousRouteId: string | null;
    previousRouteName: string | null;
    newRouteId: string;
    newRouteName: string;
    newRouteStopsCount: number;
    changeType: "routeChange";
    createdAt: number;
    createdBy: string;
}

export type StagingRow = DriverStagingRow | RouteStagingRow;

// ============================================
// BUS LABEL HELPER
// ============================================

/**
 * Generate bus label in format "Bus-N (busNumber)"
 * e.g., for busId "bus_1" and busNumber "AS-01-PC-9094" -> "Bus-1 (AS-01-PC-9094)"
 */
export function formatBusLabel(busId: string, busNumber: string): string {
    const match = busId.match(/^bus_(\d+)$/i);
    if (match) {
        return `Bus-${parseInt(match[1], 10)} (${busNumber})`;
    }
    // Fallback for non-standard bus IDs
    return `${busNumber} (${busId})`;
}

/**
 * Extract numeric suffix from busId for display
 */
export function getBusNumericId(busId: string): number {
    const match = busId.match(/^bus_(\d+)$/i);
    if (match) {
        return parseInt(match[1], 10);
    }
    // Try to extract any number
    const numMatch = busId.match(/(\d+)/);
    return numMatch ? parseInt(numMatch[1], 10) : 0;
}

// ============================================
// UUID GENERATOR
// ============================================

export function generateStagingId(): string {
    return `staged_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// STAGING ROW CREATORS
// ============================================

/**
 * Create a driver assignment staging row
 */
export function createDriverStagingRow(
    busId: string,
    busNumber: string,
    selectedDriver: DriverDoc,
    previousOperator: DriverDoc | null,
    adminUid: string
): DriverStagingRow {
    const isSwap = !!previousOperator &&
        previousOperator.uid !== selectedDriver.uid &&
        !!selectedDriver.assignedBusId;

    return {
        id: generateStagingId(),
        type: "driver",
        busId,
        busLabel: formatBusLabel(busId, busNumber),
        previousOperator: previousOperator ? {
            driverUid: previousOperator.uid,
            employeeId: previousOperator.employeeId,
            name: previousOperator.fullName
        } : {
            driverUid: null,
            employeeId: null,
            name: null
        },
        changeType: isSwap ? "swap" : "assign",
        newOperator: {
            driverUid: selectedDriver.uid,
            employeeId: selectedDriver.employeeId,
            name: selectedDriver.fullName,
            previousBusId: selectedDriver.assignedBusId
        },
        isSwap,
        createdAt: Date.now(),
        createdBy: adminUid
    };
}

/**
 * Create a reserve staging row (move current operator to reserved)
 */
export function createReserveStagingRow(
    busId: string,
    busNumber: string,
    currentOperator: DriverDoc,
    newDriver: DriverDoc,
    adminUid: string
): DriverStagingRow {
    return {
        id: generateStagingId(),
        type: "driver",
        busId,
        busLabel: formatBusLabel(busId, busNumber),
        previousOperator: {
            driverUid: currentOperator.uid,
            employeeId: currentOperator.employeeId,
            name: currentOperator.fullName
        },
        changeType: "reserve",
        newOperator: {
            driverUid: newDriver.uid,
            employeeId: newDriver.employeeId,
            name: newDriver.fullName,
            previousBusId: newDriver.assignedBusId
        },
        isSwap: false,
        createdAt: Date.now(),
        createdBy: adminUid
    };
}

/**
 * Create a swap staging row (swap two drivers between buses)
 */
export function createSwapStagingRow(
    targetBusId: string,
    targetBusNumber: string,
    currentOperator: DriverDoc,
    newDriver: DriverDoc,
    adminUid: string
): DriverStagingRow {
    return {
        id: generateStagingId(),
        type: "driver",
        busId: targetBusId,
        busLabel: formatBusLabel(targetBusId, targetBusNumber),
        previousOperator: {
            driverUid: currentOperator.uid,
            employeeId: currentOperator.employeeId,
            name: currentOperator.fullName
        },
        changeType: "swap",
        newOperator: {
            driverUid: newDriver.uid,
            employeeId: newDriver.employeeId,
            name: newDriver.fullName,
            previousBusId: newDriver.assignedBusId
        },
        isSwap: true,
        createdAt: Date.now(),
        createdBy: adminUid
    };
}

/**
 * Create a route assignment staging row
 */
export function createRouteStagingRow(
    busId: string,
    busNumber: string,
    previousRouteId: string | null,
    previousRouteName: string | null,
    newRoute: RouteDoc,
    adminUid: string
): RouteStagingRow {
    return {
        id: generateStagingId(),
        type: "route",
        busId,
        busLabel: formatBusLabel(busId, busNumber),
        previousRouteId,
        previousRouteName,
        newRouteId: newRoute.routeId,
        newRouteName: newRoute.routeName,
        newRouteStopsCount: newRoute.totalStops || newRoute.stops?.length || 0,
        changeType: "routeChange",
        createdAt: Date.now(),
        createdBy: adminUid
    };
}

// ============================================
// WORKING COPY INITIALIZERS
// ============================================

/**
 * Initialize an empty working copy
 */
export function createEmptyWorkingCopy(): WorkingCopy {
    return {
        drivers: new Map(),
        buses: new Map(),
        routes: new Map(),
        staging: [],
        originalDrivers: new Map(),
        originalBuses: new Map()
    };
}

/**
 * Deep clone a driver doc
 */
export function cloneDriver(driver: DriverDoc): DriverDoc {
    return { ...driver };
}

/**
 * Deep clone a bus doc
 */
export function cloneBus(bus: BusDoc): BusDoc {
    return { ...bus };
}

/**
 * Deep clone a route doc
 */
export function cloneRoute(route: RouteDoc): RouteDoc {
    return {
        ...route,
        stops: route.stops ? [...route.stops] : []
    };
}

// ============================================
// STAGING VALIDATION
// ============================================

export interface ValidationError {
    rowId: string;
    message: string;
    field?: string;
}

/**
 * Validate a staging row against current state
 */
export function validateStagingRow(
    row: StagingRow,
    workingCopy: WorkingCopy
): ValidationError | null {
    // Check bus exists
    if (!workingCopy.buses.has(row.busId)) {
        return { rowId: row.id, message: `Bus ${row.busId} not found`, field: 'busId' };
    }

    const bus = workingCopy.buses.get(row.busId)!;

    // Check for active trip
    if (bus.activeTripId) {
        return {
            rowId: row.id,
            message: `Bus ${row.busLabel} has an active trip. Cannot modify.`,
            field: 'activeTripId'
        };
    }

    if (row.type === "driver") {
        // Validate driver staging row
        if (row.newOperator.driverUid && !workingCopy.drivers.has(row.newOperator.driverUid)) {
            return {
                rowId: row.id,
                message: `Driver ${row.newOperator.name} not found`,
                field: 'newOperator'
            };
        }

        if (row.previousOperator.driverUid && !workingCopy.drivers.has(row.previousOperator.driverUid)) {
            return {
                rowId: row.id,
                message: `Previous operator ${row.previousOperator.name} not found`,
                field: 'previousOperator'
            };
        }
    }

    if (row.type === "route") {
        // Validate route staging row
        if (!workingCopy.routes.has(row.newRouteId)) {
            return {
                rowId: row.id,
                message: `Route ${row.newRouteName} not found`,
                field: 'newRouteId'
            };
        }

        const route = workingCopy.routes.get(row.newRouteId)!;
        if (!route.active) {
            return {
                rowId: row.id,
                message: `Route ${row.newRouteName} is not active`,
                field: 'newRouteId'
            };
        }
    }

    return null;
}
