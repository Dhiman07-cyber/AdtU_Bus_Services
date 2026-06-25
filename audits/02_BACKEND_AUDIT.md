# Backend Audit - API & Serverless Services Review

## 1. Executive Summary
The backend is structured as a collection of serverless Next.js API routes (Next.js 16/App Router) running on Node.js. It integrates Firebase Admin SDK (Auth & Firestore) with Supabase Client (PostgreSQL) and external services (Razorpay for online transactions, Cloudinary for payment proof images, and Resend/nodemailer for email alerts). The code utilizes wrapper functions for security auditing, Zod validation, and token verification.

* **Backend Cleanliness:** 8/10
* **API Security & Validation:** 9/10
* **Rate Limiting:** 8/10
* **Operational Readiness:** 7/10

---

## 2. Purpose of Subsystem
The backend services are responsible for:
1. Validating and processing student registrations and renewals.
2. Mediating the driver trip state machine and exclusive bus locks.
3. Conducting scheduled maintenance routines (expired student pruning, stale lock reclamation) via cron endpoints.
4. Securing administrative and payment operations against unauthorized requests.

---

## 3. Current Implementation Inventory (Key Endpoints)
The backend codebase implements over 50 API endpoints. The critical operational endpoints include:

* `/api/payment/razorpay/create-order/route.ts` - Creates payment orders inside Razorpay.
* `/api/payment/razorpay/verify-payment/route.ts` - Verifies signatures and records payments.
* `/api/payments/approve/route.ts` & `/api/renewal-requests/approve-v2/route.ts` - Manually approves student renewals.
* `/api/driver-swap/route.ts` - Coordinates swap requests between drivers.
* `/api/cron/cleanup-stale-locks/route.ts` - Automatically releases orphaned trip locks.
* `/api/cron/cleanup-expired-students/route.ts` - Prunes expired student credentials and decrements bus capacity counts.

---

## 4. End-to-End Execution Flow
Here is the execution path of the **Offline Payment Approval Flow** inside `approve-v2/route.ts`:
1. **Request Received:** Client submits POST request with `requestId` and Authorization bearer token.
2. **Auth & Setup:** `verifyToken()` extracts the caller's Firebase UID. `adminDb.getAll()` retrieves the approver user doc and the renewal request doc in parallel.
3. **Permission Check:** `requireModeratorPermission()` validates the approver has the `canApproveOfflinePayment` permission.
4. **Capacity Pre-Check:** If the student's seat was previously released (`seatReleasedAt` is set), the backend fetches the assigned bus document and checks if `currentMembers < capacity`. If full, it exits with a `409` status code.
5. **Ledger Record:** Saves the completed payment record in Supabase using `PaymentTransactionService.saveTransaction()`.
6. **Transaction Execution:** A Firestore transaction updates:
   * Student's status to `'active'`, clears `seatReleasedAt`, and updates block dates (`softBlock`, `hardBlock`).
   * The bus document's load values (`currentMembers`, `load.totalCount`, `load.morningCount`, `load.eveningCount`).
   * The renewal request status to `'approved'`.
   * Inserts an audit log inside the transaction.
7. **Cloudinary Cleanup:** Deletes the uploaded offline receipt image from Cloudinary to enforce student privacy.
8. **Client Response:** Returns success with the new expiration date.

---

## 5. Security & Verification Strategy
* **Request Validation:** Protected endpoints use `withSecurity()` from `src/lib/security/api-security.ts`, validating bodies against Zod schemas (e.g. `VerifyPaymentSchema`).
* **Rate Limiting:** Enforces rate limiting on authentication and payment endpoints using `rate-limiter-flexible` and a Node-cache back-end.
* **Authentication Cache:** Module-scoped Map caches roles for 5 minutes (`AUTH_ROLE_CACHE_TTL`), avoiding redundant Firestore reads during verification checks.

---

## 6. Failure Analysis & Edge Cases

### A. Cloudinary API Unreachable or Key Expired
* **Impact (CONFIRMED):** If Cloudinary fails during student hard deletion or renewal approval, the asset deletion catches the error but continues. The student document and Firebase Auth user are deleted successfully.
* **Result:** Legacy receipt images remain in Cloudinary storage as orphaned files, causing storage drift.

### B. Seat Release Reconciliation on Conflict
* **Impact (CONFIRMED):** If a student is soft-blocked and their seat is released but a concurrent transaction fails to update the bus document:
* **Result:** The system reconciles discrepancy during the daily `expiry-check` cron run using `adminReconcileBusLoads()`, which forces bus load values to match active profile counts.

---

## 7. Technical Debt
* **CONFIRMED:** The yearly cron endpoint `api/cron/annual-export` is missing from the repository, although referenced in the documentation.
* **CONFIRMED:** The `package.json` file contains several scripts pointing to missing files in the `scripts` directory (e.g. `fix-firestore-schema.ts`).

---

## 8. Production Risks & Recommendations

### Finding: Stale Lock Retention is Too Long (300s vs 60s)
* **Severity:** High
* **Real-world Impact:** If a driver's device loses power or connectivity, the bus remains locked for 5 minutes. No other driver can operate the vehicle during this time.
* **Immediate Recommendation:** Update `HEARTBEAT_TIMEOUT_SECONDS` in `trip-lock-service.ts` to 60 seconds.

### Finding: Missing Database Backup Schedule in DevOps Scripting
* **Severity:** High
* **Real-world Impact:** Loss of PostgreSQL database would destroy payment ledger history.
* **Immediate Recommendation:** Configure a automated pg_dump cron job on a separate serverless schedule to push database backups to secure university storage.

---

## 9. Cross-References
* Frontend Dashboard Actions: [03_FRONTEND_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/03_FRONTEND_AUDIT.md)
* Firestore Schema Configuration: [05_FIREBASE_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/05_FIREBASE_AUDIT.md)
