# Performance Audit - Client Loading & Query Performance Review

## 1. Executive Summary
The system is optimized for performance under free-tier database limits (Firebase Spark Plan and Supabase Free Tier). It uses a 5-minute client-side `localStorage` cache for profile lookups and handles GPS updates via Supabase Realtime sockets to avoid Firestore read billing spikes. Route geometries are stored in a `route_cache` table to prevent OpenRouteService API quota depletion.

* **Database Query Performance:** 8/10
* **Network Payload Conservation:** 8/10
* **Client-Side Rendering (FCP/LCP):** 7/10
* **Memory & Concurrency Safety:** 8/10

---

## 2. Purpose of Subsystem
Performance optimization ensures:
1. Low latency for mobile-first dashboards.
2. Quota conservation for Firestore and OpenRouteService under free-tier constraints.
3. Stable real-time mapping updates without database operations overhead.
4. Safe transaction handling during concurrent seat allocations.

---

## 3. Performance Features & Optimization Design

### A. Two-Tier Caching Strategy
* **Client Cache:** `auth-context.tsx` caches profile documents in `localStorage` for 5 minutes (`CACHE_DURATION = 300000ms`), preventing database queries on dashboard refreshes.
* **Server Cache:** `api-auth.ts` caches user roles in an in-memory Map (`_authRoleCache`) for 5 minutes, avoiding Firestore reads on consecutive API calls.

### B. Geolocation Sockets Routing
* **Implementation (CONFIRMED):** Coordinate updates bypass Firestore. Driver devices write updates directly to the Supabase `bus_locations` table.
* **CDC Broadcast:** Supabase broadcasts these changes to clients via WebSockets, reducing database read costs during peak travel times.

### C. OpenRouteService Geometry Caching
* **Implementation (CONFIRMED):** Map route paths are cached in the PostgreSQL `route_cache` table. Subsequent route requests read from the local cache instead of query-charging the OpenRouteService API.

### D. Database Index Optimizations
* **PostgreSQL Indexes:** The database uses indexes on high-query tables, such as `idx_bus_locations_bus_id` and `idx_waiting_flags_active_raised` (`status = 'raised'`).
* **Firestore Composite Indexes:** Configured for notifications and scans collections to accelerate sorting tasks.

---

## 4. Concurrency & Transaction Safety

### A. Bus Capacity Allocation Locks
* **Implementation (CONFIRMED):** In `approve-v2/route.ts` and `cleanup-expired-students/route.ts`, seat allocations use transactions. If a seat reclaim fails, the transaction rolls back, preventing capacity counts from drifting.

### B. Exclusive Driver Trip Locks
* **Implementation (CONFIRMED):** Buses use trip locks to prevent multiple drivers from operating the same vehicle simultaneously. If a driver loses connection, the lock auto-expires after 5 minutes.

---

## 5. Failure Scenarios & Database Edge Cases

### A. High Volume Concurrent Student Check-ins
* **Scenario:** 50 students scan QR passes at a bus checkpoint within 1 minute.
* **Impact (CONFIRMED):** Scanners send verification requests to `/api/payment/receipt`. The API recomputes signature checks using cached keys, preventing database transaction collisions.

### B. Large Client Bundle Weight
* **Scenario:** Launching the dashboard on a slow mobile connection.
* **Impact (CONFIRMED):** Large mapping packages (Mapbox GL, Leaflet) increase bundle sizes, causing rendering delays for mobile clients.

---

## 6. Technical Debt
* **CONFIRMED:** Mapbox and Leaflet components are imported synchronously, increasing initial JS bundle weights.
* **CONFIRMED:** Global style assets contain unused classes, delaying first paints on low-end devices.

---

## 7. Production Risks & Recommendations

### Finding: Synchronous Imports Increase Client Bundle Sizes
* **Severity:** Medium
* **Real-world Impact:** Slow dashboard rendering for students using low-bandwidth networks.
* **Immediate Recommendation:** Use Next.js dynamic imports (`next/dynamic`) to lazy load map components (`LeafletMap` and `MaplibreTracker`) only when they are rendered on screen.

---

## 8. Cross-References
* Database Architecture details: [04_DATABASE_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/04_DATABASE_AUDIT.md)
* Backend Services Audit: [02_BACKEND_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/02_BACKEND_AUDIT.md)
