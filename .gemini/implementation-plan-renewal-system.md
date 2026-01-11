# Per-Student Renewal System Implementation Plan

## Overview

This document outlines the implementation plan for refactoring the System Renewal Configuration to use **month/day only** (no year) and compute per-student effective dates based on each student's `sessionEndYear`. The system also includes a safe **Simulation Mode** for testing with **console-only logging** (no Firestore audit storage).

---

## Implementation Status

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 1** | Data Model & Types | ✅ COMPLETE |
| **Phase 2** | Date Computation Engine | ✅ COMPLETE |
| **Phase 3** | Simulation Mode Safety | ✅ COMPLETE |
| **Phase 4** | Cloud Function Scheduler | ✅ COMPLETE (Date-Specific Crons) |
| **Phase 5** | Admin UI Enhancements | ✅ COMPLETE (Month/Day Picker) |
| **Phase 6** | Audit & Versioning | ✅ COMPLETE (Console-only, no Firestore audit) |

### Completed Files
- `src/lib/types/deadline-config.ts` - Type definitions
- `src/lib/utils/deadline-computation.ts` - Core date computation engine
- `src/lib/utils/simulation-logger.ts` - Simulation logging utilities
- `src/lib/types.ts` - Extended Student interface
- `src/lib/types/deadline-config-defaults.ts` - Updated with executeSimulationActions
- `src/config/deadline-config.json` - Updated with executeSimulationActions
- `src/app/api/settings/deadline-config/route.ts` - **Console-only logging, no Firestore audit**
- `src/app/api/settings/deadline-preview/route.ts` - Preview effects API
- `functions/index.js` - **Date-specific scheduled functions** (ONLY these 3):
  - `enforceSoftBlock` - July 31 at 00:05 IST
  - `sendUrgentWarnings` - Aug 16 at 00:05 IST (15 days before hard delete)
  - `enforceHardDelete` - Aug 31 at 00:05 IST
  - ~~weeklyReconciliation~~ - **REMOVED** (system is deterministic, no polling needed)
- `src/components/month-day-picker.tsx` - **NEW: Month/Day only picker** (no year selection)
- `src/app/admin/sys-renewal-config-x9k2p/page.tsx` - **UPDATED**:
  - Uses `MonthDayPicker` instead of `EnhancedDatePicker`
  - State changed from date strings to `MonthDayValue` objects
  - No year ever persists to config
  - Enhanced simulation mode controls

---



## Current State Analysis

### Existing Components
- **`deadline-config.json`**: Stores deadline configuration with month/day values (already structured correctly)
- **`deadline-config-defaults.ts`**: Static fallback configuration
- **Admin UI**: System Config page at `/admin/sys-renewal-config-x9k2p/page.tsx`
- **API Route**: `/api/settings/deadline-config/route.ts` for CRUD operations
- **Utility Functions**: `renewal-utils.ts`, `date-utils.ts` for date calculations
- **Student Type**: Already includes `sessionStartYear`, `sessionEndYear`, `validUntil` fields
- **Cloud Functions**: Basic `functions/index.js` for Firestore health checks

### Issues to Address
1. Current date calculations use a global year (current year or testingMode.customYear)
2. No per-student date computation based on individual `sessionEndYear`
3. Hard delete not enforced in next academic cycle
4. No simulation mode safety guards
5. No proper audit trail for system actions
6. No scheduled cloud functions for automated soft blocks/hard deletes

---

## Implementation Phases

### Phase 1: Data Model & Types
**Priority: High | Effort: Medium**

#### 1.1 Update Student Type Definition
**File**: `src/lib/types.ts`

Add new computed fields to the `Student` interface:

```typescript
export interface Student {
  // ... existing fields ...
  
  // Bus Session System Fields (already exist)
  sessionDuration?: number | string;
  sessionStartYear?: number;
  sessionEndYear?: number;
  validUntil?: string;
  
  // NEW: Computed deadline fields (populated by scheduler)
  computed?: {
    serviceExpiryDate?: string;    // ISO string
    renewalDeadlineDate?: string;  // ISO string
    softBlockDate?: string;        // ISO string
    hardDeleteDate?: string;       // ISO string - ALWAYS in sessionEndYear + 1
    urgentWarningDate?: string;    // ISO string
    computedAt?: string;           // When these were last calculated
  };
  
  // NEW: Status tracking for deadline enforcement
  status?: 'active' | 'soft_blocked' | 'pending_deletion' | 'deleted';
  softBlockedAt?: string;          // Timestamp when soft block was applied
  hardDeleteScheduledAt?: string;  // Timestamp when hard delete was scheduled
  
  // ... existing index signature ...
}
```

