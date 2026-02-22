# ADTU Smart Bus Management System - Backend Architecture & System Flow

## 1. Overview and Tech Stack
The **Backend Architecture** utilizes a hybrid cloud model to balance real-time data needs with relational querying robustness. It completely relies on server-authoritative logic, guaranteeing zero single-point failures in crucial areas like configurations, locking, and payments.

### Core Technologies
*   **Framework:** Next.js Route Handlers (`app/api/*`) executing Serverless Functions.
*   **NoSQL / Real-time Database:** Firebase Firestore (Authoritative config, live telemetry, and distributed locks).
*   **Relational Database:** Supabase PostgreSQL (Relational links like Active Trips, Audit Trails, Identity).
*   **Authentication:** Firebase Auth directly providing signed JWTs.
*   **Payments Integration:** Razorpay APIs with Crypto-signed verification.
*   **Routing Logic Engine:** OpenRouteService (ORS) integration for routing distances and ETAs.

---

## 2. Master System Architecture

### A. The "Zero-Deployment" Configuration Engine
The entire system functions on an authoritative data pattern. Local `.json` configs have been universally stripped.
*   **System-Config-Service:** Fetches global fees and UI flags from Firestore. 
*   **Deadline-Config-Service:** Fetches `valid-until` boundaries dictating `softBlock` and `hardBlock` logic for students.
*   **Mechanism:** Admins manipulate Firestore records via the Admin UI. Subsequent calls across all modules inherently adapt the new rules instantly, removing the need to redeploy the server.

### B. Multi-Driver Trip Locking System
A meticulously designed distributed locking mechanism that ensures bus exclusivity across varying shifts securely.
*   **Lock Storage:** Handled via Firestore (`buses/{busId}.activeTripLock`), ensuring realtime atomic state changes.
*   **Supabase Mirror:** Simultaneously inserts a live record on Superbase (`active_trips`). 
*   **Heartbeat Lifeline:** The driver frontend sends a ping every 5 seconds to `/api/driver/heartbeat`. 
*   **Cleanup Cron:** A Vercel Cron Worker invokes a `/api/cron/cleanup-stale-locks` function every minute. Active trips lapsing 60 seconds of silent heartbeats are aggressively severed, liberating the lock automatically so the hardware isn’t orphaned.

---

## 3. Core Feature Analysis & API Flows

### A. "Missed Bus" Discovery Algorithm
Designed to process nearby fleet telemetry efficiently without compromising database R/W limits.
1.  **Stage 1 - Proximity Check:**
    *   API: `/api/missed-bus/raise`
    *   Verifies driver position against student position utilizing the **Haversine Distance** formula.
    *   If Assigned Driver is within predefined `NEARBY_THRESHOLD_METERS` (e.g., 100m) or the ORS-fetched ETA is actively counting down, the request halts. A `waiting_assigned` flag orchestrates the client UI.
2.  **Stage 2 - Candidate Bidding:**
    *   If Driver missed the stop (`bus_seq >= student_seq`), the server scouts `active_trips` for valid Candidate Buses on overlapping routes.
    *   Inserts exactly ONE record into Supabase `missed_bus_requests`. 
    *   Driver accepts via `/api/missed-bus/driver-response`. Atomic constraints dictate that the absolute first accept updates the `stage` to `approved` and associates the `trip_id`.

### B. Secure Payment Integration & Idempotency
1.  **Request Construction:** The client initiates a request. Server maps the student and generates a cryptographically solid `operationId`. 
2.  **Webhook Fulfillment:** 
    *   Razorpay triggers successful payment Webhook.
    *   Backend ingests the request and enforces strict SHA256 Signature verification.
    *   The `operationId` confirms idempotency at the API gateway layer natively mapping it to the internal DB ledger. Prevents "race conditions" from creating dual-charge entries.
3.  **Receipts Check:** Utilizes Server-only Crypto Ops. Receipts requested by the frontend are verified using a server-secured public key signature structure to ensure zero forging.

### C. Security & Data Integrity Posture
*   **Role-Based Access Control (RBAC):** Firebase Custom Claims combined with middleware check limits user capabilities definitively.
*   **Immutable Audit Trails:** Deletions or Admin config overrides submit pre-post-diff hash chains to a Supabase Ledger (Append-only). 
*   **Defensive APIs:**
    *   **GPS Anti-spoofing:** Servers cross-reference velocity constraints (blocking anomalies >200km/h transitions).
    *   **Rate Limits:** Stringent protections explicitly around endpoints like `/api/missed-bus/raise` (e.g., capped at 3 requests/day per student).
    *   **Fail-Safe Toggles:** A master kill switch flag (`ENABLE_FIRESTORE_REALTIME`) allows Admins to instantly sever all WebSocket listeners globally during traffic surging to mitigate infrastructure quota exhaustion.