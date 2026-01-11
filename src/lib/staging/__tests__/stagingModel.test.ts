/**
 * Staging Model Tests
 * 
 * Unit tests for the staging model and merge helpers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    formatBusLabel,
    getBusNumericId,
    generateStagingId,
    createDriverStagingRow,
    createReserveStagingRow,
    createSwapStagingRow,
    createRouteStagingRow,
    createEmptyWorkingCopy,
    validateStagingRow,
    type DriverDoc,
    type BusDoc,
    type RouteDoc,
    type WorkingCopy,
} from '../stagingModel';

import {
    computeAssignedDriverForBus,
    computeAssignedBusForDriver,
    computeAssignedRouteForBus,
    applyStagingRowToWorkingCopy,
    removeStagingRowFromWorkingCopy,
    clearAllStaging,
} from '../mergeHelpers';

// ============================================
// TEST DATA FIXTURES
// ============================================

const createMockDriver = (id: string, busId: string | null = null): DriverDoc => ({
    uid: id,
    employeeId: `DB-${id.replace('driver_', '').padStart(2, '0')}`,
    fullName: `Driver ${id}`,
    assignedBusId: busId,
    assignedRouteId: null,
    isReserved: busId === null,
    shift: 'morning',
    status: 'active',
});

const createMockBus = (id: string, driverId: string | null = null): BusDoc => ({
    busId: id,
    busNumber: `AS-${id.replace('bus_', '').padStart(2, '0')}-PC-0000`,
    assignedDriverId: driverId,
    activeDriverId: driverId,
    routeId: 'route_1',
    routeName: 'Test Route',
    activeTripId: null,
    status: 'active',
});

const createMockRoute = (id: string): RouteDoc => ({
    routeId: id,
    routeName: `Route ${id}`,
    stops: [
        { name: 'Stop 1', stopId: 'stop_1', sequence: 1 },
        { name: 'Stop 2', stopId: 'stop_2', sequence: 2 },
    ],
    totalStops: 2,
    active: true,
});

const createTestWorkingCopy = (): WorkingCopy => {
    const wc = createEmptyWorkingCopy();

    // Add drivers
    const driver1 = createMockDriver('driver_1', 'bus_1');
    const driver2 = createMockDriver('driver_2', 'bus_2');
    const driver3 = createMockDriver('driver_3', null); // Reserved

    wc.drivers.set('driver_1', driver1);
    wc.drivers.set('driver_2', driver2);
    wc.drivers.set('driver_3', driver3);
    wc.originalDrivers.set('driver_1', { ...driver1 });
    wc.originalDrivers.set('driver_2', { ...driver2 });
    wc.originalDrivers.set('driver_3', { ...driver3 });

    // Add buses
    const bus1 = createMockBus('bus_1', 'driver_1');
    const bus2 = createMockBus('bus_2', 'driver_2');
    const bus3 = createMockBus('bus_3', null); // No driver

    wc.buses.set('bus_1', bus1);
    wc.buses.set('bus_2', bus2);
    wc.buses.set('bus_3', bus3);
    wc.originalBuses.set('bus_1', { ...bus1 });
    wc.originalBuses.set('bus_2', { ...bus2 });
    wc.originalBuses.set('bus_3', { ...bus3 });

    // Add routes
    const route1 = createMockRoute('route_1');
    const route2 = createMockRoute('route_2');

    wc.routes.set('route_1', route1);
    wc.routes.set('route_2', route2);

    return wc;
};

// ============================================
// BUS LABEL TESTS
// ============================================

describe('formatBusLabel', () => {
    it('should format standard bus ID correctly', () => {
        expect(formatBusLabel('bus_1', 'AS-01-PC-9094')).toBe('Bus-1 (AS-01-PC-9094)');
        expect(formatBusLabel('bus_10', 'AS-10-PC-1234')).toBe('Bus-10 (AS-10-PC-1234)');
    });

    it('should handle non-standard bus IDs', () => {
        expect(formatBusLabel('custom_bus', 'XY-123')).toBe('XY-123 (custom_bus)');
    });
});

describe('getBusNumericId', () => {
    it('should extract numeric ID from standard format', () => {
        expect(getBusNumericId('bus_1')).toBe(1);
        expect(getBusNumericId('bus_10')).toBe(10);
    });

    it('should handle non-standard formats', () => {
        expect(getBusNumericId('custom_123')).toBe(123);
        expect(getBusNumericId('noNumber')).toBe(0);
    });
});

// ============================================
// STAGING ID GENERATION
// ============================================

describe('generateStagingId', () => {
    it('should generate unique IDs', () => {
        const id1 = generateStagingId();
        const id2 = generateStagingId();
        expect(id1).not.toBe(id2);
    });

    it('should start with "staged_" prefix', () => {
        const id = generateStagingId();
        expect(id.startsWith('staged_')).toBe(true);
    });
});

// ============================================
// STAGING ROW CREATION TESTS
// ============================================

describe('createDriverStagingRow', () => {
    it('should create assign row for reserved driver to empty bus', () => {
        const driver = createMockDriver('driver_3', null);
        const row = createDriverStagingRow('bus_3', 'AS-03-PC-0000', driver, null, 'admin_1');

        expect(row.type).toBe('driver');
        expect(row.busId).toBe('bus_3');
        expect(row.changeType).toBe('assign');
        expect(row.isSwap).toBe(false);
        expect(row.newOperator.driverUid).toBe('driver_3');
        expect(row.previousOperator.driverUid).toBeNull();
    });

    it('should create assign row when displacing existing driver', () => {
        const newDriver = createMockDriver('driver_3', null);
        const prevDriver = createMockDriver('driver_1', 'bus_1');
        const row = createDriverStagingRow('bus_1', 'AS-01-PC-0000', newDriver, prevDriver, 'admin_1');

        expect(row.changeType).toBe('assign');
        expect(row.isSwap).toBe(false);
        expect(row.previousOperator.driverUid).toBe('driver_1');
    });
});

describe('createSwapStagingRow', () => {
    it('should create swap row correctly', () => {
        const currentOperator = createMockDriver('driver_1', 'bus_1');
        const newDriver = createMockDriver('driver_2', 'bus_2');
        const row = createSwapStagingRow('bus_1', 'AS-01-PC-0000', currentOperator, newDriver, 'admin_1');

        expect(row.changeType).toBe('swap');
        expect(row.isSwap).toBe(true);
        expect(row.previousOperator.driverUid).toBe('driver_1');
        expect(row.newOperator.driverUid).toBe('driver_2');
        expect(row.newOperator.previousBusId).toBe('bus_2');
    });
});

describe('createRouteStagingRow', () => {
    it('should create route change row correctly', () => {
        const newRoute = createMockRoute('route_2');
        const row = createRouteStagingRow('bus_1', 'AS-01-PC-0000', 'route_1', 'Route 1', newRoute, 'admin_1');

        expect(row.type).toBe('route');
        expect(row.changeType).toBe('routeChange');
        expect(row.previousRouteId).toBe('route_1');
        expect(row.previousRouteName).toBe('Route 1');
        expect(row.newRouteId).toBe('route_2');
        expect(row.newRouteName).toBe('Route route_2');
    });
});

// ============================================
// MERGE HELPER TESTS
// ============================================

describe('computeAssignedDriverForBus', () => {
    let wc: WorkingCopy;

    beforeEach(() => {
        wc = createTestWorkingCopy();
    });

    it('should return live driver when no staging', () => {
        const result = computeAssignedDriverForBus('bus_1', wc);
        expect(result.driverUid).toBe('driver_1');
        expect(result.source).toBe('live');
    });

    it('should return staged driver when staging exists', () => {
        const newDriver = wc.drivers.get('driver_3')!;
        const stagingRow = createDriverStagingRow('bus_1', 'AS-01-PC-0000', newDriver, wc.drivers.get('driver_1')!, 'admin_1');
        wc.staging.push(stagingRow);

        const result = computeAssignedDriverForBus('bus_1', wc);
        expect(result.driverUid).toBe('driver_3');
        expect(result.source).toBe('staged');
    });

    it('should return null for empty bus with no staging', () => {
        const result = computeAssignedDriverForBus('bus_3', wc);
        expect(result.driverUid).toBeNull();
        expect(result.isReserved).toBe(true);
    });
});

describe('computeAssignedBusForDriver', () => {
    let wc: WorkingCopy;

    beforeEach(() => {
        wc = createTestWorkingCopy();
    });

    it('should return live bus when no staging', () => {
        const result = computeAssignedBusForDriver('driver_1', wc);
        expect(result.busId).toBe('bus_1');
        expect(result.source).toBe('live');
    });

    it('should return new bus when driver is staged as new operator', () => {
        const driver = wc.drivers.get('driver_3')!;
        const stagingRow = createDriverStagingRow('bus_3', 'AS-03-PC-0000', driver, null, 'admin_1');
        wc.staging.push(stagingRow);

        const result = computeAssignedBusForDriver('driver_3', wc);
        expect(result.busId).toBe('bus_3');
        expect(result.source).toBe('staged');
    });

    it('should return null for displaced driver', () => {
        const newDriver = wc.drivers.get('driver_3')!;
        const currentDriver = wc.drivers.get('driver_1')!;
        const stagingRow = createDriverStagingRow('bus_1', 'AS-01-PC-0000', newDriver, currentDriver, 'admin_1');
        wc.staging.push(stagingRow);

        const result = computeAssignedBusForDriver('driver_1', wc);
        expect(result.busId).toBeNull();
        expect(result.source).toBe('staged');
    });

    it('should return other bus for swapped driver', () => {
        const driver1 = wc.drivers.get('driver_1')!;
        const driver2 = wc.drivers.get('driver_2')!;
        const stagingRow = createSwapStagingRow('bus_1', 'AS-01-PC-0000', driver1, driver2, 'admin_1');
        wc.staging.push(stagingRow);

        const result = computeAssignedBusForDriver('driver_1', wc);
        expect(result.busId).toBe('bus_2');
        expect(result.source).toBe('staged');
    });
});

describe('computeAssignedRouteForBus', () => {
    let wc: WorkingCopy;

    beforeEach(() => {
        wc = createTestWorkingCopy();
    });

    it('should return live route when no staging', () => {
        const result = computeAssignedRouteForBus('bus_1', wc);
        expect(result.routeId).toBe('route_1');
        expect(result.source).toBe('live');
    });

    it('should return staged route when staging exists', () => {
        const newRoute = wc.routes.get('route_2')!;
        const stagingRow = createRouteStagingRow('bus_1', 'AS-01-PC-0000', 'route_1', 'Route 1', newRoute, 'admin_1');
        wc.staging.push(stagingRow);

        const result = computeAssignedRouteForBus('bus_1', wc);
        expect(result.routeId).toBe('route_2');
        expect(result.source).toBe('staged');
    });
});

// ============================================
// STAGING MUTATION TESTS
// ============================================

describe('applyStagingRowToWorkingCopy', () => {
    let wc: WorkingCopy;

    beforeEach(() => {
        wc = createTestWorkingCopy();
    });

    it('should update working copy for assign operation', () => {
        const newDriver = wc.drivers.get('driver_3')!;
        const stagingRow = createDriverStagingRow('bus_3', 'AS-03-PC-0000', newDriver, null, 'admin_1');

        applyStagingRowToWorkingCopy(stagingRow, wc);

        expect(wc.buses.get('bus_3')?.assignedDriverId).toBe('driver_3');
        expect(wc.drivers.get('driver_3')?.assignedBusId).toBe('bus_3');
        expect(wc.drivers.get('driver_3')?.isReserved).toBe(false);
    });

    it('should set displaced driver to reserved', () => {
        const newDriver = wc.drivers.get('driver_3')!;
        const currentDriver = wc.drivers.get('driver_1')!;
        const stagingRow = createDriverStagingRow('bus_1', 'AS-01-PC-0000', newDriver, currentDriver, 'admin_1');

        applyStagingRowToWorkingCopy(stagingRow, wc);

        expect(wc.drivers.get('driver_1')?.assignedBusId).toBeNull();
        expect(wc.drivers.get('driver_1')?.isReserved).toBe(true);
    });

    it('should swap drivers correctly', () => {
        const driver1 = wc.drivers.get('driver_1')!;
        const driver2 = wc.drivers.get('driver_2')!;
        const stagingRow = createSwapStagingRow('bus_1', 'AS-01-PC-0000', driver1, driver2, 'admin_1');

        applyStagingRowToWorkingCopy(stagingRow, wc);

        expect(wc.buses.get('bus_1')?.assignedDriverId).toBe('driver_2');
        expect(wc.buses.get('bus_2')?.assignedDriverId).toBe('driver_1');
        expect(wc.drivers.get('driver_1')?.assignedBusId).toBe('bus_2');
        expect(wc.drivers.get('driver_2')?.assignedBusId).toBe('bus_1');
    });
});

describe('clearAllStaging', () => {
    let wc: WorkingCopy;

    beforeEach(() => {
        wc = createTestWorkingCopy();
    });

    it('should restore all to original state', () => {
        // Apply some staging
        const newDriver = wc.drivers.get('driver_3')!;
        const currentDriver = wc.drivers.get('driver_1')!;
        const stagingRow = createDriverStagingRow('bus_1', 'AS-01-PC-0000', newDriver, currentDriver, 'admin_1');
        wc.staging.push(stagingRow);
        applyStagingRowToWorkingCopy(stagingRow, wc);

        // Clear staging
        clearAllStaging(wc);

        expect(wc.staging.length).toBe(0);
        expect(wc.buses.get('bus_1')?.assignedDriverId).toBe('driver_1');
        expect(wc.drivers.get('driver_1')?.assignedBusId).toBe('bus_1');
        expect(wc.drivers.get('driver_1')?.isReserved).toBe(false);
        expect(wc.drivers.get('driver_3')?.assignedBusId).toBeNull();
    });
});

// ============================================
// VALIDATION TESTS
// ============================================

describe('validateStagingRow', () => {
    let wc: WorkingCopy;

    beforeEach(() => {
        wc = createTestWorkingCopy();
    });

    it('should pass validation for valid row', () => {
        const driver = wc.drivers.get('driver_3')!;
        const row = createDriverStagingRow('bus_3', 'AS-03-PC-0000', driver, null, 'admin_1');

        const error = validateStagingRow(row, wc);
        expect(error).toBeNull();
    });

    it('should fail validation for non-existent bus', () => {
        const driver = wc.drivers.get('driver_3')!;
        const row = createDriverStagingRow('bus_999', 'AS-99-PC-0000', driver, null, 'admin_1');

        const error = validateStagingRow(row, wc);
        expect(error).not.toBeNull();
        expect(error?.message).toContain('not found');
    });

    it('should fail validation for bus with active trip', () => {
        // Set active trip on bus
        wc.buses.get('bus_1')!.activeTripId = 'trip_123';

        const driver = wc.drivers.get('driver_3')!;
        const row = createDriverStagingRow('bus_1', 'AS-01-PC-0000', driver, null, 'admin_1');

        const error = validateStagingRow(row, wc);
        expect(error).not.toBeNull();
        expect(error?.message).toContain('active trip');
    });
});
