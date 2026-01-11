# ADTU Smart Bus Management System — Complete Implementation Summary

## 1. System philosophy (core invariants)

*   **State-Driven Architecture**: The system is state-driven, lifecycle-aware, and time-dependent. Features depend on object state (e.g., student verification status) and per-student session years rather than global absolute dates.
*   **Template-Based Config**: `deadline-config.json` acts only as a **template** (stores months/days), never stores years. Years are derived dynamically from each student's `sessionEndYear`.
*   **Deterministic & Reversible**: All critical actions (assignments, swaps, archival) are deterministic, testable in Simulation Mode, and either atomic (via Firestore Transactions) or safely reversible.
*   **Hybrid Storage Strategy**: Minimize Firestore storage. High-volume/archival data (logs, payments) is stored in Supabase; Firestore contains active operational state and minimal permanent history.

---

## 2. Student lifecycle & onboarding (implemented)

**Purpose:** Safe, fraud-resistant onboarding granting bus access only to verified, paid students.

*   **Form capture**
    *   Collects personal details, academic details, route preference, pickup point, and email at submission.
    *   Validates input schemas using Zod.
*   **Payment paths**
    *   **Online**: Integrated with **Razorpay**. A successful callback triggers server-side verification and an immediate approval pipeline (no human intervention required).
    *   **Offline**: Student uploads receipt/transaction reference via Cloudinary. A moderator verifies the physical/offline payment in the bus office.
*   **Verification System**:
    *   Moderator issues a **6-digit verification code** (cryptographically generated).
    *   Student enters this code to prove physical presence/verification, enabling final submission.
*   **Approval & audit**
    *   Admins and moderators can approve applications; approver identity is recorded in the student document.
    *   Receipt screenshots are removed after verification to conserve storage.
*   **Outcome**
    *   Verified students obtain bus service access.
    *   Initial `sessionStartYear`, `sessionEndYear`, and `validUntil` fields are recorded in Firestore.

**Stability Features:**
*   Missing email at submission automatically fixed.
*   Concurrent submissions handled by server-side validation and transaction-safe writes.

---

## 3. Payments architecture & flow (IMMUTABLE LEDGER)

> ⚠️ **CRITICAL ARCHITECTURE RULES:**
> 1. **Supabase `payments` table is the SINGLE SOURCE OF TRUTH** for all payment records.
> 2. **NEVER delete rows** from the payments table.
> 3. **NEVER migrate payments** to Firestore or any other system.
> 4. **Payments are PERMANENT** financial records (5-10+ years).
> 5. The table is **append-only** with status updates allowed (Pending → Completed).

**Design:** Supabase is the permanent, immutable payment ledger. Firestore is NOT used for payments.

*   **Single Source of Truth**: The Supabase `payments` table stores ALL payment transactions (online/offline). This data is permanent and must remain queryable forever.
*   **Server-only writes**: Payments are inserted/updated from the backend using the Supabase Service Role key (clients never hold DB keys).
*   **Immutable Records**: Once a payment is created, it cannot be deleted. Status can only transition from `Pending` to `Completed`.
*   **RLS Protection**: Database-level RLS policies block ALL delete operations on the payments table.

**Annual Export (SAFE - READ ONLY):**
*   Triggered via Cron (`/api/cron/annual-export`) or manual script.
*   **Step 1**: Query Supabase payments for the specified financial year.
*   **Step 2**: Generate a premium PDF Audit Report (via Puppeteer).
*   **Step 3**: Email the report to Admin with CSV attachment.
*   **Step 4**: Upload CSV to Supabase Storage (optional archival backup).
*   **Step 5**: Record export in `payment_exports` table (audit trail).
*   ⚠️ **NO CLEANUP**: Payment records are NEVER deleted after export.

**Student Payment History:**
*   Students read payment history **directly from Supabase** via `/api/student/payment-history`.
*   Supports pagination for long-term queries (5-10+ years of history).
*   Firestore `paymentHistory` field is DEPRECATED and not used.

**Multi-Year Usage:**
*   The system supports safe operation for 5-10+ years without manual cleanup.
*   Payment data grows append-only and remains fully queryable.
*   Export reports can be generated for any historical date range.

---



## 4. Renewal & time-based logic (implemented)

**Core rule:** System config stores month/day only; student session years decide effective year.

