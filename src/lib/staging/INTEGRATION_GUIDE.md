# Staging System Integration Guide

This document explains how to integrate the new staging system into the Driver Assignment and Route Allocation pages.

## Overview

The staging system implements a **working copy pattern** where:
1. On page load, all drivers, buses, and routes are fetched from Firestore
2. Data is stored in a local "working copy"
3. A copy of original state is kept for rollback
4. Staging changes are applied on top of the working copy
5. UI always displays the **merged view** (original + staging)

## Key Files

```
src/lib/staging/
├── stagingModel.ts      # Types and core model
├── mergeHelpers.ts      # Functions to compute merged state
├── stagingAdapter.ts    # Helpers for legacy page integration
├── index.ts             # Module exports
└── __tests__/           # Unit tests

src/hooks/
└── useWorkingCopy.ts    # React hook for managing working copy

src/components/assignment/
└── EnhancedStagingArea.tsx  # New staging area components

src/lib/services/
└── assignment-service.ts    # Updated with commitStagingRows()
```

## Staging Row Structure

Each staging row is **bus-centered** and contains:

```typescript
interface DriverStagingRow {
    id: string;                     // Unique client-side ID
    type: "driver";
    busId: string;                  // Target bus document ID
    busLabel: string;               // "Bus-1 (AS-01-PC-9094)"
    previousOperator: {
        driverUid: string | null;
        employeeId: string | null;
        name: string | null;
    };
    changeType: "assign" | "reserve" | "swap";
    newOperator: {
        driverUid: string | null;
        employeeId: string | null;
        name: string | null;
        previousBusId: string | null;  // Where they came from
    };
    isSwap: boolean;
    createdAt: number;
    createdBy: string;
}
```

## Bus Label Format

All bus labels must use the format: **`Bus-N (busNumber)`**

Example: `Bus-1 (AS-01-PC-9094)`

Use the helper function:
```typescript
import { formatBusLabel } from '@/lib/staging';

const label = formatBusLabel('bus_1', 'AS-01-PC-9094');
// Returns: "Bus-1 (AS-01-PC-9094)"
```

## Integration Option 1: useWorkingCopy Hook (Recommended)

For new pages or full refactoring:

```typescript
import { useWorkingCopy } from '@/hooks/useWorkingCopy';
import { createDriverStagingRow } from '@/lib/staging';
import { EnhancedDriverStagingArea } from '@/components/assignment/EnhancedStagingArea';
import { commitStagingRows } from '@/lib/services/assignment-service';

function DriverAssignmentPage() {
    const {
        drivers,
        buses,
        staging,
        loading,
        getAssignedDriverForBus,
        getAssignedBusForDriver,
        addStagingRow,
        removeStagingRow,
        clearAllStaging,
        refreshFromFirestore,
        getBusLabel,
        getDriverById,
    } = useWorkingCopy();

    // Handle bus click to stage assignment
    const handleBusClick = (busId: string, selectedDriverId: string) => {
        const bus = buses.find(b => b.busId === busId);
        const selectedDriver = getDriverById(selectedDriverId);
        const currentAssignment = getAssignedDriverForBus(busId);
        
        const currentDriver = currentAssignment.driverUid 
            ? getDriverById(currentAssignment.driverUid) 
            : null;
        
        const row = createDriverStagingRow(
            busId,
            bus.busNumber,
            selectedDriver,
            currentDriver,
            currentUser.uid
        );
        
        const error = addStagingRow(row);
        if (error) {
            toast.error(error.message);
        }
    };

    // Commit all staging rows
    const handleConfirm = async () => {
        const result = await commitStagingRows(staging, currentUser.uid);
        if (result.success) {
            toast.success('Assignments committed');
            refreshFromFirestore();
        } else {
            // Handle partial failures
            result.results.forEach(r => {
                if (r.status === 'error') {
                    toast.error(r.message);
                }
            });
        }
    };

    // Use merged view for display
    return (
        <div>
            {/* Driver list shows merged bus assignment */}
            {drivers.map(driver => {
                const busAssignment = getAssignedBusForDriver(driver.uid);
                return (
                    <div key={driver.uid}>
                        {driver.fullName}
                        <Badge variant={busAssignment.source === 'staged' ? 'warning' : 'default'}>
                            {busAssignment.busLabel || 'Reserved'}
                        </Badge>
                    </div>
                );
            })}

            {/* Staging area */}
            <EnhancedDriverStagingArea
                staging={staging.filter(r => r.type === 'driver')}
                onRemove={removeStagingRow}
                onClearAll={clearAllStaging}
                onConfirm={handleConfirm}
            />
        </div>
    );
}
```