#### 1.2 Create Config Types
**File**: `src/lib/types/deadline-config.ts` (NEW)

```typescript
/**
 * Deadline Configuration Types
 * Month values are 0-indexed (0 = January, 5 = June)
 */

export interface DateOnlyConfig {
  month: number;     // 0-indexed month
  day: number;       // Day of month
}

export interface DeadlineConfig {
  version: string;
  lastUpdated: string;
  lastUpdatedBy?: string;
  
  academicYear: {
    anchorMonth: number;
    anchorDay: number;
    description: string;
    // ... display fields
  };
  
  renewalNotification: DateOnlyConfig & {
    daysBeforeDeadline: number;
    // ... display fields
  };
  
  renewalDeadline: DateOnlyConfig & {
    // ... display fields
  };
  
  softBlock: DateOnlyConfig & {
    daysAfterDeadline: number;
    warningText: string;
    // ... display fields
  };
  
  hardDelete: DateOnlyConfig & {
    daysAfterDeadline: number;
    daysAfterSoftBlock: number;
    criticalWarningText: string;
    // ... display fields
  };
  
  urgentWarningThreshold: {
    days: number;
  };
  
  testingMode: {
    enabled: boolean;
    customYear: number;        // Simulation year override
    executeSimulationActions: boolean; // NEW: Must be false by default
    notes: string;
  };
  
  // ... other sections (contactInfo, timeline, etc.)
}

/**
 * Computed dates for a specific student
 */
export interface StudentComputedDates {
  studentId: string;
  sessionEndYear: number;
  
  serviceExpiryDate: Date;
  renewalNotificationDate: Date;
  renewalDeadlineDate: Date;
  softBlockDate: Date;
  hardDeleteDate: Date;      // ALWAYS in sessionEndYear + 1
  urgentWarningDate: Date;
  
  computedAt: Date;
  configVersion: string;     // Track which config version was used
}

/**
 * Audit log entry for system actions
 */
export interface SystemActionAudit {
  id: string;
  action: 'soft_block' | 'urgent_warning' | 'hard_delete' | 'config_change' | 'reactivation';
  studentId?: string;
  actorType: 'system' | 'admin' | 'scheduler' | 'simulation';
  actorId?: string;
  timestamp: Date;
  details: Record<string, any>;
  isSimulation: boolean;
  status: 'success' | 'failed' | 'pending';
  error?: string;
}
```

### Phase 2: Date Computation Engine
**Priority: High | Effort: Medium**

#### 2.1 Create Core Date Computation Utility
**File**: `src/lib/utils/deadline-computation.ts` (NEW)

