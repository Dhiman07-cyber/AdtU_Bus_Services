# Observability Audit - Logs, Alerts & Auditing Review

## 1. Executive Summary
The system implements a structured **Two-Tiered Audit Service** mapping operational telemetries and critical mutations into Firestore collections (`activity_logs`). It includes self-healing mechanisms for transaction failures via an outbox recovery pattern. However, server-side API execution logging is dependent on console standard output, presenting a operational vulnerability due to the absence of centralized log aggregation or crash alerting.

* **Audit Trailing Durability:** 9/10
* **Log Structure & Consistency:** 7/10
* **Alerting & Notification Systems:** 7/10
* **Metrics & Analytics Coverage:** 6/10

---

## 2. Purpose of Subsystem
Observability configurations are designed to:
1. Guarantee non-repudiation of administrative mutations (e.g. driver reassignments or manual approvals).
2. Trace background worker routines (e.g. student pruning and stale lock cleanups).
3. Capture API exceptions and operational drifts.
4. Notify system administrators of capacity ceiling overflows.

---

## 3. Subsystem Architecture & Implementation

### Two-Tiered Audit Service (`audit-service.ts`)
* **TIER A (Mutations):** Entitlement modifications and capacity updates are written inside Firestore database transactions using `writeAuditInTransaction()`. The audit record is committed atomically alongside the change.
* **TIER B (Telemetry):** Background notifications and cron job telemetries are written using `recordOperationalEvent()`. If the write fails, the system logs the event in the `audit_failures` collection, which can be replayed and restored using `replayAuditFailures()`.

---

## 4. End-to-End Audit Log Processing Flow
1. **Mutation Event:** A moderator approves a payment. The API opens a Firestore transaction.
2. **Authoritative Write:** The transaction updates the student document and inserts an audit log document containing:
   * Action code: `'renewal_request_approved'`
   * Target metadata and IDs.
   * State snapshots before and after the modification.
3. **Operational Log:** A daily student sweep runs. It logs actions using `recordOperationalEvent()`.
4. **Outbox Recovery:** If a Firestore write fails, the event is saved to `audit_failures`. Administrators can invoke recovery endpoints to restore these records.

---

## 5. Security & Privacy Observations
* **PII Protection (CONFIRMED):** In `audit-service.ts`, before/after snapshot fields store encrypted IDs and display values. Decrypted data is excluded from audit logs, preventing database exposure.
* **Non-Repudiation (CONFIRMED):** Transactional records capture the approver's Firebase UID, email address, and role.

---

## 6. Failure Scenarios & Observability Gaps

### A. Missing Centralized Log Aggregation
* **Scenario:** Next.js serverless API routes crash on Vercel due to runtime exceptions.
* **Impact (CONFIRMED):** Log entries are written to standard output (`console.error`). There is no log aggregator configured, meaning errors go unnoticed unless developers manually inspect Vercel dashboards.

### B. Missing Endpoint for Year-End Log Archiving
* **Scenario:** The annual database export cron task triggers.
* **Impact (CONFIRMED):** The request fails with a `404` status code because the documented `api/cron/annual-export` endpoint is missing from the codebase.

---

## 7. Technical Debt
* **CONFIRMED:** The documented `api/cron/annual-export` endpoint is missing.
* **CONFIRMED:** `package.json` contains several scripts pointing to missing files in the `scripts` directory.

---

## 8. Production Risks & Recommendations

### Finding: No Centralized Server Log Aggregator
* **Severity:** Critical
* **Real-world Impact:** System errors and API crashes occur silently, delaying problem resolution.
* **Immediate Recommendation:** Configure log forwarding (e.g. Axiom, Datadog) using Vercel integrations.

### Finding: Stale Log Retention Policy
* **Severity:** Medium
* **Real-world Impact:** Storing long-term logs directly in the `activity_logs` Firestore collection increases database size and read/write billing.
* **Immediate Recommendation:** Implement a log retention policy, moving files to cold storage (e.g. Supabase Storage buckets) and keeping only the last 30 days of data in Firestore.

---

## 9. Cross-References
* Backend API Services: [02_BACKEND_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/02_BACKEND_AUDIT.md)
* Security Audit details: [07_SECURITY_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/07_SECURITY_AUDIT.md)