*   **Config fields (no year)**:
    *   `renewalMonth/day`, `softBlockMonth/day`, `hardBlockMonth/day`, `notificationStartMonth/day`.
*   **Per-student derived dates (computed, not stored)**:
    *   **Renewal Deadline**: `{renewalDay}/{renewalMonth}/{sessionEndYear}`
    *   **Soft Block**: `{softBlockDay}/{softBlockMonth}/{sessionEndYear}`
    *   **Hard Block**: `{hardBlockDay}/{hardBlockMonth}/{sessionEndYear + 1}`
*   **Soft Block behavior**:
    *   Limits access to bus tracking and pass features.
    *   `StudentAccessBlocked.tsx` component renders, preventing access to core features while preserving data.
*   **Hard Block behavior**:
    *   After the grace period (next-cycle), the system performs a permanent deletion sequence: Student Firestore doc, Auth user (Firebase Auth), and Cloudinary images are removed.
    *   Deletions require rigorous safety checks and generate an audit log.

**Edge Cases:**
*   Leap-year handling: Anchor dates are normalized.
*   Students missing `sessionEndYear` are flagged for admin attention and excluded from automated deletion.

---

## 5. Simulation Mode (implemented)

**Purpose:** Test lifecycle and cron logic without waiting for real time.

*   **Mechanism**: Admin toggles Simulation Mode and sets a `simulationDate`.
*   **Effect**: When on, all time-based logic (cron jobs, route guards, UI date checks) reads from `simulationDate` instead of real `Date.now()`.
*   **Safety**: Simulation Mode **does not** perform destructive deletes.
    *   Destructive actions (like Hard Delete) are logged to a `simulationActions` record.
    *   They must be explicitly permitted with an `executeSimulationActions` flag (multi-step, admin-only) to actually run.

---

## 6. Routes & Buses architecture (implemented)

**Canonical split:** Routes vs Buses.

*   **Routes (`routes/{routeId}`)**:
    *   Canonical route definitions: `name`, `stops[]`, `stopSequence`, `totalStops`.
*   **Buses (`buses/{busId}`)**:
    *   Operational instances referencing `routeRef`.
    *   Caches `routeName`, `stops`, `totalStops`, and `estimatedTime` for high-performance read queries.
*   **Design rules**:
    *   Routes are canonical; buses reference routes (no embedded duplicate route definitions).
    *   When viewing a route, the system derives assigned buses with a query `buses.where(routeId == routeId)` (not a reverse-embedded list).

**Robustness**:
*   If a fetched bus document is missing route info, defensive logic skips or flags it, preventing UI crashes.

---

## 7. Edit bus rules & transactional constraints (implemented)

**Purpose:** Banning edits that break database integrity.

*   **Rules Enforced (Server-side Firestore Transactions)**:
    *   Capacity must be ≥ `currentMembers`.
    *   `currentMembers` is rigorously calculated as `morning + evening` (Per-shift logic).
    *   Removing a shift is blocked if members exist for that shift.
    *   Driver change is blocked if an active trip exists.
    *   Route changes must sync cached fields (`routeId`, `routeName`, `stops`, `totalStops`).
*   **Atomicity**: All edits include `updatedAt` timestamps and run atomically.

---

## 8. Driver swap system (implemented)

**Purpose:** Temporary duty handovers without admin overhead.

*   **Workflow**: Driver initiates swap -> Selects target -> Sets time window.
*   **Swap States**: `Pending`, `Accepted`, `Rejected`, `Auto-expired`.
*   **Atomic Transactions (`DriverSwapService`)**:
    *   **Validations**: Checks active trips, current assignments, and "Reserved" status.
    *   **Swap Types**: 
        *   **True Swap**: Two drivers exchange buses.
        *   **Assignment**: An active driver hands over to a "Reserved" driver.
    *   **Revert**: Expiration or manual end reverts all drivers and buses to their original state.
*   **Cleanup**: Rejected or expired swaps are deleted to avoid audit bloat; only "Accepted" swaps generate audit logs.

**UX**: Mobile-first design with consistent ephemeral interactions.

---

## 9. Smart Reassignment Engine (students) — Core Feature (implemented)

**Purpose:** Auto-suggest and execute student reassignment for load balancing.