```typescript
import { DEADLINE_CONFIG as deadlineConfig } from '@/lib/types/deadline-config-defaults';

/**
 * Core date computation engine for per-student deadline dates
 * 
 * RULES:
 * 1. All config values are month/day only (no year)
 * 2. Year is derived from student's sessionEndYear
 * 3. Hard delete MUST occur in sessionEndYear + 1 (next academic cycle)
 * 4. Simulation mode overrides the year for all calculations
 */

export interface ComputeDateParams {
  studentSessionEndYear: number;
  config: typeof deadlineConfig;
  simulationMode?: {
    enabled: boolean;
    customYear: number;
  };
}

export interface ComputedDates {
  serviceExpiryDate: Date;
  renewalNotificationDate: Date;
  renewalDeadlineDate: Date;
  softBlockDate: Date;
  hardDeleteDate: Date;
  urgentWarningDate: Date;
  effectiveYear: number;
  isSimulated: boolean;
}

/**
 * Compute all deadline dates for a student
 */
export function computeDatesForStudent(params: ComputeDateParams): ComputedDates {
  const { studentSessionEndYear, config, simulationMode } = params;
  
  // Determine the effective year to use
  const isSimulated = simulationMode?.enabled ?? false;
  const effectiveYear = isSimulated 
    ? simulationMode!.customYear 
    : studentSessionEndYear;
  
  // Service Expiry Date: anchor month/day in effectiveYear
  const serviceExpiryDate = new Date(
    effectiveYear,
    config.academicYear.anchorMonth,
    config.academicYear.anchorDay,
    23, 59, 59
  );
  
  // Renewal Notification Date: config month/day in effectiveYear
  const renewalNotificationDate = new Date(
    effectiveYear,
    config.renewalNotification.month,
    config.renewalNotification.day
  );
  
  // Renewal Deadline Date: config month/day in effectiveYear
  const renewalDeadlineDate = new Date(
    effectiveYear,
    config.renewalDeadline.month,
    config.renewalDeadline.day
  );
  
  // Soft Block Date: config month/day in effectiveYear
  const softBlockDate = new Date(
    effectiveYear,
    config.softBlock.month,
    config.softBlock.day,
    23, 59, 59
  );
  
  // Hard Delete Date: MUST be in effectiveYear + 1 (next cycle)
  // This is the critical rule - hard deletes always happen in the NEXT academic cycle
  const hardDeleteYear = effectiveYear + 1;
  const hardDeleteDate = new Date(
    hardDeleteYear,
    config.hardDelete.month,
    config.hardDelete.day,
    23, 59, 59
  );
  
  // Urgent Warning Date: X days before hard delete
  const urgentWarningDate = new Date(hardDeleteDate);
  urgentWarningDate.setDate(
    urgentWarningDate.getDate() - config.urgentWarningThreshold.days
  );
  
  return {
    serviceExpiryDate,
    renewalNotificationDate,
    renewalDeadlineDate,
    softBlockDate,
    hardDeleteDate,
    urgentWarningDate,
    effectiveYear,
    isSimulated
  };
}

/**
 * Check if today matches a specific deadline date
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Check if date1 is on or after date2
 */
export function isOnOrAfter(date1: Date, date2: Date): boolean {
  const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
  const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
  return d1 >= d2;
}

/**
 * Get days between two dates
 */
export function daysBetween(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000;
  return Math.ceil((date2.getTime() - date1.getTime()) / oneDay);
}

/**
 * Validate a date for invalid day-of-month (e.g., Feb 31)
 */
export function validateDate(month: number, day: number): { valid: boolean; error?: string } {
  const testDate = new Date(2024, month, day); // Use leap year for validation
  if (testDate.getMonth() !== month) {
    return { 
      valid: false, 
      error: `Invalid day ${day} for month ${month + 1}` 
    };
  }
  return { valid: true };
}

/**
 * Handle leap year edge case for Feb 29
 * Returns Feb 28 for non-leap years
 */
export function normalizeLeapYearDate(year: number, month: number, day: number): Date {
  if (month === 1 && day === 29) { // February 29
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    if (!isLeapYear) {
      return new Date(year, 1, 28);
    }
  }
  return new Date(year, month, day);
}
```

#### 2.2 Update Existing Renewal Utils
**File**: `src/lib/utils/renewal-utils.ts`

Add new functions that use the computation engine:

