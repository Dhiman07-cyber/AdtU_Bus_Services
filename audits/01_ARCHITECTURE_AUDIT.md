# Architecture Audit - System Design & Integrity Review

## 1. Executive Summary
The system adopts a unique **Dual-Database hybrid architecture** combined with Next.js App Router (React 19). By separating persistent demographic data (Firestore) from high-frequency operational data and financial transactions (Supabase/PostgreSQL), it achieves an optimal balance between Firestore Spark Plan cost preservation and PostgreSQL transaction safety.

* **Architectural Cleanliness:** 8/10
* **Resilience & Fault Tolerance:** 7/10
* **Scalability:** 8/10
* **Complexity Level:** High (due to dual-auth, dual-db syncing)

---

## 2. Purpose of Subsystem
The architecture is designed to orchestrate student commutes, payments, driver swaps, and bus occupancy management. It must:
1. Preserve financial audit integrity (immutable ledger).
2. Broadcast real-time location updates under strict free-tier quotas.
3. Automatically self-heal if network drift or process crashes occur during state changes.

---

## 3. Core Architecture & Component Relationship
The system is divided into three primary layers:
1. **Client Tier (PWA):** Stands as the user interface for Students, Drivers, Moderators, and Admins. Built with Tailwind CSS and React 19. Uses local caching for offline passes and handles map routing using Leaflet/Maplibre.
2. **Serverless Tier (Next.js APIs):** Handles payment creation/verification, security checks, cron workers, and database operations.
3. **Storage & DB Tier (Firestore + Supabase):**
   * **Firestore:** Profiles (`students`, `drivers`, `moderators`, `admins`), static configurations, and routing schedules.
   * **Supabase:** Active trip locks (`active_trips`), Realtime locations (`bus_locations`), driver swap records, student waiting flags, and immutable financial payment records.

### Dual-Database Mapping
```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client Tier (PWA)                             │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ (REST API & WebSockets)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Next.js API Layer (Serverless)                       │
├────────────────────────────────────┼────────────────────────────────────┤
│   Firebase Admin SDK (Auth/Docs)   │     Supabase Client (Postgres)     │
└──────────────────┬─────────────────┴──────────────────┬─────────────────┘
                   │                                    │
                   ▼                                    ▼
┌─────────────────────────────────────┐    ┌──────────────────────────────┐
│         Firestore Database          │    │      Supabase Postgres       │
├─────────────────────────────────────┤    ├──────────────────────────────┤
│  • Student/Driver Profiles          │    │  • Real-time GPS Locations   │
│  • Route Definitions & Bus Details  │    │  • Active Trip Locks         │
│  • System Configurations            │    │  • Immutable payments ledger │
│  • In-app Notification lists        │    │  • Reassignment Logs         │
└─────────────────────────────────────┘    └──────────────────────────────┘
```

---

## 4. End-to-End Execution Flows & Data Flow

### A. Online Payment & Application Flow
1. **Student Onboarding:** Student submits form -> application is written to Firestore `/applications`.
2. **Online Payment:** Student initiates payment via Razorpay. Client triggers `/api/payment/razorpay/create-order`.
3. **Capture & Verify:** Payment verified in `/api/payment/razorpay/verify-payment`. The backend:
   * Validates Razorpay HMAC signature.
   * Fetches order from Razorpay to verify amount.
   * Encrypts student name and enrollment ID using AES-256-GCM.
   * Appends payment record to Supabase `public.payments`.
   * Creates a pending request in Firestore `/renewal_requests` for manual moderator review.
4. **Moderator Approval:** Moderator approves via `/api/renewal-requests/approve-v2`. This:
   * Verifies moderator permission in `moderators` collection.
   * Runs a transaction on Firestore: updates student `status` to 'active', updates `validUntil`, clears `seatReleasedAt` if set, and increments the assigned bus capacity count.
   * Updates `/renewal_requests` status to 'approved'.
   * Deletes receipt proof from Cloudinary to enforce student privacy.

### B. Multi-Driver Lock & Trip Flow
1. **Start Trip:** Driver hits "Start Trip" on the driver app. Client posts to `/api/driver/start-trip` -> invokes `TripLockService.startTrip`.
2. **Lock Acquisition:**
   * Acquires lock in Firestore `/buses/{busId}` by writing `activeTripLock.active = true` (using transaction to prevent race conditions).
   * Inserts row in Supabase `active_trips` with status `'active'`.
   * Releases stale locks if the bus or driver has another active session.
