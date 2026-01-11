/**
 * useWorkingCopy Hook
 * 
 * Custom hook to manage the working copy state for assignment pages.
 * Loads data from Firestore, maintains staging, and provides merge helpers.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { collection, DocumentData } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import {
    WorkingCopy,
    DriverDoc,
    BusDoc,
    RouteDoc,
    StagingRow,
    DriverStagingRow,
    RouteStagingRow,
    createEmptyWorkingCopy,
    cloneDriver,
    cloneBus,
    cloneRoute,
    validateStagingRow,
    ValidationError,
    formatBusLabel,
} from '@/lib/staging';
import {
    computeAssignedDriverForBus,
    computeAssignedBusForDriver,
    computeAssignedRouteForBus,
    applyStagingRowToWorkingCopy,
    removeStagingRowFromWorkingCopy,
    clearAllStaging as clearStagingHelper,
    getAffectedDrivers,
    getAffectedBuses,
    MergedDriverAssignment,
    MergedBusAssignment,
    MergedRouteAssignment,
} from '@/lib/staging/mergeHelpers';

export interface UseWorkingCopyOptions {
    autoSubscribe?: boolean;
}

export interface UseWorkingCopyReturn {
    // State
    workingCopy: WorkingCopy;
    loading: boolean;
    error: Error | null;

    // Data arrays (for iteration in UI)
    drivers: DriverDoc[];
    buses: BusDoc[];
    routes: RouteDoc[];
    staging: StagingRow[];

    // Merged view helpers
    getAssignedDriverForBus: (busId: string) => MergedDriverAssignment;
    getAssignedBusForDriver: (driverUid: string) => MergedBusAssignment;
    getAssignedRouteForBus: (busId: string) => MergedRouteAssignment;

    // Lookup helpers
    getDriverById: (driverUid: string) => DriverDoc | undefined;
    getBusById: (busId: string) => BusDoc | undefined;
    getRouteById: (routeId: string) => RouteDoc | undefined;
    getBusLabel: (busId: string) => string;

    // Staging operations
    addStagingRow: (row: StagingRow) => ValidationError | null;
    removeStagingRow: (rowId: string) => void;
    clearAllStaging: () => void;

    // Get staging for specific entity
    getStagingForBus: (busId: string) => StagingRow | undefined;
    getStagingForDriver: (driverUid: string) => DriverStagingRow | undefined;

    // Affected entities
    affectedDrivers: Set<string>;
    affectedBuses: Set<string>;

    // Refresh
    refreshFromFirestore: () => Promise<void>;
}

/**
 * Convert Firestore document to DriverDoc
 */
function docToDriver(id: string, data: DocumentData): DriverDoc {
    return {
        uid: id,
        employeeId: data.employeeId || data.driverId || '',
        fullName: data.fullName || data.name || 'Unknown',
        assignedBusId: data.assignedBusId || data.busId || null,
        assignedRouteId: data.assignedRouteId || data.routeId || null,
        isReserved: data.isReserved || data.status === 'reserved' || false,
        shift: data.shift,
        status: data.status,
        profilePhotoUrl: data.profilePhotoUrl,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
    };
}

/**
 * Convert Firestore document to BusDoc
 */
function docToBus(id: string, data: DocumentData): BusDoc {
    return {
        busId: id,
        busNumber: data.busNumber || '',
        assignedDriverId: data.assignedDriverId || null,
        activeDriverId: data.activeDriverId || null,
        routeId: data.routeId || null,
        routeName: data.routeName,
        activeTripId: data.activeTripId || null,
        status: data.status,
        capacity: data.capacity,
        currentMembers: data.currentMembers,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
    };
}

/**
 * Convert Firestore document to RouteDoc  
 */
function docToRoute(id: string, data: DocumentData): RouteDoc {
    return {
        routeId: id,
        routeName: data.routeName || '',
        stops: data.stops || [],
        totalStops: data.totalStops || data.stops?.length || 0,
        active: data.active !== false, // default true
        updatedAt: data.updatedAt,
    };
}