```typescript
import { computeDatesForStudent, isOnOrAfter, daysBetween } from './deadline-computation';

/**
 * Check if a specific student should be soft-blocked
 * Uses per-student date computation
 */
export function shouldBlockAccessForStudent(
  student: Student,
  config: DeadlineConfig,
  simulationMode?: { enabled: boolean; customYear: number }
): boolean {
  if (!student.sessionEndYear) return true;
  if (!student.validUntil) return true;
  
  const validUntilDate = new Date(student.validUntil);
  const today = new Date();
  
  // If validUntil is still in future, don't block
  if (validUntilDate > today) return false;
  
  // Compute dates for this student
  const computed = computeDatesForStudent({
    studentSessionEndYear: student.sessionEndYear,
    config,
    simulationMode
  });
  
  // Block if today is on or after soft block date
  return isOnOrAfter(today, computed.softBlockDate);
}

/**
 * Check if a specific student should be hard-deleted
 * Hard delete always in next academic cycle
 */
export function shouldHardDeleteForStudent(
  student: Student,
  config: DeadlineConfig,
  simulationMode?: { enabled: boolean; customYear: number }
): boolean {
  if (!student.sessionEndYear) return false; // Can't compute without sessionEndYear
  
  const computed = computeDatesForStudent({
    studentSessionEndYear: student.sessionEndYear,
    config,
    simulationMode
  });
  
  const today = new Date();
  return isOnOrAfter(today, computed.hardDeleteDate);
}

/**
 * Get days until hard delete for a specific student
 */
export function getDaysUntilHardDeleteForStudent(
  student: Student,
  config: DeadlineConfig,
  simulationMode?: { enabled: boolean; customYear: number }
): number {
  if (!student.sessionEndYear) return 0;
  
  const computed = computeDatesForStudent({
    studentSessionEndYear: student.sessionEndYear,
    config,
    simulationMode
  });
  
  return Math.max(0, daysBetween(new Date(), computed.hardDeleteDate));
}
```

### Phase 3: Simulation Mode Safety
**Priority: High | Effort: Low**

#### 3.1 Add Safety Guards to Simulation Mode
**File**: Update `src/lib/types/deadline-config-defaults.ts`

Add `executeSimulationActions: false` to testingMode:

```typescript
testingMode: {
  description: "Enable testing mode to use custom dates instead of current year",
  enabled: false,
  customYear: 2024,
  executeSimulationActions: false, // NEW: Must be explicitly enabled with confirmation
  notes: "When enabled, date calculations use customYear. Destructive actions are logged only unless executeSimulationActions is true."
}
```

#### 3.2 Create Simulation Actions Logger
**File**: `src/lib/utils/simulation-logger.ts` (NEW)

```typescript
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

interface SimulationAction {
  action: 'soft_block' | 'hard_delete' | 'notification';
  studentId: string;
  studentEmail?: string;
  intendedDate: string;
  simulationYear: number;
  wouldHaveExecuted: Record<string, any>;
  timestamp: Date;
  schedulerRunId: string;
}

/**
 * Log an action that WOULD have been taken in production
 * Used when Simulation Mode is ON but executeSimulationActions is false
 */
export async function logSimulationAction(action: SimulationAction): Promise<void> {
  await adminDb.collection('simulationActions').add({
    ...action,
    timestamp: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp()
  });
  
  console.log(`[SIMULATION] Would have executed: ${action.action} for student ${action.studentId}`);
}

/**
 * Get simulation actions log for admin review
 */
export async function getSimulationActionsLog(
  limit: number = 100,
  startAfter?: any
): Promise<SimulationAction[]> {
  let query = adminDb
    .collection('simulationActions')
    .orderBy('timestamp', 'desc')
    .limit(limit);
  
  if (startAfter) {
    query = query.startAfter(startAfter);
  }
  
  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as SimulationAction[];
}
```

### Phase 4: Cloud Function Scheduler
**Priority: High | Effort: High**

#### 4.1 Create Scheduled Cloud Function
**File**: `functions/scheduled-deadline-processor.js` (NEW)

