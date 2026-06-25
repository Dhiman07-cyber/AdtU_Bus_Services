# Authorization Audit - Access Control & Role Boundaries Review

## 1. Executive Summary
The system implements a multi-layered authorization model spanning client dashboard routing, API security filters, Firestore collection rules, and Supabase Row Level Security (RLS) tables. Administrators can assign granular sub-permissions to moderators using a dedicated schema stored in Firestore.

* **Authorization Cleanliness:** 8/10
* **Role Enforcements:** 9/10
* **Moderator Granularity:** 9/10
* **RLS Policies Hardening:** 9/10

---

## 2. Purpose of Subsystem
Authorization boundaries ensure that:
1. Students can only view their own transit entitlements and cannot modify capacity allocations.
2. Drivers can execute enroute logs only for their assigned vehicle.
3. Moderators can edit routes, manage applications, and approve payments according to their assigned permissions.
4. Admins maintain full operational control over the entire system.

---

## 3. Subsystem Architecture & Access Rules

### A. Role Matrix & Entitlements
The system recognizes four operational roles:
* **Admin:** Bypasses all validation blocks. Can run reassignments, view audit logs, and configure system settings.
* **Moderator:** Permissions are mapped to categories (`students`, `drivers`, `buses`, `routes`, `applications`, `payments`). Each category has custom read/write toggles (e.g. `canApproveOfflinePayment`).
* **Driver:** Can operate assigned buses, request swaps with other drivers, and view list of students waiting at stops.
* **Student:** Can view bus routes, check in via QR, request missed bus pickups, and submit renewal payments.

### B. Firestore Authorization Rules
* **Profiles Isolation (CONFIRMED):** Students can only view their own profile. Admins and moderators can read all documents.
* **Role Protection (CONFIRMED):** Rules block clients from modifying the `role` field on `/users/{userId}`. Only Admins can execute role adjustments.
* **Sensitive Field Protection (CONFIRMED):** Updates to student document fields like `validUntil`, `status`, `assignedBusId`, and `shift` are blocked for student callers.

### C. Supabase RLS Policies
* **Anonymous Reads (CONFIRMED):** Read access is granted on `bus_locations`, `driver_status`, and `waiting_flags` to support map rendering.
* **Write Constraints (CONFIRMED):** Write access is restricted based on authenticated UID:
  * `bus_locations` & `driver_status` inserts are checked: `driver_uid = auth.uid()::text`.
  * `payments` ledger select operations are checked: `student_uid = auth.uid()::text` or `auth.role() = 'service_role'`. Deletion is blocked entirely.

---

## 4. End-to-End Authorization Flows

### A. Driver Swap Request Authorization
1. **Request Creation:** A driver requests a swap. RLS policy checks: `auth.uid()::text = requester_driver_uid` and `status = 'pending'`.
2. **Target Driver Acceptance:** The target driver accepts. The update policy checks: `toDriverUID = auth.uid()::text` and matches transition status `status IN ('accepted', 'rejected')`.
3. **Admin Override:** Admins can view and update all swap requests.

### B. Moderator Permission Checks
1. **API Invocation:** A moderator approves a payment. The API calls `requireModeratorPermission(auth, 'payments', 'canApproveOfflinePayment')`.
2. **Authorization Resolve:** The checker reads permissions from `/moderators/{uid}` and caches them for 60 seconds (`PERMISSION_CACHE_TTL_MS`).
3. **Access Enforcement:** Returns success if the permission boolean is true; otherwise, it exits with a `403` status.

---

## 5. Security Boundaries & Observations
* **Bypassing Firestore Rules:** Next.js APIs use the Firebase Admin SDK and bypass Firestore rules, relying on `verifyApiAuth()` and `requireModeratorPermission()` wrappers.
* **Supabase Client Roles:** Client components use the `anon` key, while Next.js serverless backends use the `service_role` key to bypass RLS policies.

---

## 6. Failure Scenarios & Database Edge Cases

### A. Moderator Permission Modification Latency
* **Impact (CONFIRMED):** If an admin revokes a moderator's payment approval permission:
* **Result:** The permission check remains cached in the serverless API instance for up to 60 seconds. The moderator can still approve payments until the cache TTL expires.

### B. Unauth User Collection Access
* **Impact (CONFIRMED):** Unauthenticated sign-ups write details to `/unauthUsers/{uid}`.
* **Result:** Rules allow users to read and update their own document, but block creation to prevent spam.

---

## 7. Technical Debt
* **CONFIRMED:** Firestore rules rely on `exists()` queries to check roles, increasing read costs on the database.

---

## 8. Production Risks & Recommendations

### Finding: Firestore exists() Calls Increase Read Costs
* **Severity:** High
* **Real-world Impact:** Checks role documents on every request, increasing Firebase billing.
* **Immediate Recommendation:** Configure Custom Claims in Firebase Auth to assign roles, and verify roles in rules using `request.auth.token.role` to eliminate database read dependencies.

---

## 9. Cross-References
* Firebase security configuration: [05_FIREBASE_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/05_FIREBASE_AUDIT.md)
* Supabase RLS security details: [06_SUPABASE_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/06_SUPABASE_AUDIT.md)
