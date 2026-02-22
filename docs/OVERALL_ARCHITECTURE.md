# 🏛️ AdtU Smart Bus Management System: Overall System Architecture

## 1. Executive Summary
The AdtU Smart Bus Management System is a modern, enterprise-grade cloud-native Web Application built to manage a university's fleet of buses, student registrations, driver trips, and administrative configurations. It uses a **Hybrid Cloud Database** strategy (combining Firebase Firestore and Supabase PostgreSQL) to leverage real-time synchronization capabilities alongside robust relational data integrity. The entire system is deployed via **Vercel** as a serverless Single Page Application (SPA) natively integrated into Next.js's App Router ecosystem.

## 2. High-Level System Context
The core ecosystem interacts with four primary user tiers and leverages several external third-party services.

### User Roles
1.  **Student:** Self-service onboarding, registration, fee payment, live bus tracking on an interactive map, and proximity-aware missed-bus reporting.
2.  **Driver:** Operational hub for establishing secure trip locks, starting/ending shifts, broadcasting live GPS telemetry, and accepting reassignment requests.
3.  **Moderator:** Middle-tier administrative role capable of approving applications and manually registering students, bounded by strict RBAC limitations.
4.  **Admin:** Super-user with full architectural control over system configurations (dynamic fees, academic deadlines), fleet management, and deep ledger auditing.

### External Services Integration
*   **Authentication Engine:** Firebase Authentication (Supplying JWTs & Custom Claims for role differentiation).
*   **Payment Gateway:** Razorpay (Handling fiat transactions, Webhooks, and cryptographically signed payment idempotency).
*   **Routing & Mapping Engine:** OpenRouteService (ORS) and Mapbox (Calculating ETAs, routing distances, rendering maps, and establishing Geofences).
*   **Cryptography Services:** Cloud KMS / HSM for secure, tamper-proof signing of receipts.

## 3. Architecture Principles
*   **"Zero-Deployment" Configuration Engine:** The system is entirely independent of static configuration files or codebase constants. Global settings (e.g., academic year boundaries, global bus fees, UI toggles) belong natively to Firestore. Administrative changes take effect in real-time across all active user sessions globally without requiring a codebase rebuild or server bounce.
*   **Server-Authoritative Trust Model:** The frontend is treated strictly as a vulnerable presentation layer. All systemic validations (ETA parsing, payment verifications, trip-locking algorithms, geo-spatial distance checks) execute solely within the secure enclave of the Next.js Serverless Edge/Node APIs.
*   **Distributed Resilience & Observability:** Background tasks and maintenance loops are entirely non-blocking, orchestrated via Vercel Cron. Fallback mechanisms are wired deeply into the core; for example, a "Master Kill Switch" can instantly sever volatile WebSocket listener topologies to gracefully degrade into standard HTTP polling, protecting the infrastructure from DDOS or severe quota exhaustion.

## 4. Component Diagram & Technology Stack

### Frontend (Presentation Layer)
*   **Framework:** Next.js (React 18+) leveraging the `app/` Directory Router.
*   **Styling & Theming:** Custom CSS and TailwindCSS focusing heavily on Glassmorphism, deep layered shadows, liquid micro-animations via Framer Motion, and deeply integrated, high-contrast Dark/Light theme switching.
*   **State Alignment:** React Context and specialized hooks (`useTripLock`) partnered with SWR/React Query and Firebase Web SDK `onSnapshot` listeners. This guarantees absolute synchronization between the client’s local state and the server’s authoritative state.

### Backend (API & Business Logic)
*   **Runtime Environment:** Fully Serverless ecosystem deployed as Edge and Node Functions via Next.js Route Handlers.
*   **Orchestration layer:** API middleware natively intercepts all traffic, decodes identity JWTs, enforces aggressive Rate Limits, validates sanitized payloads, and dispatches strict action handlers.
*   **Worker/Cron Layer:** Distributed background scripts operating asynchronously (e.g., sweepers that release orphaned physical locks if a driver’s device loses connection).

### Database (Data Layer)
*   **Firestore (NoSQL):** Dominates high-throughput, highly volatile, and real-time execution flows. (Examples: Live Vehicle GPS Telemetry at 5s cadences, Global Setup Config Singletons, Distributed Driver Active Trip Locks).
*   **Supabase (RDBMS):** Dominates transactional, highly structured data requiring ACIDs and complex JOIN parameters. (Examples: User identity tables, immutable Admin Audit Trails, complex candidate bidding state machines for missed buses, precise historical trip tracking).

## 5. Network & Data Lifecycle Flow
1.  **Initial Shell Rendition:** The user hits a domain. Next.js triggers structural Server-Side Rendering (SSR) to deliver initial HTML shells.
2.  **Authentication Bootstrapping:** The Firebase SDK cross-references session persistence. If validated, it injects an ID Token injected with specific Custom Claims (Student vs. Admin).
3.  **Real-Time Subscriptions Formation:** 
    *   The frontend mounts live WebSocket listeners pointing dynamically at authorized Firestore collections based on the JWT claim.
    *   *Real-World Example:* When an Admin modifies the "Monthly Bus Fee" in Firestore, the WebSocket propagates the exact byte update downward, instantaneously adjusting the value inside every active checkout window loaded on students' devices.
4.  **Transactional Mutations:** 
    *   Standard actions like "Confirm Payment" or "End Shift" utilize robust REST API `POST` procedures secured via HTTPS.
    *   Once traversing the middleware, the Next.js execution engine converses directly with Supabase via Service Role Keys, completely bypassing Row Level Security (RLS) policies that are normally locked down tight against client-side reads.

## 6. Security Architecture
*   **Role-Based Access Control (RBAC):** Every singular API endpoint performs aggressively restrictive checks against the Firebase Custom Claim prior to acknowledging payloads.
*   **Append-Only Immutable Ledgers:** Destructive workflows (overrides, profile deletions, manual student creations) trigger snapshotting. Pre-mutation parameters and POST-mutation results are serialized, stamped with an executing User UUID, hashed mathematically, and pushed to a Supabase ledger designed to inherently forbid row deletions.
*   **Anti-Spoofing Defense Patterns:** Driver GPS POST endpoints calculate physical probability bounds inherently. The server-side code ignores coordinate telemetry natively if a driver's transition from point A to B equates to impossible physics (e.g., velocity constraints > 200km/h), logging the anomaly.

## 7. Infrastructure & Deployment Strategy
*   **Platform as a Service (PaaS):** Vercel handles CI/CD build phases, edge hosting for the frontend assets, and hyper-scaling load balancing for serverless handlers.
*   **Deployment Pipeline (CI/CD Gates):**
    *   **Phase 1 (Pre-Merge):** SAST (Static Application Security Testing) code scans and aggressive Unit/Integration suite passes.
    *   **Phase 2 (Merge Gate):** Integration logic tests and Database Migration Dry-runs.
    *   **Phase 3 (Canary Rollouts):** Traffic split progressively based on strict thresholds (5% traffic -> observation phase -> 25% -> 100%). Rollbacks trigger autonomously if Error Spikes > 3x the baseline latency.