```javascript
/**
 * Scheduled Cloud Function for Processing Deadline Events
 * 
 * This function runs daily and handles:
 * 1. Sending renewal notifications
 * 2. Applying soft blocks
 * 3. Sending urgent warnings
 * 4. Executing hard deletes (in real mode only)
 * 
 * IMPORTANT: Respects simulation mode and safety guards
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

// Initialize if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Core deadline processor - runs daily at 00:05 IST (18:35 UTC previous day)
 */
export const processDeadlines = onSchedule(
  {
    schedule: "35 18 * * *", // 18:35 UTC = 00:05 IST next day
    timeZone: "Asia/Kolkata",
    region: "asia-south1",
    memory: "512MiB",
    timeoutSeconds: 540 // 9 minutes
  },
  async (event) => {
    const runId = `run_${Date.now()}`;
    console.log(`[${runId}] Starting deadline processor...`);
    
    try {
      // Load config
      const config = await loadConfig();
      const isSimulation = config.testingMode?.enabled ?? false;
      const canExecute = config.testingMode?.executeSimulationActions ?? false;
      
      console.log(`[${runId}] Simulation Mode: ${isSimulation}, Can Execute: ${canExecute}`);
      
      // Get today's date (respect simulation mode)
      const today = isSimulation 
        ? new Date(config.testingMode.customYear, new Date().getMonth(), new Date().getDate())
        : new Date();
      
      // Process students in batches
      const batchSize = 500;
      let lastDoc = null;
      let processedCount = 0;
      
      while (true) {
        const students = await fetchStudentBatch(batchSize, lastDoc);
        if (students.length === 0) break;
        
        for (const student of students) {
          await processStudent(student, config, today, isSimulation, canExecute, runId);
          processedCount++;
        }
        
        lastDoc = students[students.length - 1].doc;
        console.log(`[${runId}] Processed ${processedCount} students so far...`);
      }
      
      // Log run completion
      await logSchedulerRun(runId, 'success', processedCount);
      console.log(`[${runId}] Completed. Processed ${processedCount} students.`);
      
    } catch (error) {
      console.error(`[${runId}] Error:`, error);
      await logSchedulerRun(runId, 'error', 0, error.message);
      throw error;
    }
  }
);

/**
 * Process a single student for deadline events
 */
async function processStudent(student, config, today, isSimulation, canExecute, runId) {
  if (!student.sessionEndYear) {
    console.log(`[${runId}] Skipping ${student.id}: missing sessionEndYear`);
    return;
  }
  
  // Skip already deleted students
  if (student.status === 'deleted') return;
  
  // Compute dates for this student
  const computed = computeDatesForStudent(student.sessionEndYear, config, isSimulation);
  
  // Check for soft block
  if (isSameDay(today, computed.softBlockDate)) {
    if (student.status !== 'soft_blocked' && !student.softBlockedAt) {
      await applySoftBlock(student, computed, isSimulation, canExecute, runId);
    }
  }
  
  // Check for urgent warning
  if (isSameDay(today, computed.urgentWarningDate)) {
    await sendUrgentWarning(student, computed, isSimulation, canExecute, runId);
  }
  
  // Check for hard delete
  if (isSameDay(today, computed.hardDeleteDate)) {
    await executeHardDelete(student, computed, isSimulation, canExecute, runId);
  }
}

/**
 * Apply soft block to a student
 */
async function applySoftBlock(student, computed, isSimulation, canExecute, runId) {
  if (isSimulation && !canExecute) {
    // Log simulation action only
    await db.collection('simulationActions').add({
      action: 'soft_block',
      studentId: student.id,
      studentEmail: student.email,
      intendedDate: computed.softBlockDate.toISOString(),
      simulationYear: computed.effectiveYear,
      runId,
      timestamp: FieldValue.serverTimestamp()
    });
    console.log(`[${runId}][SIM] Would soft block: ${student.id}`);
    return;
  }
  
  // Execute real soft block
  const batch = db.batch();
  
  // Update student document
  const studentRef = db.collection('students').doc(student.id);
  batch.update(studentRef, {
    status: 'soft_blocked',
    softBlockedAt: FieldValue.serverTimestamp(),
    'computed.softBlockDate': computed.softBlockDate.toISOString(),
    updatedAt: FieldValue.serverTimestamp()
  });
  
  // Write audit log
  const auditRef = db.collection('systemActions').doc();
  batch.set(auditRef, {
    action: 'soft_block',
    studentId: student.id,
    studentEmail: student.email,
    actorType: 'scheduler',
    timestamp: FieldValue.serverTimestamp(),
    details: {
      sessionEndYear: student.sessionEndYear,
      softBlockDate: computed.softBlockDate.toISOString()
    },
    isSimulation: false,
    status: 'success',
    runId
  });
  
  await batch.commit();
  
  // Send notification
  await sendNotification(student, 'soft_block', computed);
  
  console.log(`[${runId}] Soft blocked: ${student.id}`);
}

/**
 * Execute hard delete for a student
 * Multi-step process with safety checks
 */
async function executeHardDelete(student, computed, isSimulation, canExecute, runId) {
  if (isSimulation && !canExecute) {
    // Log simulation action only - NEVER ACTUALLY DELETE IN SIMULATION
    await db.collection('simulationActions').add({
      action: 'hard_delete',
      studentId: student.id,
      studentEmail: student.email,
      intendedDate: computed.hardDeleteDate.toISOString(),
      simulationYear: computed.effectiveYear,
      wouldDelete: {
        collections: ['students', 'users', 'payments'],
        cloudinaryImages: true,
        firebaseAuth: true
      },
      runId,
      timestamp: FieldValue.serverTimestamp()
    });
    console.log(`[${runId}][SIM] Would hard delete: ${student.id}`);
    return;
  }
  
  // ===== REAL DELETION - Multi-step with audit trail =====
  console.log(`[${runId}] Starting hard delete for: ${student.id}`);
  
  // Step 1: Mark as pending deletion
  await db.collection('students').doc(student.id).update({
    status: 'pending_deletion',
    hardDeleteScheduledAt: FieldValue.serverTimestamp()
  });
  
  // Step 2: Delete Cloudinary image (if exists)
  if (student.profilePhotoUrl) {
    try {
      await deleteCloudinaryImage(student.profilePhotoUrl);
      console.log(`[${runId}] Deleted Cloudinary image for: ${student.id}`);
    } catch (err) {
      console.warn(`[${runId}] Cloudinary delete failed for ${student.id}:`, err.message);
    }
  }
  
  // Step 3: Delete payments
  await deletePaymentsForStudent(student.id);
  
  // Step 4: Delete Firestore documents
  await db.collection('students').doc(student.id).delete();
  
  // Also delete from users collection if exists
  if (student.uid) {
    await db.collection('users').doc(student.uid).delete().catch(() => {});
  }
  
  // Step 5: Revoke Firebase Auth
  if (student.uid) {
    try {
      await admin.auth().deleteUser(student.uid);
      console.log(`[${runId}] Revoked Firebase Auth for: ${student.uid}`);
    } catch (err) {
      console.warn(`[${runId}] Auth delete failed for ${student.uid}:`, err.message);
    }
  }
  
  // Step 6: Write final audit log
  await db.collection('systemActions').add({
    action: 'hard_delete',
    studentId: student.id,
    studentEmail: student.email,
    studentUid: student.uid,
    actorType: 'scheduler',
    timestamp: FieldValue.serverTimestamp(),
    details: {
      sessionEndYear: student.sessionEndYear,
      hardDeleteDate: computed.hardDeleteDate.toISOString(),
      deletedData: {
        profilePhotoUrl: student.profilePhotoUrl,
        paymentsDeleted: true,
        authRevoked: true
      }
    },
    isSimulation: false,
    status: 'success',
    runId
  });
  
  console.log(`[${runId}] Hard delete completed: ${student.id}`);
}

// Helper functions
async function loadConfig() {
  // Read from Firestore or file system
  // For now, use default config
  const configDoc = await db.collection('config').doc('deadline').get();
  if (configDoc.exists) {
    return configDoc.data();
  }
  // Fallback to defaults
  return require('./deadline-config-defaults.json');
}

function computeDatesForStudent(sessionEndYear, config, isSimulation) {
  const effectiveYear = isSimulation ? config.testingMode.customYear : sessionEndYear;
  
  return {
    effectiveYear,
    serviceExpiryDate: new Date(effectiveYear, config.academicYear.anchorMonth, config.academicYear.anchorDay, 23, 59, 59),
    softBlockDate: new Date(effectiveYear, config.softBlock.month, config.softBlock.day, 23, 59, 59),
    hardDeleteDate: new Date(effectiveYear + 1, config.hardDelete.month, config.hardDelete.day, 23, 59, 59), // NEXT YEAR
    urgentWarningDate: new Date(
      effectiveYear + 1,
      config.hardDelete.month,
      config.hardDelete.day - config.urgentWarningThreshold.days,
      23, 59, 59
    )
  };
}

function isSameDay(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

// ... additional helpers for notifications, Cloudinary, etc.
```

