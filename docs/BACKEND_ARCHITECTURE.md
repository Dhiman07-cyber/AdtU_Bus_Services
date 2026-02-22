# ⚙️ AdtU Smart Bus Management System: Backend System Architecture

## 1. Core Backend Philosophy
The backend infrastructure is fundamentally forged as a **Serverless, Server-Authoritative Engine**. It does not retain ephemeral state within active application memory between isolated requests. Instead, it delegates absolute state mastery to specialized external DB shards and strictly enforces idempotent execution operations. 

The primary mandates of this architecture are:
*   Absolute data integrity.
*   Complete elimination of operational race conditions.
*   An impenetrable shield against fragmented client-side manipulation.

## 2. The Hybrid Database Strategy
Recognizing the polarizing limitations of committing completely to either NoSQL or RDBMS topologies, this architecture mathematically bifurcates data payloads depending on exact runtime requirements and access latencies:

### A. Firebase Firestore (The Volatile, High-Throughput Node)
Utilized unconditionally for data layers requiring ultra-low latency broadcasting, mass fan-out, and atomic locking.
*   `system_config / deadline_config`: Real-time system parameters governing payment logic and timeline gates.
*   `vehicle_telemetry`: Ephemeral, high-velocity GPS ingestion (5-second streaming cadence).
*   `buses/{busId}.activeTripLock`: Distributed lock metadata dictating exactly which driver holds authorization over physical hardware.

### B. Supabase PostgreSQL (The Relational, Transactional Node)
Utilized for rigid, deterministic data requiring complex `JOIN` capability, deeply nested foreign key constraints, and mathematically guaranteed ACID transactional persistence.
*   `users`, `students`, `drivers`: Core identity profiles and explicit inter-relational definitions.
*   `payments`, `receipts`: Infallible financial ledgers utilizing rigid idempotency keys to ban double-transactions.
*   `active_trips`, `trip_events`: Extensive historical metadata tracing and chronological auditing.
*   `missed_bus_requests`: Distributed state machines managing volatile candidate reassignment variables.

---

## 3. Subsystem Architectural Deep Dive

### A. Global Configuration Injection Engine ("Zero-Deployment")
Historically, constants were baked into the source code (`BUSES.json` / code singletons). The system is now driven by a centralized Dynamic Service Matrix.
*   **Execution Runtime:** Incoming queries parsing validation logic no longer interrogate disk definitions. Middleware invokes `system-config-service` and `deadline-config-service` classes.
*   **The Paradigm Shift:** An Admin altering the "Academic Deadlines" via the UI results in an atomic Firestore commit. Consequently, every single concurrent execution checking a student's "Hard Block" / "Soft Block" validity instantly calculates routing outputs based precisely upon that new timestamp standard with zero cache staleness.

### B. Distributed Multi-Driver Shift & Lock Architecture
Engineered specifically to solve complex timeline clashes across multiple drivers assigned to singular geographical hardware.
1.  **Strict Lock Acquisition (`/api/driver/start-trip`):** The orchestration API initializes an atomic Firestore Transaction directed at `buses/{id}.activeTripLock`. If the `active` boolean equates to `false`, the server seizes the lock, injecting the driver's metadata, forging a UUID, and simultaneously instantiating a relational row representation securely inside the Supabase `active_trips` table.
2.  **Heartbeat Keep-Alive Loop (`/api/driver/heartbeat`):** While operating, the driver UI consistently fires cyclic HTTP `POST` requests to the edge every 5 seconds. The server interprets this pulse, artificially extending the lock's `expiresAt` timeline.
3.  **Algorithmic Recovery Operations:** In the event of catastrophic client failure (e.g., device dies during shift), a Vercel Cron engine pings `/api/cron/cleanup-stale-locks` exactly every 60 seconds. The edge server queries Supabase for any `last_heartbeat` occurrences older than chronological bounds. If intercepted, it forcefully ends the row context and deletes the physical Firestore lock constraint—ensuring physical buses are never software-bricked by driver abandonments.

