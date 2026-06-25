# API Audit - Endpoint Design & Routing Review

## 1. Executive Summary
The application hosts a REST API framework using Next.js App Router serverless route handlers. Endpoints handle authentication verification, payment verification, driver coordination, and cron management. Requests are validated using Zod schemas and secured with `withSecurity()` wrappers, checking rate limits and authorization headers.

* **API Consistency:** 8/10
* **Input Validation Security:** 9/10
* **Rate Limiting Resilience:** 8/10
* **Documentation Alignment:** 7/10

---

## 2. Purpose of Subsystem
The API layer is responsible for:
1. Validating incoming payment transactions and digital signatures from Razorpay.
2. Managing driver state transitions (enroute, idle) and exclusive trip locks.
3. Authenticating cron job requests.
4. Exporting data for administrative audits.

---

## 3. Current Implementation Inventory (Key Endpoints)
The API contains 56 subdirectories under `src/app/api`. Core operational routes include:
* `/api/payment/razorpay/create-order` - Generates payment orders.
* `/api/payment/razorpay/verify-payment` - Validates signatures and records payments.
* `/api/payments/approve` & `/api/renewal-requests/approve-v2` - Confirms student renewals.
* `/api/driver-swap` - Manages driver swap requests.
* `/api/cron/cleanup-stale-locks` - Releases orphaned trip locks.
* `/api/cron/cleanup-expired-students` - Prunes expired student credentials.

---

## 4. End-to-End API Execution Flow

### A. Online Payment Verification Flow (`verify-payment`)
1. **Request Verification:** Client sends Razorpay payload to `/api/payment/razorpay/verify-payment`. The endpoint validates parameters using `VerifyPaymentSchema`.
2. **Signature Check:** `verifyRazorpaySignature()` validates the Razorpay signature. If invalid, the route exits with a `400` status.
3. **Verification Query:** The API queries Razorpay to verify order and capture status.
4. **Auth Check:** Compares the order's metadata UID against the caller's Firebase Auth token UID.
5. **Ledger Record:** Saves the completed payment record in Supabase.
6. **Entitlement State:** Creates a pending renewal request in Firestore `/renewal_requests` for moderator review, and returns success to the client.

### B. Cron Authentication Flow
1. **Request Arrival:** A service triggers a cron endpoint (e.g. `/api/cron/expiry-check`).
2. **Secret Check:** The API reads the `Authorization` header and compares it against `process.env.CRON_SECRET`.
3. **Execution Block:** If the secret is missing or incorrect, it returns a `401` status. If correct, the cron task runs.

---

## 5. Security & Validation Strategy
* **Input Validation (CONFIRMED):** Endpoints validate parameters against Zod schemas, returning `400` errors for invalid inputs.
* **Rate Limiting (CONFIRMED):** Authenticated routes use `rate-limiter-flexible` with a Node-cache back-end. Limit thresholds are configured for each action.
* **Cron Auth Enforcements (CONFIRMED):** Cron endpoints verify the `CRON_SECRET` header, returning a `401` or `500` status if validation fails.

---

## 6. Failure Scenarios & API Edge Cases

### A. Webhook Race Condition
* **Scenario:** The client verify-payment API and the Razorpay Webhook write the same payment to the ledger simultaneously.
* **Impact (CONFIRMED):** The verify-payment API runs a Firestore transaction using the `processed_payments` collection as an idempotency ledger, ensuring only one write succeeds.

### B. Missing Endpoint for Year-End Log Archiving
* **Scenario:** The yearly cron task triggers `api/cron/annual-export` as documented in the README.
* **Impact (CONFIRMED):** The request returns a `404` status code because the endpoint is missing from the codebase.

---

## 7. Technical Debt
* **CONFIRMED:** The documented `api/cron/annual-export` endpoint is missing from the repository.
* **CONFIRMED:** The `package.json` file contains several scripts pointing to missing files in the `scripts` directory.

---

## 8. Production Risks & Recommendations

### Finding: Missing annual-export API Endpoint
* **Severity:** High
* **Real-world Impact:** Stale audit records and transaction history cannot be archived, causing database storage growth.
* **Immediate Recommendation:** Create the `api/cron/annual-export` route handler to execute year-end archiving and log rotation.

---

## 9. Cross-References
* Backend API Services: [02_BACKEND_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/02_BACKEND_AUDIT.md)
* Security Audit details: [07_SECURITY_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/07_SECURITY_AUDIT.md)