export function useWorkingCopy(options: UseWorkingCopyOptions = {}): UseWorkingCopyReturn {
    const { autoSubscribe = true } = options;

    const [workingCopy, setWorkingCopy] = useState<WorkingCopy>(createEmptyWorkingCopy());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    /**
     * SPARK PLAN SAFETY FIX:
     * Replaced onSnapshot (realtime) with getDocs (one-time fetch)
     * onSnapshot on entire collections was causing 8.9K+ reads!
     * 
     * Now using one-time fetch on mount + manual refresh when needed.
     */

    // One-time data fetch function
    const fetchAllData = useCallback(async () => {
        if (!autoSubscribe) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const { getDocs } = await import('firebase/firestore');

            // Fetch all three collections in parallel (one-time reads, not realtime)
            const [driversSnapshot, busesSnapshot, routesSnapshot] = await Promise.all([
                getDocs(collection(db, 'drivers')),
                getDocs(collection(db, 'buses')),
                getDocs(collection(db, 'routes')),
            ]);

            // Process drivers
            const newDrivers = new Map<string, DriverDoc>();
            const newOriginalDrivers = new Map<string, DriverDoc>();
            driversSnapshot.docs.forEach((doc) => {
                const driver = docToDriver(doc.id, doc.data());
                newDrivers.set(doc.id, driver);
                newOriginalDrivers.set(doc.id, cloneDriver(driver));
            });

            // Process buses
            const newBuses = new Map<string, BusDoc>();
            const newOriginalBuses = new Map<string, BusDoc>();
            busesSnapshot.docs.forEach((doc) => {
                const bus = docToBus(doc.id, doc.data());
                newBuses.set(doc.id, bus);
                newOriginalBuses.set(doc.id, cloneBus(bus));
            });

            // Process routes
            const newRoutes = new Map<string, RouteDoc>();
            routesSnapshot.docs.forEach((doc) => {
                const route = docToRoute(doc.id, doc.data());
                newRoutes.set(doc.id, route);
            });

            setWorkingCopy((prev) => {
                const newCopy: WorkingCopy = {
                    ...prev,
                    drivers: newDrivers,
                    originalDrivers: newOriginalDrivers,
                    buses: newBuses,
                    originalBuses: newOriginalBuses,
                    routes: newRoutes,
                };

                // Re-apply staging rows
                for (const row of prev.staging) {
                    applyStagingRowToWorkingCopy(row, newCopy);
                }

                return newCopy;
            });

            console.log(`[useWorkingCopy] Loaded: ${driversSnapshot.size} drivers, ${busesSnapshot.size} buses, ${routesSnapshot.size} routes`);
        } catch (err: any) {
            console.error('[useWorkingCopy] Error loading data:', err);
            setError(err);
            toast.error('Failed to load data. Please refresh.');
        } finally {
            setLoading(false);
        }
    }, [autoSubscribe]);

    // Initial fetch on mount
    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    // Convert Maps to arrays for iteration
    const drivers = useMemo(() => Array.from(workingCopy.drivers.values()), [workingCopy.drivers]);
    const buses = useMemo(() => Array.from(workingCopy.buses.values()), [workingCopy.buses]);
    const routes = useMemo(() => Array.from(workingCopy.routes.values()), [workingCopy.routes]);
    const staging = workingCopy.staging;

    // Merged view helpers
    const getAssignedDriverForBus = useCallback(
        (busId: string) => computeAssignedDriverForBus(busId, workingCopy),
        [workingCopy]
    );

    const getAssignedBusForDriver = useCallback(
        (driverUid: string) => computeAssignedBusForDriver(driverUid, workingCopy),
        [workingCopy]
    );

    const getAssignedRouteForBus = useCallback(
        (busId: string) => computeAssignedRouteForBus(busId, workingCopy),
        [workingCopy]
    );

    // Lookup helpers
    const getDriverById = useCallback(
        (driverUid: string) => workingCopy.drivers.get(driverUid),
        [workingCopy.drivers]
    );

    const getBusById = useCallback(
        (busId: string) => workingCopy.buses.get(busId),
        [workingCopy.buses]
    );

    const getRouteById = useCallback(
        (routeId: string) => workingCopy.routes.get(routeId),
        [workingCopy.routes]
    );

    const getBusLabel = useCallback(
        (busId: string): string => {
            const bus = workingCopy.buses.get(busId);
            if (!bus) return busId;
            return formatBusLabel(busId, bus.busNumber);
        },
        [workingCopy.buses]
    );

    // Staging operations
    const addStagingRow = useCallback(
        (row: StagingRow): ValidationError | null => {
            // Validate first
            const validationError = validateStagingRow(row, workingCopy);
            if (validationError) {
                return validationError;
            }

            setWorkingCopy((prev) => {
                // Check if there's already a row for this bus (same type)
                const existingIdx = prev.staging.findIndex(
                    (r) => r.busId === row.busId && r.type === row.type
                );

                const newStaging = [...prev.staging];
                if (existingIdx >= 0) {
                    // Replace existing
                    newStaging[existingIdx] = row;
                } else {
                    // Add new
                    newStaging.push(row);
                }

                const newCopy: WorkingCopy = {
                    ...prev,
                    staging: newStaging,
                };

                // Apply to working copy
                applyStagingRowToWorkingCopy(row, newCopy);

                return newCopy;
            });

            return null;
        },
        [workingCopy]
    );

    const removeStagingRow = useCallback(
        (rowId: string) => {
            setWorkingCopy((prev) => {
                const newCopy = { ...prev, staging: [...prev.staging] };
                removeStagingRowFromWorkingCopy(rowId, newCopy);
                return newCopy;
            });
        },
        []
    );

    const clearAllStaging = useCallback(() => {
        setWorkingCopy((prev) => {
            const newCopy = { ...prev };
            clearStagingHelper(newCopy);
            return newCopy;
        });
    }, []);

    // Get staging for specific entity
    const getStagingForBus = useCallback(
        (busId: string) => workingCopy.staging.find((r) => r.busId === busId),
        [workingCopy.staging]
    );

    const getStagingForDriver = useCallback(
        (driverUid: string): DriverStagingRow | undefined => {
            return workingCopy.staging.find(
                (r): r is DriverStagingRow =>
                    r.type === 'driver' &&
                    (r.newOperator.driverUid === driverUid ||
                        r.previousOperator.driverUid === driverUid)
            );
        },
        [workingCopy.staging]
    );

    // Affected entities
    const affectedDrivers = useMemo(
        () => getAffectedDrivers(workingCopy),
        [workingCopy]
    );

    const affectedBuses = useMemo(
        () => getAffectedBuses(workingCopy),
        [workingCopy]
    );

    // Refresh from Firestore (clears staging and re-fetches all data)
    const refreshFromFirestore = useCallback(async () => {
        setWorkingCopy((prev) => {
            const newCopy = { ...prev };
            clearStagingHelper(newCopy);
            return newCopy;
        });
        // Re-fetch all data since we're using one-time getDocs, not realtime listeners
        await fetchAllData();
    }, [fetchAllData]);

    return {
        workingCopy,
        loading,
        error,
        drivers,
        buses,
        routes,
        staging,
        getAssignedDriverForBus,
        getAssignedBusForDriver,
        getAssignedRouteForBus,
        getDriverById,
        getBusById,
        getRouteById,
        getBusLabel,
        addStagingRow,
        removeStagingRow,
        clearAllStaging,
        getStagingForBus,
        getStagingForDriver,
        affectedDrivers,
        affectedBuses,
        refreshFromFirestore,
    };
}

export default useWorkingCopy;