## Integration Option 2: Staging Adapter (For Existing Pages)

For gradual migration of existing pages:

```typescript
import {
    createStagingFromLegacy,
    computeMergedBusForDriver,
    computeMergedDriverForBus,
    getBusLabelFromLegacy,
} from '@/lib/staging/stagingAdapter';
import type { DriverStagingRow } from '@/lib/staging';

function ExistingDriverAssignmentPage() {
    const [drivers, setDrivers] = useState<DriverData[]>([]);
    const [buses, setBuses] = useState<BusData[]>([]);
    const [staging, setStaging] = useState<DriverStagingRow[]>([]);
    
    // Existing Firestore subscriptions...

    // Create staging row using adapter
    const handleBusClick = (bus: BusData, selectedDriver: DriverData) => {
        const row = createStagingFromLegacy({
            selectedDriver,
            targetBus: bus,
            allDrivers: drivers,
            adminUid: currentUser.uid,
            action: 'assign', // or 'swap' or 'reserve'
        });
        
        setStaging(prev => {
            const existing = prev.findIndex(r => r.busId === bus.busId);
            if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = row;
                return updated;
            }
            return [...prev, row];
        });
    };

    // Use merged view for display
    const getDriverBusLabel = (driverId: string) => {
        const merged = computeMergedBusForDriver(driverId, drivers, buses, staging);
        return merged.busLabel || 'Reserved';
    };

    const getBusDriverName = (busId: string) => {
        const merged = computeMergedDriverForBus(busId, drivers, buses, staging);
        return merged.driverName || 'Available';
    };
}
```

## Merge Logic

### Who is assigned to a bus?
1. Check if there's a staging row for that bus → use `newOperator`
2. Otherwise → use live data from `bus.assignedDriverId`

### What bus is a driver assigned to?
1. Check if driver is `newOperator` in any staging row → use that bus
2. Check if driver is `previousOperator` in a swap → use the other bus
3. Check if driver is `previousOperator` (non-swap) → they're reserved
4. Otherwise → use live data from `driver.assignedBusId`

## Operation Types

### Assign
- New driver takes over a bus
- Previous driver (if any) becomes Reserved

### Reserve
- Same as assign, but explicitly marks previous driver as Reserved
- Used when confirming displacement action

### Swap
- Two drivers exchange buses
- Both drivers remain assigned (just to different buses)

### Route Change
- Bus is assigned to a new route
- Driver's route is also updated

## Committing Changes

Use `commitStagingRows()` to apply all staging changes to Firestore:

```typescript
import { commitStagingRows } from '@/lib/services/assignment-service';

const result = await commitStagingRows(staging, adminUid);

// result contains:
// - success: boolean (true if all succeeded)
// - totalRows: number
// - successCount: number
// - failureCount: number
// - results: Array<{ rowId, status, message? }>
```

Each row is committed in a separate transaction for granular error handling.

## Testing

Run the unit tests:

```bash
npm run test:run src/lib/staging
```

Or watch mode:

```bash
npm run test:watch src/lib/staging
```

## Acceptance Criteria

1. ✅ UI always shows merged view (live data + staging changes)
2. ✅ Staging is client-local until committed
3. ✅ Bus labels use format "Bus-N (busNumber)"
4. ✅ Commit function returns per-row success/failure
5. ✅ Active trip protection prevents modifications
6. ✅ Clear error handling with specific messages