### Phase 5: Admin UI Enhancements
**Priority: Medium | Effort: Medium**

#### 5.1 Add Preview Effects Modal
**File**: Update `src/app/admin/sys-renewal-config-x9k2p/page.tsx`

Add a new component for previewing effects on sample students:

```typescript
// Add preview dialog state
const [showPreviewDialog, setShowPreviewDialog] = useState(false);
const [previewStudentId, setPreviewStudentId] = useState('');
const [previewResult, setPreviewResult] = useState<any>(null);
const [loadingPreview, setLoadingPreview] = useState(false);

// Preview effect function
const handlePreviewEffects = async () => {
  if (!previewStudentId.trim()) {
    showToast('Please enter a student ID', 'error');
    return;
  }
  
  setLoadingPreview(true);
  try {
    const token = await currentUser.getIdToken();
    const response = await fetch('/api/settings/deadline-preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        studentId: previewStudentId,
        config: buildCurrentConfig() // Build config from current form state
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      setPreviewResult(data);
    } else {
      throw new Error('Failed to preview effects');
    }
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    setLoadingPreview(false);
  }
};
```

#### 5.2 Add Simulation Mode Enhancements
Update the simulation mode section to include safety controls:

```tsx
{/* Enhanced Simulation Mode Card */}
<section className="p-6 bg-white/5 rounded-2xl border border-white/5">
  <SectionHeader 
    icon={<Sparkles className="h-5 w-5 text-purple-400" />} 
    title="Simulation Mode" 
  />
  
  {/* Enable toggle */}
  <div className="flex items-center justify-between p-4 bg-black/20 rounded-xl">
    <div>
      <Label className="text-sm font-bold text-white">Enable Simulation</Label>
      <p className="text-xs text-gray-500">Use custom year for all date logic</p>
    </div>
    <ToggleSwitch 
      checked={testingMode.enabled} 
      onChange={(v) => setTestingMode(prev => ({ ...prev, enabled: v }))} 
    />
  </div>
  
  {testingMode.enabled && (
    <>
      {/* Custom year input */}
      <TextField 
        id="customYear"
        label="Simulation Year"
        type="number"
        value={testingMode.customYear}
        onChange={(v) => setTestingMode(prev => ({ ...prev, customYear: Number(v) }))}
      />
      
      {/* Safety warning */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl mt-4">
        <div className="flex items-center gap-2 text-amber-400 mb-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-bold">Simulation Safety</span>
        </div>
        <p className="text-xs text-gray-400">
          In simulation mode, all destructive actions (soft blocks, hard deletes) 
          are <strong>logged only</strong> and not actually executed unless 
          "Execute Simulation Actions" is enabled.
        </p>
      </div>
      
      {/* Preview button */}
      <Button 
        variant="outline" 
        onClick={() => setShowPreviewDialog(true)}
        className="mt-4 w-full"
      >
        <Eye className="h-4 w-4 mr-2" />
        Preview Effects on Student
      </Button>
      
      {/* View simulation log */}
      <Button 
        variant="ghost" 
        onClick={() => router.push('/admin/simulation-log')}
        className="mt-2 w-full text-gray-400"
      >
        <FileText className="h-4 w-4 mr-2" />
        View Simulation Actions Log
      </Button>
    </>
  )}
</section>
```