3. **Heartbeat Broadcast:** While enroute, driver sends coordinates to `/api/location` and posts heartbeats to `/api/driver/heartbeat`.
   * Supabase `active_trips.last_heartbeat` updated.
   * Firestore `activeTripLock.expiresAt` extended by 5 minutes.
4. **End Trip:** Driver hits "End Trip". Calls `/api/driver/end-trip`.
   * Updates Supabase `active_trips.status = 'ended'`.
   * Releases Firestore lock `/buses/{busId}` by clearing `activeTripLock`.

---

## 5. Trust Boundaries & Security Zones
* **Client Trust Boundary:** All client inputs are untrusted. Entitlements are calculated server-side based on `validUntil` timestamps.
* **Server-to-Database Boundary:** Next.js API routes communicate with Firebase and Supabase using administrative service keys (`FIREBASE_ADMIN_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
* **Firestore Security Rules:** Client-side updates are heavily restricted. Students can only read their own records and cannot modify fields like `validUntil`, `status`, `busId`, or `role` (handled by rules matching authenticated UID).

---

## 6. Security, Performance & Operational Observations

### Security Observations
* **CONFIRMED:** Firestore security rules utilize `exists()` calls for role verification. While secure, this causes excessive reads.
* **CONFIRMED:** Symmetric encryption (AES-256-GCM) is applied to student names, IDs, and transaction IDs stored in Supabase `public.payments` table.

### Performance Observations
* **CONFIRMED:** The memory cache `_authRoleCache` in `api-auth.ts` limits Firestore reads during consecutive authenticated API requests.
* **CONFIRMED:** Real-time listeners on tracking are limited. Location coordinates bypass Firestore entirely and flow through Supabase Realtime CDC, conserving Firestore read budgets.

---

## 7. Failure Scenarios & Edge Cases

### A. Network Break during Transaction (Supabase vs Firestore Drift)
* **Scenario:** During moderator approval, the payment is written to Supabase, but the Next.js worker loses connectivity before completing the Firestore student transaction.
* **Impact:** Student remains in `soft_blocked` state despite payment completed in Supabase.
* **Mitigation (CONFIRMED):** Self-healing is built into the daily `cleanup-expired-students` cron tail reconciliation (`adminReconcileBusLoads`). It counts active students and corrects the bus load counters to match the Firestore profile database state.

### B. Driver App Crash during Live Trip
* **Scenario:** Driver crashes or loses connection without ending the trip.
* **Impact:** Bus lock remains active, preventing other drivers from starting a trip.
* **Mitigation (CONFIRMED):** The minutely cron job `/api/cron/cleanup-stale-locks` runs `cleanup_stale_locks()` (timeout is 300s). It automatically ends orphaned trips in Supabase and releases the Firestore lock.

---

## 8. Technical Debt & Gaps
* **CONFIRMED:** The `annual-export` cron endpoint described in the README does not exist in the code base.
* **CONFIRMED:** Multiple legacy check scripts in `package.json` point to files that do not exist in the `scripts` folder (e.g. `checkOnSnapshot.js`).

---

## 9. Production Risks & Recommendations

### Finding: Heartbeat Timeout Discrepancy
* **Severity:** High
* **Real-world Impact:** If a driver loses connection, the bus is locked for 5 minutes (300 seconds) instead of 1 minute (60 seconds) as documented, blocking shift handovers.
* **Immediate Recommendation:** Modify `HEARTBEAT_TIMEOUT_SECONDS` in `trip-lock-service.ts` and `cleanup-stale-locks/route.ts` to align with the documented 60 seconds (or update the docs to reflect 5 minutes).

### Finding: Missing Observability for Serverless API Executions
* **Severity:** Critical
* **Real-world Impact:** When API transactions fail or timeout on Vercel, university administrators have no visibility unless they review Vercel dashboard logs.
* **Immediate Recommendation:** Configure log forwarding to a centralized system (e.g. Axiom or Datadog) using Vercel integrations.

---

## 10. Cross-References
* Security & Encryption details: [07_SECURITY_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/07_SECURITY_AUDIT.md)
* Supabase RLS policies: [06_SUPABASE_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/06_SUPABASE_AUDIT.md)
