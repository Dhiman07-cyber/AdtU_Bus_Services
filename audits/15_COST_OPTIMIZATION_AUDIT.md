# Cost Optimization Audit - Quota Preservation & Free-Tier Safety Review

## 1. Executive Summary
The system is designed to operate within the limits of free-tier hosting resources (Firebase Spark Plan and Supabase Free Tier). It incorporates a 5-minute client-side `localStorage` cache for profile data and route geometries caching to prevent OpenRouteService API charges. However, role verification in `firestore.rules` uses `exists()` calls, which increases database read costs under heavy user traffic.

* **Firestore Spark Plan Preservation:** 8/10
* **Supabase Storage Management:** 8/10
* **Third-Party API Conservation:** 9/10
* **Maturity Score:** 8/10

---

## 2. Purpose of Subsystem
Cost optimization strategies are designed to:
1. Prevent Firebase database operations from exceeding free-tier limits.
2. Minimize OpenRouteService API queries by caching route geometries.
3. Manage database storage sizes under Supabase free-tier limitations.
4. Optimize asset delivery sizes on mobile networks.

---

## 3. Current Implementation Inventory
* `src/contexts/auth-context.tsx` - Caches user profile documents in the browser.
* `src/lib/security/api-auth.ts` - Caches user roles in-memory on the backend.
* `supabase/COMPLETE_SCHEMA.sql` - Implements `route_cache` tables and cleanup functions.
* `src/app/api/cron/cleanup-stale-locks/route.ts` - Deletes temporary tracking history logs.

---

## 4. Resource Preservation Flows

### A. Route Geometries Caching
1. **Route Query:** Student requests route details.
2. **Cache Check:** The system queries the Supabase `route_cache` table. If cached and valid, it returns the geometry immediately, bypassing external APIs.
3. **API Query Fallback:** If the route is missing or expired, the backend queries the OpenRouteService API and caches the coordinates for subsequent lookups.

### B. Geolocation Tracking
1. **Supabase CDC Sockets:** Location details bypass Firestore. Coordinates flow through Supabase Realtime sockets, eliminating Firestore read charges during peak travel times.
2. **Automatic Deletion:** Background cron tasks delete tracking rows older than 24 hours, keeping database sizes under free-tier limitations.

---

## 5. Security & Isolation Strategy
* **Symmetric Encryption (CONFIRMED):** In `public.payments`, sensitive column values are encrypted using AES-256-GCM.
* **Database Immutability (CONFIRMED):** Supabase `payments` table RLS policies deny delete operations (`FOR DELETE USING (false)`), preventing developers or staff from modifying financial history.

---

## 6. Failure Scenarios & Database Edge Cases

### A. Firestore exists() Rule Evaluation
* **Scenario:** High student traffic triggers multiple API requests simultaneously.
* **Impact (CONFIRMED):** Firestore rules verify user roles using `exists()` calls, which counts as a database read per check, potentially exhausting the free-tier read quota.

### B. Large Client Bundle Weight
* **Scenario:** Launching the dashboard on a slow mobile connection.
* **Impact (CONFIRMED):** Large mapping packages (Mapbox GL, Leaflet) increase bundle sizes, causing rendering delays for mobile clients.

---

## 7. Technical Debt
* **CONFIRMED:** `COMPLETE_SCHEMA.sql` contains duplicate table definitions.
* **CONFIRMED:** Firestore security rules verify user roles using `exists()` calls, increasing document read counts and transaction billing.

---

## 8. Production Risks & Recommendations

### Finding: Firestore Quota Depletion via exists() Rules
* **Severity:** High
* **Real-world Impact:** High student traffic can rapidly deplete the free-tier Firestore read quota, causing service disruptions.
* **Immediate Recommendation:** Configure Custom Claims in Firebase Auth during registration or approval, and check roles in `firestore.rules` using `request.auth.token.role` instead of calling `exists()`.

---

## 9. Cross-References
* Database Architecture details: [04_DATABASE_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/04_DATABASE_AUDIT.md)
* Security Audit details: [07_SECURITY_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/07_SECURITY_AUDIT.md)
