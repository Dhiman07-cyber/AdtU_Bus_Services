# ADTU Bus Services - Supabase Migration & Integration Plan

## Overview

This document outlines the complete migration and integration plan for moving audit logs and payments from Firestore to Supabase, including rollback functionality and annual export/cleanup automation.

---

## 📁 Files Created

### SQL Schema
- `supabase/migrations/003_reassignment_logs_payments.sql`
  - Creates `reassignment_logs` table (replaces Firestore `audit_logs`)
  - Creates `payments` table (migrated from Firestore)
  - Creates `payment_exports` table (tracks annual exports)
  - Includes indexes, RLS policies, helper functions

### Migration Scripts
- `scripts/migrate_firestore_to_supabase.js`
  - Migrates `payments` collection → Supabase `payments` table
  - Migrates `audit_logs` collection → Supabase `reassignment_logs` table
  - Supports `--dry` mode for verification
  - Uses chunked upserts for safe migration

- `scripts/yearly_payment_export_and_cleanup.js`
  - Exports payments for academic year to CSV
  - Emails CSV to admin
  - Archives to Supabase Storage
  - Optional cleanup with `--cleanup` flag

### Server-Side Services
- `src/lib/services/reassignment-logs-supabase.ts`
  - Full TypeScript service for reassignment logs
  - Write/read operations
  - Rollback validation and execution
  - Cleanup functions

### API Routes
- `src/app/api/reassignment-logs/route.ts`
  - GET: Query logs with filters (type, status, pagination)
  - POST: Create new log entries

- `src/app/api/reassignment-logs/rollback/route.ts`
  - GET: Validate rollback feasibility
  - POST: Execute rollback operation

---

## 🚀 Step-by-Step Deployment Guide

### Phase 1: Database Setup (Day 1)

1. **Run SQL Migration in Supabase**
   - Go to Supabase Dashboard → SQL Editor
   - Copy contents of `supabase/migrations/003_reassignment_logs_payments.sql`
   - Execute the SQL
   - Verify tables created: `reassignment_logs`, `payments`, `payment_exports`

2. **Create Storage Bucket**
   - Go to Storage → Create new bucket: `exports`
   - Set as private bucket
   - File size limit: 50MB

3. **Verify RLS Policies**
   - Tables should have read access for authenticated users
   - Write access restricted to service_role

### Phase 2: Migration Testing (Day 2-3)

1. **Install Dependencies**
   ```bash
   npm install json2csv nodemailer yargs
   ```

2. **Run Dry Migration**
   ```bash
   cd "c:\Users\DHIMAN SAIKIA\OneDrive\Desktop\Schedule - Binoy\Home-Task\Personal_S"
   node scripts/migrate_firestore_to_supabase.js --dry --verbose
   ```

3. **Review Output**
   - Check sample records
   - Verify field mappings
   - Confirm counts match

4. **Run Actual Migration**
   ```bash
   node scripts/migrate_firestore_to_supabase.js
   ```

5. **Verify Migration**
   ```bash
   node scripts/migrate_firestore_to_supabase.js --verify
   ```
   - Compare Firestore vs Supabase counts
   - Verify sample records

### Phase 3: Backend Integration (Day 4-5)

#### Update net-assignment-service.ts

Add logging to Supabase after successful commits:

