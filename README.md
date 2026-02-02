# 🚌 ADTU Smart Bus Management System (Final Release)

> **A lifecycle-aware Smart Bus Management System** that separates operational state from financial records, secures receipts with cryptographic signing, protects Firestore with runtime guards, and supports auditable, reversible administrative actions suitable for institutional production.

---

## 📋 Table of Contents

1.  [System Philosophy](#-system-philosophy)
2.  [User Flows by Role](#-user-flows-by-role)
3.  [Technological Architecture](#-technological-architecture)
4.  [Core Systems & Features](#-core-systems--features)
5.  [Security & Cryptography](#-security--cryptography)
6.  [Operational Safety](#-operational-safety)
7.  [Experience & Access](#-experience--access)
8.  [Deployment](#-deployment)

---

## 🎯 System Philosophy
The system is built on **four core invariants**:

1.  **State-Driven Lifecycle**: Features derive from a student's individual session state (e.g., "Active", "Expired") rather than global academic years.

2.  **Dual-Database Architecture**:
    *   **Supabase (PostgreSQL)**: The **primary operational database**. Holds ALL live data:
        *   Real-time GPS tracking (`bus_locations`)
        *   Active trips & driver status (`driver_status`)
        *   Driver swap requests (`driver_swap_requests`, `temporary_assignments`)
        *   Waiting flags (`waiting_flags`)
        *   **Financial ledger** (`payments` - immutable)
        *   **Audit logs** (`reassignment_logs` - for rollback capability)
    *   **Firestore**: Holds **static profile data only**:
        *   Student/Driver/Admin/Moderator profiles
        *   Route definitions
        *   Bus definitions
        *   In-app notifications

3.  **Real-Time Safety**: Firestore listeners are strictly bounded to prevent quota exhaustion. Kill-switches exist for emergency shutdowns.

4.  **Deterministic & Reversible**: Critical admin actions (like mass reassignment) are designed to be atomic with ready-to-use **Rollback** options.

---

## 👥 User Flows by Role

### 🎓 Student Flow
1.  **Onboarding**: Fills a secure form → Routes & Pickup points selected → Email captured.

2.  **Payment**:
    *   **Online**: Razorpay (server-verified).
    *   **Offline**: Uploads physical receipt → Moderator verifies and approves.

3.  **QR & Access**:
    *   **Bus Pass**: Displays a UID-based QR code (fetched once, cached).
    *   **Receipt**: Digital receipt with a cryptographic signature (QR).

4.  **Daily Commute**: Tracks live bus location, sees ETA, and raises "Waiting" flags if the bus is late.

5.  **Missed Bus Recovery**: If the assigned bus is missed, requests pickup from nearby candidate buses (subject to proximity and availability checks).

6.  **Renewal**: System notifies before session expiry. Pays specifically for the next session cycle.

### 🚗 Driver Flow
1.  **Trip Management**: "Start Trip" acquires an **exclusive system lock** preventing concurrent operations. Broadcasts live GPS to Supabase (5s intervals). "End Trip" archives the journey.

2.  **Swap System (Mobile-Centric)**:
    *   Request a swap with another driver for a specific time window.
    *   Target driver accepts → System atomically swaps bus assignments.
    *   Auto-reverts when the swap time expires or swap period manually ended.

3.  **Passenger Management**: Views list of students picked up/waiting at stops.

### 🛡️ Moderator Flow
1.  **Verification**: Reviews pending offline payment proofs, verifies and check payment status in record and then approves.
2.  **Approval**: One-click approval after verification of student application and payment status. 
3.  **Monitoring**: Oversees driver trips and manages all kinds of reassignment updates 
i. Student reassignment in case of bus overloads.
ii. Driver reassignment for driver-bus reassignments.
iii. Bus reassignment for route changes.
4.  **Payment**: Reviews pending offline payment proofs, verifies and check payment status in record and then approves.

### 👑 Admin Flow
1.  **Smart Reassignment**:
    *   Selects candidates by Stop/Shift.
    *   Stages changes to see predicted capacity load.
    *   Able to check for reassignment logs of moderators.
    *   **Rollback Capability**: If the new allocation isn't working, the Admin can click "Rollback" to revert changes immediately.
2.  **Financial Oversight**: Exports encrypted annual reports for audits.
3.  **Lifecycle Management**: Runs automated checks for expired students (Soft Block → Hard Block sequence).
4.  **System Configuration**: Able to review the whole system, and modify the various configurations - App name, renewal notification and soft-hard block date managements, terms and conditions, landing page stats and other system configurations.
---

## 🛠 Technological Architecture

### The "Separation of Concerns" Model

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Primary DB** | **Supabase (PostgreSQL)** | ALL live operational data: GPS tracking, trips, driver swaps, waiting flags, payments (immutable), reassignment logs |
| **Profile DB** | **Firebase Firestore** | Static data only: Student/Driver/Admin profiles, Routes, Buses, Notifications, Config |
| **Realtime** | **Supabase Realtime** | Live updates for GPS, driver swaps, waiting flags via PostgreSQL CDC (Change Data Capture) |
| **Tracking** | **Geolocation API** | Broadcasts coordinates from Driver devices to Supabase |
| **Storage** | **Supabase Storage** | Encrypted archives and payment proofs |
| **Auth** | **Firebase Auth** | User authentication and role-based access control |

---

## ⚡ Core Systems & Features

### 1. Cryptographic Receipts (New)
*   **Integrity**: Receipts are hashed (SHA-256) and signed (RSA-2048) server-side.
*   **Verification**: Scanning a receipt QR re-computes the hash of the *authoritative* DB record and verifies the signature using the public key. Any tampering is instantly detected.
*   **Privacy**: Receipt images are discarded after verification; only the cryptographic record remains.

### 2. Smart Reassignment Engine
*   **Logic**: Balances bus loads by moving students based on stops and shifts.
*   **Safety**: Changes are applied atomically.
*   **Rollback**: Admins have a dedicated option to completely undo a reassignment batch if needed.

### 3. Lifecycle Automation
*   **Soft Block**: Limits app features when a session expires.
*   **Hard Block**: Triggers a deletion sequence (Auth + Data) after a grace period.
*   **Safety**: Destructive actions (deletions) require multi-stage checks and are never automatic without safety gates.

### 4. Driver Swap System
*   **Ephemeral**: Swaps are temporary states that auto-expire.
*   **Atomic**: Updates both drivers and the bus document in a single transaction to prevent "driver-less" buses.

### 5. Missed Bus Recovery
*   **Proximity-Aware**: Intelligently distinguishes between "waiting for approaching bus" vs "genuinely missed bus" (100m threshold).
*   **Driver-Driven**: Requests are broadcast to nearby candidate buses on the same route; first driver to accept wins.
*   **Lightweight**: Uses ephemeral location sharing and minimal DB state (single table, server-only writes) without expensive administrative overrides.

### 6. Multi-Driver Lock System
*   **Exclusive Operation**: Distributed Firestore locks ensure only one driver operates a bus at a specific time.
*   **Auto-Recovery**: Heartbeat-based monitoring automatically releases locks if a driver app crashes or disconnects (>60s).
*   **Zero-Admin**: Fully autonomous system requiring no manual intervention or force-release tools.

---

## 🔒 Security & Cryptography

*   **Payment Isolation**: No payment rows ever touch Firestore. They exist exclusively in Supabase.
*   **Key Management**: Private keys for signing are kept in a secure secret manager (env variables), never committed to code.
*   **Transport Security**: TLS enforced everywhere.
*   **Runtime Guards**: Firestore rules & runtime logic block "unbounded" queries (e.g., fetching all students at once) to protect against quota spikes.

---

## 🚧 Operational Safety
*   **Idempotency**: All critical actions (payments, reassignments) use unique `operation_id` keys to prevent double-processing.
*   **CI/CD Gates**: Code is scanned for secrets and unsafe query patterns before deployment.

---

## 📱 Experience & Access

### 1. Progressive Web App (PWA)
*   **Fully App-Enabled**: The platform is built as a PWA, allowing users to "Install" it on their mobile home screens for an app-like experience without app store overhead.
*   **Standalone Mode**: Launches in a dedicated window without browser address bars, providing an immersive experience.
*   **Performance**: Uses advanced caching and optimized font/image loading (Next.js 14) for near-instant transitions.
*   **Native Shortcuts**: Context-aware home screen shortcuts for "Track Bus" (Students) and "Live Tracking" (Drivers).

### 2. Mobile-First Design
*   **Responsive UI**: Every dashboard (Student, Driver, Admin, Moderator) is fully responsive, tested on multiple viewport sizes from small mobile screens to large desktop monitors.
*   **Adaptive Layouts**: Uses modern CSS (TailwindCSS) and Framer Motion for smooth, touch-friendly interactions and animations.
*   **Optimized Assets**: Dynamic image delivery via Cloudinary ensures that mobile users don't waste data on oversized images.

---

## 🚀 Deployment

### Required Environment Variables

```env
# Core DBs
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...(Server Only)

# Firebase
NEXT_PUBLIC_FIREBASE_Config=...
FIREBASE_ADMIN_KEY=...

# Payments
RZP_KEY_ID=...
RZP_KEY_SECRET=...

# Cryptography (Secret Manager)
DOCUMENT_PRIVATE_KEY=...
DOCUMENT_PUBLIC_KEY=...

# Operational
ADMIN_EMAIL=...
CRON_SECRET=...
```

### Runbook Highlights
1.  **Daily**: Cron jobs check for "Soft Blocks".
2.  **Yearly**: "Archival Export" runs to encrypt and store old data, then purges Supabase tables.
3.  **Emergency**: If Firestore usage spikes, toggle `ENABLE_FIRESTORE_REALTIME` to `false` in the config.

---

**System**: AdtU Integrated Technology Management System (AdtU ITMS)
**License**: Proprietary