*   **Stage 1: Staging**:
    *   Admin selects students (no DB changes).
    *   System groups students by `stopId` + `shift`.
*   **Stage 2: Candidate Selection**:
    *   Filters buses that include the `stopId`.
    *   **Shift Compatibility**:
        *   Morning Student → Morning or Both bus.
        *   Evening Student → Both bus only.
    *   **Per-Shift Availability**: Checks `capacity - morningCount` and `capacity - eveningCount` independently.
    *   **Overload Prevention**: For `Both` buses, both morning and evening loads are checked to prevent the "cross-addition" bug.
*   **Stage 3: Auto-split**:
    *   Each group is assigned independently; partial successes are allowed.
*   **UI/Analysis**: Bus cards show current load, predicted load, and capped visual bars.
*   **Confirmation Flow**:
    *   Staging → Preview → Confirm Modal → **120s Revert/Confirm Window**.
    *   Only on "Commit" do server-side writes occur.
*   **Atomic Commit**:
    *   Writes performed inside a huge Firestore transaction.
    *   Updates: Student doc (`busId`, `routeId`, `updatedAt`), Bus doc (decrements old, increments new, recalculates overload).
    *   Failure triggers full rollback.

---

## 10. Driver reassignment & route allocation (implemented)

**Features:**
*   **Batch Reassignments**: Admin can select multiple driver→bus changes; staging area supports multi-edit.
*   **Staging Area Semantics**:
    *   Handles cases where selected drivers are already assigned.
    *   "Reserved" drivers are a special state; operations moving someone to Reserved update driver state accordingly.
*   **Double-Swap Detection**:
    *   Server computes final mapping and removes no-op cycles (A→B then B→A cancels out).
    *   Only net changes are written to DB.
*   **Confirmation Flow**:
    *   Sorted confirmation table by Employee ID.
    *   Shows: `Initial`, `Final`, `Initial Driver`, `Final Driver`.
    *   **120s Revert window** ensures safety.
*   **Atomic Commit**:
    *   Bus docs update `assignedDriverId` / `activeDriverId`.
    *   Driver docs update `assignedBusId` / `isReserved`.
*   **Rollback**:
    *   Supabase `reassignment_logs` snapshot used to revert.
    *   Validates current state equals `after` snapshot before applying `before`.

---

## 11. Audit & logs (implemented; Supabase-backed)

**Design & Implementation:**

*   **Location**: **Supabase `reassignment_logs`** (JSONB table).
*   **Reason**: Conserve expensive Firestore storage.
*   **Content**: `operation_id`, `type` (`driver`/`route`/`student`), `actor` (Admin Name/ID), `status` (`pending`/`committed`/`rolled_back`/`failed`), `changes` (before/after snapshots).
*   **Write Ordering**:
    1.  Create `pending` log (Supabase) before commit.
    2.  Commit Firestore writes.
    3.  Update Supabase log to `committed`.
*   **Retention**: Configurable retention of N snapshots per op-type.

---

## 12. Data location summary (implemented)

*   **Firestore**: Operational state (`students`, `buses`, `drivers`, `routes`), `busPassScans` (TTL). **NOT used for payments.**
*   **Supabase** (Primary Storage):
    *   `payments` table — **IMMUTABLE FINANCIAL LEDGER** (permanent, never deleted).
    *   `payment_exports` table — Export audit trail.
    *   `reassignment_logs` table — Audit snapshots (JSON).
    *   **Storage** — CSV exports & archived reports.
*   **Access Pattern**: All writes to Supabase are performed **server-side only** via API routes.

---

## 13. Bus pass scanning & cleanup (implemented)

*   **Storage**: Scans saved in `busPassScans` collection.
*   **Data**: `studentId`, `busId`, `scannedAt`, `passValidTill`, `deviceId`, `verified`.
*   **Cleanup**: Scanner logs are auto-deleted when `passValidTill < today` (TTL) to avoid Firestore bloat.

---

## 14. Cron jobs & scheduler (implemented)

*   **Daily (Off-peak)**:
    *   Renewal notifications (near-term window).
    *   Soft-block checks & application for today.
*   **Annual Export (READ-ONLY)**:
    *   Triggered via `/api/cron/annual-export`.
    *   Queries Supabase payments (no modification).
    *   Generates PDF report → Emails Admin.
    *   ⚠️ **NO CLEANUP**: Payments are permanent and never deleted.