```typescript
import { reassignmentLogsService, ChangeRecord } from './reassignment-logs-supabase';

// In commitNetChanges function, after successful transaction:
async function commitWithLogging(
  netChanges: Map<string, NetBusChange>,
  driverFinalState: Map<string, DriverFinalState>,
  adminUid: string,
  adminLabel: string,
  stagingSnapshot?: StagedOperation[]
): Promise<CommitNetChangesResult> {
  
  // Generate operation ID
  const operationId = reassignmentLogsService.generateOperationId('driver_reassignment');
  
  // Build changes array for logging
  const changes: ChangeRecord[] = [];
  
  for (const [busId, change] of netChanges) {
    changes.push({
      docPath: `buses/${busId}`,
      collection: 'buses',
      docId: busId,
      before: {
        assignedDriverId: change.prevAssignedDriverId,
        assignedDriverName: change.prevAssignedDriverName,
      },
      after: {
        assignedDriverId: change.newAssignedDriverId,
        assignedDriverName: change.newAssignedDriverName,
      },
    });
  }
  
  for (const [driverId, state] of driverFinalState) {
    changes.push({
      docPath: `drivers/${driverId}`,
      collection: 'drivers',
      docId: driverId,
      before: {
        busId: state.initialBusId,
        isReserved: false,
      },
      after: {
        busId: state.finalBusId,
        isReserved: state.isReserved,
      },
    });
  }
  
  // Insert pending log BEFORE commit
  await reassignmentLogsService.insertLog({
    operationId,
    type: 'driver_reassignment',
    actorId: adminUid,
    actorLabel: adminLabel,
    status: 'pending',
    summary: `Driver assignment: ${netChanges.size} bus changes, ${driverFinalState.size} driver updates`,
    changes,
    meta: { stagingSnapshot },
  });
  
  try {
    // Execute the commit (existing logic)
    const result = await commitNetChanges(netChanges, driverFinalState, adminUid, stagingSnapshot);
    
    // Update log status based on result
    await reassignmentLogsService.updateLogStatus(
      operationId,
      result.success ? 'committed' : 'failed',
      result.success ? undefined : { error: result.message }
    );
    
    return result;
  } catch (err) {
    await reassignmentLogsService.updateLogStatus(operationId, 'failed', { error: err.message });
    throw err;
  }
}
```

#### Update API Routes That Write Audit Logs

Replace Firestore audit_logs writes with Supabase calls. Example for existing routes:

```typescript
// BEFORE (Firestore)
await adminDb.collection('audit_logs').add({
  action: 'student_reassignment',
  actorId: session.uid,
  actorName: session.name,
  details: { ... },
  timestamp: new Date(),
});

// AFTER (Supabase)
import { reassignmentLogsService } from '@/lib/services/reassignment-logs-supabase';

await reassignmentLogsService.insertLog({
  operationId: `student_reassignment_${Date.now()}`,
  type: 'student_reassignment',
  actorId: session.uid,
  actorLabel: `${session.name} (${session.role})`,
  status: 'committed',
  summary: 'Student reassignment operation',
  changes: [{
    docPath: `students/${studentId}`,
    collection: 'students',
    docId: studentId,
    before: { busId: oldBusId },
    after: { busId: newBusId },
  }],
});
```

### Phase 4: View History UI Integration (Day 6)

Update the Driver Reassignment page to fetch from Supabase:

```typescript
// In driver assignment page component
const fetchReassignmentHistory = async () => {
  const response = await fetch('/api/reassignment-logs?type=driver_reassignment&limit=10');
  const { data, pagination } = await response.json();
  setHistory(data);
};
```

Add rollback button (Admin only):

```typescript
const handleRollback = async (operationId: string) => {
  // First validate
  const validateRes = await fetch(`/api/reassignment-logs/rollback?operationId=${operationId}`);
  const { canRollback, conflicts } = await validateRes.json();
  
  if (!canRollback) {
    alert(`Cannot rollback: ${conflicts.join(', ')}`);
    return;
  }
  
  // Execute rollback
  const res = await fetch('/api/reassignment-logs/rollback', {
    method: 'POST',
    body: JSON.stringify({
      operationId,
      actorId: currentUser.uid,
      actorLabel: `${currentUser.name} (Admin)`,
    }),
  });
  
  const result = await res.json();
  if (result.success) {
    alert('Rollback successful!');
    fetchReassignmentHistory(); // Refresh
  }
};
```

### Phase 5: Annual Export Scheduling (Day 7)