### C. Missed Bus & Candidate Bidding State Machine
A highly elaborate, fully server-orchestrated geographical logic system architected to redistribute students missing their primary transit securely without Admin intervention.
*   **Phase 1 - Haversine Geospatial Guard:** Requests incoming to `/api/missed-bus/raise` undergo a Haversine geometric calculation. The distance vector between the Student's native stop and the Assigned Bus's real-time coordinate payload is evaluated. If the delta is exactly `< 100m`, the API returns a hard rejection string indicating proximity to prevent system spam attacks.
*   **Phase 2 - Candidate Resolution Engine:** Triggering integrations with OpenRouteService (ORS), the backend recalculates real-world traversal ETAs. If the algorithm dictates the primary bus has passed the waypoint unrecoverable, the server immediately cross-references the Supabase schema to isolate active trips possessing overlapping trajectory parameters.
*   **Phase 3 - Atomic Bidding Parameters:** Eligible counterpart candidate drivers are queued and pinged. Once a respective endpoint receives a `POST` targeting `/api/missed-bus/driver-response`, an uncompromising 'check-and-set' mutation algorithm engages. Absolute priority is granted sequentially; the initial payload "wins" the route modification—instantaneously invalidating adjacent subsequent payloads across nodes with a unified `already_handled` exclusion.

### D. Secure Payment Concurrency & Webhook Idempotency
Because network variability guarantees duplicate processing payloads historically, a foolproof reconciliation model encompasses all financial nodes.
1.  **Operation Key Generation:** Pre-checkout sequences invoke server generation of a cryptographic `operationId` structurally unique to that cart/session array.
2.  **Deterministic Webhook Validation:** Callbacks enacted by Razorpay undergo mathematically intensive verification utilizing SHA256 checksums paired securely against isolated keys secured inside Cloud KMS parameters.
3.  **Idempotency Restraints:** Upon verifying cryptographic authenticity, the handler indexes the provided `operationId` directly against the RDBMS layer. If a secondary webhook arrives derived from the parent event parameters, the relational lock explicitly restricts a secondary database insertion, preventing dual-entry race conditions intrinsically.

---

## 4. Defensive Security Parameters & Infrastructure Shielding
*   **Authoritative Routing & API Rate Restraints:** Essential, heavy-load executing endpoints feature stringent bounding limitations. Operations interfacing with mapping dependencies constrain individual payload execution, while endpoint parameters cap distinct student `raise` operations linearly at 3 queries per circadian cycle.
*   **Infrastructure Master Kill-Switch:** To avert massive volumetric DDoS attacks or quota financial bleeding on WebSocket architectures, the platform utilizes environmental overrides (e.g., `ENABLE_FIRESTORE_REALTIME`). Engaging this switch triggers Firebase Security Rules natively dropping active listener topologies forcibly, triggering the frontend to immediately downgrade to legacy short-polling mechanisms.
*   **Physical Anti-Spoofing Protocols:** Malicious application patching attempting false-injections against driver GPS matrices are negated via server-side physical logic filters. Incoming data coordinate blocks are evaluated against elapsed timestamp deltas—the execution engine will flatly deny ingestion strings proposing traversal speeds logically exceeding established constraints (e.g., transitioning distances mathematically equating to >200km/h ranges).

---

## 5. Background Tasking & Cron Workers
Deployed utilizing `vercel.json` orchestration files executing specialized logic sequences continuously at precise chronologies:
*   `api/cron/cleanup-stale-locks`: Executes minutely. Serves strictly to forcefully expunge abandoned locks.
*   `api/cron/reconciliation`: Executes via nightly batches. Iterates down complex financial log parameters verifying internal success variables match explicitly to the raw external execution outputs from Razorpay parameters.
*   `api/cron/access-audit`: Executes on extensive cycles to meticulously strip out ephemeral, obsolete mapping histories and aggregate raw traffic flows.