#### 5.3 Add Month/Day Only Indicator
Update the DateField component to show that only month/day is stored:

```tsx
function DateField({ ... }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-gray-300">{label}</Label>
        {/* Show month/day only indicator */}
        <span className="text-[10px] text-gray-500 flex items-center gap-1">
          <Info className="h-3 w-3" />
          Stored as month/day only
        </span>
      </div>
      {/* ... rest of component */}
    </div>
  );
}
```

### Phase 6: Audit & Versioning
**Priority: Medium | Effort: Medium**

#### 6.1 Create Audit API Endpoint
**File**: `src/app/api/settings/deadline-config/route.ts`

Update POST handler to save audit trail:

```typescript
// Inside POST handler, after saving config
const auditEntry = {
  type: 'config_change',
  changedBy: uid,
  changedByEmail: userDoc.data()?.email,
  timestamp: new Date().toISOString(),
  oldConfig: oldConfig,
  newConfig: updatedConfig,
  diff: computeConfigDiff(oldConfig, updatedConfig),
  version: updatedConfig.version
};

// Save to audit collection
await adminDb.collection('adminConfigChanges').add(auditEntry);
```

#### 6.2 Create System Actions Viewer Page
**File**: `src/app/admin/system-actions/page.tsx` (NEW)

```tsx
"use client";

export default function SystemActionsPage() {
  // ... implementation for viewing audit logs
  // Show table of:
  // - Config changes (who, when, what changed)
  // - System actions (soft blocks, hard deletes)
  // - Simulation actions (what would have happened)
}
```