#### Option A: Cloud Scheduler (GCP)

1. Deploy yearly export as Cloud Function
2. Set up Cloud Scheduler job for July 31, 00:05 IST

#### Option B: System Config Trigger

Add to system-config page:
- "Run Annual Export" button
- Triggers `yearly_payment_export_and_cleanup.js`

#### Test Export

```bash
# Dry run
node scripts/yearly_payment_export_and_cleanup.js --dry --year=2024

# Actual export (no cleanup)
node scripts/yearly_payment_export_and_cleanup.js --year=2024

# Export with cleanup (CAUTION!)
node scripts/yearly_payment_export_and_cleanup.js --year=2024 --cleanup
```

### Phase 6: Validation & Cutover (Day 8-10)

1. **Parallel Operation**
   - Keep Firestore writes running for 1 week
   - Compare Supabase and Firestore data

2. **Switch to Primary**
   - Make Supabase the primary source
   - Keep Firestore read-only

3. **Cleanup (After 2 Weeks)**
   - Delete migrated Firestore documents
   - Remove legacy code paths

---

## 🔐 Security Considerations

### Environment Variables Required

```env
# Supabase (already configured)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# For email (annual export)
ADMIN_EMAIL=admin@example.com
GMAIL_USER=myaccount@gmail.com
GMAIL_PASS=app-password-here
```

### Access Control

- **Service Role Key**: Server-side only, never exposed to client
- **Anon Key**: Client-side safe, respects RLS policies
- **RLS Policies**: All tables have read access for authenticated users, write restricted to service_role

---

## 📊 Data Retention Rules

### reassignment_logs
- Keep last 3 operations per type by default
- Can be increased via `cleanup_old_reassignment_logs()` function
- Run cleanup after each new commit or as scheduled job

### payments  
- Exported and deleted annually (July 31)
- Archive stored in Supabase Storage for 7 years (compliance)
- Export receipt stored in `payment_exports` table

---

## 🧪 Testing Checklist

### Migration Tests
- [ ] Dry run completes without errors
- [ ] Payment counts match (Firestore vs Supabase)
- [ ] Audit log counts match
- [ ] Sample records verified (10 random payments, 5 audit logs)
- [ ] All field mappings correct

### Integration Tests
- [ ] New driver assignment creates log in Supabase
- [ ] View History shows Supabase data
- [ ] Rollback validation works (conflicts detected)
- [ ] Rollback execution reverts Firestore state
- [ ] Rollback creates new rollback log entry

### Export Tests
- [ ] CSV generated correctly
- [ ] Email sent with attachment
- [ ] Archive uploaded to Supabase Storage
- [ ] Export recorded in payment_exports table
- [ ] Cleanup deletes correct records (with --cleanup)

---

## 🆘 Rollback Plan (Emergency)

If migration fails:

1. **Stop Supabase Writes**
   - Comment out Supabase logging calls
   - Revert to Firestore-only writes

2. **Restore Firestore as Primary**
   - Re-enable Firestore audit_logs writes
   - Clear Supabase tables if needed

3. **Investigate Issues**
   - Check error logs
   - Validate data integrity
   - Fix root cause before retrying

---

## 📞 Support Contacts

- **Supabase Issues**: docs.supabase.com
- **Firebase Issues**: firebase.google.com/support
- **Project Lead**: [Your contact]

---

## 📅 Timeline Summary

| Day | Phase | Tasks |
|-----|-------|-------|
| 1 | Database Setup | Run SQL, create bucket, verify policies |
| 2-3 | Migration Testing | Dry run, actual migration, verification |
| 4-5 | Backend Integration | Update services, API routes |
| 6 | UI Integration | View History, Rollback button |
| 7 | Export Scheduling | Test export, set up scheduler |
| 8-10 | Validation | Parallel operation, cutover, cleanup |

---

*Last updated: December 2024*
