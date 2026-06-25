# Documentation Gaps - Code vs. Specs Discrepancy Review

## 1. Executive Summary
This document registers the confirmed discrepancies between the system documentation (README.md) and the actual repository implementation. The audit uncovered several inconsistencies, including dead configuration scripts, a missing API endpoint, and mismatched cron execution schedules.

* **Documentation Consistency:** 6/10
* **Configuration Safety:** 7/10
* **Operational Alignment:** 6/10

---

## 2. Confirmed Discrepancies & Code Gaps

### A. Stale Lock Cleanup Schedule Mismatch
* **Documentation (README.md):** States that stale lock cleanup runs "minutely & hourly" to release driver locks.
* **Code Implementation (`vercel.json`):** Configures the cron schedule for `/api/cron/cleanup-stale-locks` to run once daily at 4:00 AM (`0 4 * * *`).
* **Impact (CONFIRMED):** If a driver's app crashes, the bus remains locked for the rest of the day, blocking other drivers from operating the vehicle.

### B. Heartbeat Timeout Configuration Mismatch
* **Documentation (README.md):** Claims that driver locks automatically release after 60 seconds of inactivity.
* **Code Implementation (`trip-lock-service.ts` & `cleanup-stale-locks/route.ts`):** Sets `HEARTBEAT_TIMEOUT_SECONDS = 300` (5 minutes).
* **Impact (CONFIRMED):** The lockout window is 5 minutes instead of the documented 1 minute, delaying vehicle handovers during shifts.

### C. Missing `api/cron/annual-export` API Endpoint
* **Documentation (README.md):** Describes a yearly cron task that calls `api/cron/annual-export` to archive transaction logs.
* **Code Implementation:** The route handler is missing from the `src/app/api/cron/` directory.
* **Impact (CONFIRMED):** The cron request fails with a `404` status code. Year-end logs cannot be archived, causing database storage growth.

### D. Dead Script References in `package.json`
* **Configuration:** `package.json` defines several commands for database maintenance:
  * `fix-schema` (points to `scripts/fix-firestore-schema.ts`)
  * `migrate:firestore` (points to `scripts/migrate-firestore-schema.ts`)
  * `check-firestore-safety` (points to `scripts/checkOnSnapshot.js`)
* **Code Implementation:** These files are missing from the `scripts` directory.
* **Impact (CONFIRMED):** Running these npm commands returns file-not-found errors.

### E. Missing Backup & Disaster Recovery Runbook
* **Gaps:** The documentation does not outline backup protocols for Firestore and Supabase databases.

---

## 3. Production Risks & Recommendations

### Finding: Critical Stale Lock Cron Delay
* **Severity:** High
* **Real-world Impact:** Stale locks block bus operations for hours, disrupting transit schedules.
* **Immediate Recommendation:** Update the cron schedule for `/api/cron/cleanup-stale-locks` in `vercel.json` to run every 5 minutes.

### Finding: Dead NPM Script References in package.json
* **Severity:** Medium
* **Real-world Impact:** Confuses university deployers trying to execute database schemas fix routines.
* **Immediate Recommendation:** Remove dead script references from `package.json` or restore the missing scripts in the `scripts` directory.

---

## 4. Cross-References
* Deployment Audit settings: [13_DEPLOYMENT_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/13_DEPLOYMENT_AUDIT.md)
* API Auditing details: [09_API_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/09_API_AUDIT.md)