---

## Migration Steps

### Step 1: Database Migration
Add `computed` fields to existing students:

```javascript
// scripts/migrate-student-computed-fields.js
async function migrateStudents() {
  const students = await db.collection('students').get();
  
  for (const doc of students.docs) {
    const student = doc.data();
    if (!student.sessionEndYear) continue;
    
    const computed = computeDatesForStudent(student.sessionEndYear, config, false);
    
    await doc.ref.update({
      computed: {
        serviceExpiryDate: computed.serviceExpiryDate.toISOString(),
        softBlockDate: computed.softBlockDate.toISOString(),
        hardDeleteDate: computed.hardDeleteDate.toISOString(),
        urgentWarningDate: computed.urgentWarningDate.toISOString(),
        computedAt: new Date().toISOString()
      }
    });
  }
}
```

### Step 2: Update Existing UI Components
Update these components to use per-student dates:
- `StudentAccessBlockScreen.tsx`
- `SessionStatusBanner.tsx`
- Student profile pages
- Admin renewal service page

---

## Testing Plan

### Unit Tests
- [ ] Date computation for various sessionEndYear values
- [ ] Hard delete always in sessionEndYear + 1
- [ ] Leap year handling (Feb 29)
- [ ] Invalid date validation

### Integration Tests
- [ ] Scheduler processes students correctly
- [ ] Simulation mode logs but doesn't execute
- [ ] Config changes trigger recomputation

### Manual Testing
- [ ] Enable simulation mode with custom year
- [ ] Preview effects on specific students
- [ ] Review simulation log entries

---

## Files to Create/Modify

### New Files
1. `src/lib/types/deadline-config.ts` - Type definitions
2. `src/lib/utils/deadline-computation.ts` - Core computation engine
3. `src/lib/utils/simulation-logger.ts` - Simulation action logging
4. `functions/scheduled-deadline-processor.js` - Scheduled cloud function
5. `src/app/api/settings/deadline-preview/route.ts` - Preview API
6. `src/app/admin/system-actions/page.tsx` - Audit log viewer
7. `scripts/migrate-student-computed-fields.js` - Migration script

### Modified Files
1. `src/lib/types.ts` - Add Student.computed fields
2. `src/lib/types/deadline-config-defaults.ts` - Add executeSimulationActions
3. `src/lib/utils/renewal-utils.ts` - Use per-student computation
4. `src/app/admin/sys-renewal-config-x9k2p/page.tsx` - UI enhancements
5. `src/app/api/settings/deadline-config/route.ts` - Add audit logging
6. `src/components/StudentAccessBlockScreen.tsx` - Use per-student dates
7. `functions/index.js` - Export new scheduled function

---

## Timeline Estimate

| Phase | Effort | Priority |
|-------|--------|----------|
| Phase 1: Data Model | 1 day | High |
| Phase 2: Computation Engine | 1 day | High |
| Phase 3: Simulation Safety | 0.5 day | High |
| Phase 4: Cloud Scheduler | 2 days | High |
| Phase 5: Admin UI | 1.5 days | Medium |
| Phase 6: Audit & Versioning | 1 day | Medium |
| Testing & Validation | 1 day | High |

**Total: ~8 days**

---

## Questions to Confirm Before Implementation

1. **Firestore collections**: Should audit logs go to `systemActions` collection or nested under admin?
2. **Simulation execution**: Should there be a separate admin flag to enable real execution during simulation tests?
3. **Notification channels**: What notification methods to use for deadline events (email, push, in-app)?
4. **Retention policy**: How long to keep audit logs and simulation action logs?
5. **Multi-timezone**: Should timezone be configurable or always IST?
