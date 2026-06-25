# Database Audit - Storage & Schema Integrity Review

## 1. Executive Summary
The database layer uses a **Dual-Database hybrid model** (Firestore + Supabase/PostgreSQL) to optimize performance, scalability, and cost. While profiles and system configs are stored in Firestore, high-frequency location data, trip states, and financial transaction records reside in PostgreSQL. RLS policies and database constraints enforce data integrity, and a self-healing reconciliation script repairs capacity discrepancies between databases.

* **Schema Cleanliness:** 8/10
* **Index Configuration:** 9/10
* **Transactional Integrity:** 8/10
* **Operational Maintenance:** 7/10

---

## 2. Purpose of Subsystems
* **Firestore:** Houses student, driver, moderator, and admin profiles, routes, buses, and configuration metrics.
* **Supabase PostgreSQL:** Stores real-time tracking updates, active trip locks, driver swaps, waiting flags, and the immutable financial payment ledger.

---

## 3. Database Inventories & Index Setup

### A. Supabase PostgreSQL Tables & Indices
The PostgreSQL database consists of 9 core tables:
* `payments`: Stores encrypted payment transactions. Includes indexes on `student_uid` and `transaction_date DESC`.
* `active_trips`: Manages trip statuses and locks. Protected by a unique index `idx_active_trips_bus_active` preventing duplicate active trips for a bus.
* `bus_locations` & `driver_location_updates`: Stores coordinates and historical location breadcrumbs. Optimized with indexes on timestamp.
* `waiting_flags`: Manages student wait signals.
* `driver_swap_requests` & `temporary_assignments`: Manages driver swap schedules.
* `reassignment_logs`: Stores audit records for reassignments.
* `device_sessions`: Tracks active sessions per user.

### B. Firestore Collections & Indices
Firestore uses standard collection structures:
* `users` (profiles with uid keys)
* `students`, `drivers`, `moderators`, `admins` (role-specific tables)
* `buses`, `routes`, `applications`
* `notifications`, `renewal_requests`

Composite indexes are configured for `notifications` (sorting by recipient and date) and `scans` (tracking check-in times by driver or student).

---

## 4. End-to-End Database Synchronization & Reconciliation
Since Firestore and Supabase lack native cross-database transactions, the system implements a self-healing routine:
1. **Reconciliation Trigger:** During the daily `cleanup-expired-students` run, `adminReconcileBusLoads()` executes.
2. **Profile Read:** The script queries all Firestore documents in `students` where status is active or soft_blocked.
3. **Seat Recount:** It counts seats for each bus, normalizing shift codes to match the allocation logic.
4. **Counter Write:** A transaction updates the bus document's capacity counters in Firestore (`load.totalCount`, `load.morningCount`, etc.). If a discrepancy is greater than 5, an admin alert is triggered, but counters are still updated to match the profile database.

---

## 5. Security & Isolation Strategy
* **Symmetric Encryption (CONFIRMED):** In `public.payments`, sensitive column values (`student_id`, `student_name`, `offline_transaction_id`) are encrypted using AES-256-GCM.
* **Database Immutability (CONFIRMED):** Supabase `payments` table RLS policies deny delete operations (`FOR DELETE USING (false)`), preventing developers or staff from modifying financial history.

---

## 6. Failure Scenarios & Database Edge Cases

### A. Bus Capacity Collision on Reclaim
* **Scenario:** A student renews their service, but the original bus is full.
* **Impact:** The pre-check returns a `409` status code and rejects the approval, keeping the request pending and preventing data inconsistencies.

### B. SQL Script Warnings on Fresh Initialization
* **Scenario:** Executing `COMPLETE_SCHEMA.sql` on a new Supabase project produces SQL warnings.
* **Impact (CONFIRMED):** The script contains duplicate CREATE TABLE statements for `driver_location_updates` and `route_cache` (lines 94-122 and 289-322). PostgreSQL handles the duplicate check safely, but the duplicate code increases file maintenance overhead.

---

## 7. Technical Debt
* **CONFIRMED:** `COMPLETE_SCHEMA.sql` contains duplicate table definition code.
* **CONFIRMED:** Firestore security rules verify user roles using `exists()` calls, increasing document read counts and transaction billing.

---

## 8. Production Risks & Recommendations

### Finding: Duplicate SQL Table Definitions in COMPLETE_SCHEMA.sql
* **Severity:** Low
* **Real-world Impact:** Increases repository clutter and file maintenance complexity.
* **Immediate Recommendation:** Clean up duplicate SQL definitions in `supabase/COMPLETE_SCHEMA.sql`.

### Finding: Firestore rule helper reads increase quota consumption
* **Severity:** High
* **Real-world Impact:** Multiplies Firestore billing charges for role lookups under high user traffic.
* **Immediate Recommendation:** Configure Custom Claims in Firebase Auth to assign roles, and verify roles in rules using `request.auth.token.role` to eliminate database read dependencies.

---

## 9. Cross-References
* Firebase security configuration: [05_FIREBASE_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/05_FIREBASE_AUDIT.md)
* Supabase RLS security details: [06_SUPABASE_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/06_SUPABASE_AUDIT.md)
