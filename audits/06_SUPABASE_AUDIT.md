# Supabase Audit - Realtime & PostgreSQL Services Review

## 1. Executive Summary
Supabase serves as the primary operational database, hosting PostgreSQL for real-time tracking, active trip states, driver swaps, and the immutable payments ledger. Connection architectures are split into client-side instances (Anon Key) and server-side singletons (Service Role Key). Security is enforced using database Row Level Security (RLS) policies, and high-frequency data is managed with auto-expiration database routines.

* **Supabase Client Architecture:** 8/10
* **RLS Policies Hardening:** 9/10
* **Realtime Sockets Configuration:** 8/10
* **Storage Maintenance:** 8/10

---

## 2. Purpose of Subsystem
Supabase PostgreSQL database is used to:
1. Store real-time bus locations (`bus_locations`) and coordinate logs.
2. Monitor and enforce driver trip locks (`active_trips`).
3. Store payments and reassignment history logs.
4. Broadcast database changes directly to client viewports using PostgreSQL Change Data Capture (CDC).

---

## 3. Current Implementation Inventory
* `src/lib/supabase-client.ts` - Client-side SDK initialization.
* `src/lib/supabase-server.ts` - Server-side SDK singleton using service role key.
* `supabase/COMPLETE_SCHEMA.sql` - Structural database schema setup.
* `supabase/config.toml` - Supabase local development configuration.

---

## 4. End-to-End Real-Time GPS Tracking Flow
1. **Coordinate Broadcast:** Driver HUD captures coordinates via browser Geolocation API. Toggles start-trip on the frontend.
2. **Write Loop:** The client writes location details to `bus_locations` every 5 seconds.
3. **Database Capture:** The Postgres table triggers RLS checks. Authenticated drivers can insert rows where `driver_uid` matches their authenticated UID.
4. **CDC Broadcast:** PostgreSQL publishes update markers to `supabase_realtime` channel.
5. **UI Update:** The client maps hook into the websocket channel (`trip-status-{busId}`), updating map markers and ETAs without polling the API.

---

## 5. Row Level Security & Access Policies
* **Anon/Authenticated Select Permissions:** RLS allows read access to anonymous and authenticated users for `bus_locations`, `driver_status`, `waiting_flags`, and `active_trips`.
* **Insert Constraints (CONFIRMED):** Drivers can write records to `bus_locations` and `driver_status` where `driver_uid = auth.uid()::text`.
* **Payments Immutability (CONFIRMED):** `payments` policies block all delete commands (`FOR DELETE USING (false)`), preserving financial histories.
* **Driver Swap RLS Rules:** Drivers can only read and manage `driver_swap_requests` where `requester_driver_uid` or `candidate_driver_uid` matches their authenticated UID.

---

## 6. Database Operations & Automated Routines

### High-Frequency Data Cleanup (CONFIRMED)
To maintain performance under free-tier limits, PL/pgSQL database functions delete historical location rows:
* `cleanup_old_bus_locations(retention_hours)`: Deletes `bus_locations` logs older than 24 hours, keeping only the latest snapshot per bus.
* `cleanup_old_driver_location_updates(retention_hours)`: Deletes updates older than 48 hours.
* `expire_waiting_flags()`: Updates flag statuses from `'raised'` to `'expired'` if they remain unhandled past their expiration window.

---

## 7. Failure Scenarios & Database Edge Cases

### A. Supabase Service Role Key Exposed on Client
* **Impact (CONFIRMED):** If a developer mistakenly imports `getSupabaseServer()` into client-side code:
* **Result:** Webpack includes the service role key in client bundles, allowing users to bypass RLS policies and modify database logs.
* **Mitigation:** The server-side client is located in `src/lib/supabase-server.ts` and is excluded from client bundles by build-time configuration checks.

### B. Duplicate SQL Statements during Migration
* **Impact (CONFIRMED):** Executing `COMPLETE_SCHEMA.sql` outputs structural warnings.
* **Result:** Tables `driver_location_updates` and `route_cache` are defined twice. PostgreSQL ignores the second declaration, but the code redundancy remains in the migration scripts.

---

## 8. Technical Debt
* **CONFIRMED:** `COMPLETE_SCHEMA.sql` contains duplicate table definitions.
* **CONFIRMED:** The SQL scripts lacks integration tests for verification of RLS rules.

---

## 9. Production Risks & Recommendations

### Finding: Duplicate SQL Declarations in Migration Files
* **Severity:** Low
* **Real-world Impact:** Increases script noise and maintenance complexity.
* **Immediate Recommendation:** Clean up duplicate table declarations in `supabase/COMPLETE_SCHEMA.sql`.

### Finding: Lack of Automated RLS Verification Tests
* **Severity:** Medium
* **Real-world Impact:** Future updates could inadvertently expose tables to public access.
* **Immediate Recommendation:** Configure Supabase RLS tests (`pgtap` or custom scripts) to verify access privileges.

---

## 10. Cross-References
* Database Audit logs: [04_DATABASE_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/04_DATABASE_AUDIT.md)
* Security configurations: [07_SECURITY_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/07_SECURITY_AUDIT.md)