*   **Simulation Compatibility**: Cron jobs use `simulationDate` if Simulation Mode is ON.
*   **Performance**: Jobs run in chunks, use cursors, and leverage indices to avoid full collection scans.

---

## 15. Transactions, idempotency & fail-safes (implemented)

*   **Idempotency Keys**: `operation_id` used for commit/rollback endpoints.
*   **Two-Phase Commit**:
    1.  Server-side dry-run + Pending Supabase log.
    2.  Transactional Firestore writes + Mark `committed`.
*   **Chunking**: Large writes (e.g., Annual Archival) are divided into batches.
*   **Preconditions**: Safety checks (document `updateTime`) prevent lost updates.

---

## 16. Security & RBAC (implemented)

*   **Roles**: `student`, `driver`, `moderator`, `admin`.
*   **Supabase Security**: Service-role key stored on **server only**.
*   **Firestore Rules**: Updated to BLOCK legacy client-side writes to `payments` and `audit_logs`.
*   **Admin-Only Endpoints**: Rollback, Exports, Destructive Operations, and Simulation Execution require rigorous checks.

---

## 17. Testing & QA (implemented)

*   **Unit Tests**: Date calculations (renewal/soft/hard), double-swap dedupe, candidate bus selection.
*   **Integration Tests**: Preview → Pending Log → Commit → Verify Supabase Log.
*   **E2E Tests**: Onboarding → Payment → Verification → Assignment → Renewal Simulation.
*   **Canary Strategy**: Scheduled archive job runs as a "Dry Run" first.

---

## 18. Migration & cutover (completed)

*   Supabase schema initialized (`payments`, `reassignment_logs`).
*   Migration scripts available (`scripts/migrate_firestore_to_supabase.js`) with `--dry` mode.
*   Firestore writes to legacy collections disabled via Rules.
*   **Cutover Procedure**: Migrate -> Verify -> Update Code -> Switch Read/Write -> Cleanup.

---

## 19. Monitoring & alerts (implemented)

*   **Metrics**: Failed transactions, cron job failures, Supabase storage usage.
*   **Alerts**: High failed commits, export email failures.
*   **Logging**: Centralized logging keyed by `operation_id`.

---

## 20. Edge cases handled (explicit list)

*   **Double-swap Cancellation**: A→B then B→A cycles removed before DB writes.
*   **Shift Capacity**: `Morning` vs `Evening` load tracked independently for `Both` shift buses.
*   **Missing Route Data**: Defensive checks skip malformed buses prevents UI crashes.
*   **Payment History**: Archival job normalizes missing/corrupt history before appending.
*   **Missing Session Data**: Students without `sessionEndYear` flagged, never deleted.
*   **Simulation Safety**: Destructive actions are **never** executed without explicit multi-step override.

---

## 21. Final acceptance checklist (Status: ✅ Completed)

*   [x] **Student Onboarding**: Online/Offline paths, Anti-fraud verification.
*   [x] **Payment Architecture**: Razorpay integration, Supabase storage, Safe Archival pipeline.
*   [x] **Lifecycle Logic**: `sessionStart`/`End` years, Time-based Soft/Hard blocking.
*   [x] **Simulation Mode**: Time-travel testing with safety locks.
*   [x] **Routes/Buses**: Canonical split, cached references.
*   [x] **Smart Reassignment**: Staging, per-shift capacity, auto-split, 120s revert.
*   [x] **Driver Swaps**: Ephemeral, atomic, documented.
*   [x] **Audit Trails**: JSONB logs in Supabase (Cost-efficient).
*   [x] **Cron System**: Daily maintenance & Quadrennial financial exports.
*   [x] **Migration**: Scripts & Security Rules in place.
*   [x] **Security**: RBAC, Server-side secrets, Input validation.

---

## One-line summary

A **deterministic, lifecycle-aware Smart Bus Management System** that handles onboarding, real-time bus allocation, secure payments, and reliable renewal lifecycles with simulation-enabled testing, atomic reassignments, and reversible audits — designed to be production-grade and storage-efficient by offloading high-volume data to Supabase while keeping Firestore minimal and consistent.

---

**Version**: 2.1.0 (Quadrennial Update)  
**Maintained by**: ADTU IT Team
