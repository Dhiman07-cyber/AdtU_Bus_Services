# 🚀 System-Wide Firestore Transition & Configuration Refactor

This document details the critical architectural shift from **File-System Based Data** to **Firestore-Authoritative Data**. This transition ensures that the AdtU Bus Management System is production-ready, allowing real-time administrative updates without code deployments.

---

## 🏗️ Core Objective: "Zero-Deployment" Configuration
Previously, many system settings (Bus Fees, Routes, Deadlines) were stored in JSON files within the codebase. In a production environment, this was a bottleneck: an Admin could not update a fee scale or extend an academic deadline without a programmer committing code and triggering a Vercel/Server build.

**The Refactor Goal**: Transition the entire logic stack (Admin, Moderator, Driver, Student) to fetch all configuration and authoritative data points directly from **Firestore**.

---

## 🛠️ Key Refactoring Pillars

### 1. Authoritative Configuration Services
We introduced centralized services to fetch system-wide parameters:
- **`system-config-service.ts`**: Fetches global settings like `busFee`, `academicYearEnd`, and UI display parameters.
- **`deadline-config-service.ts`**: Fetches the `deadline-config` document which controls active/grace/block periods for student validity.
- **Impact**: All server-side API routes and client-side components now consume these services instead of importing local constants.

### 2. Full API & Role Migration
Every module has been refactored to treat Firestore as the single source of truth:

| Module | Refactor Detail |
| :--- | :--- |
| **Admin** | Managing configs through a dedicated UI. Changes write to Firestore and are reflected instantly system-wide. |
| **Moderator** | Student approvals (`approve-v2`) and manual creations (`create-user`) now fetch dynamic deadlines and fees before committing documents. |
| **Student** | Renewal pages (`renew/page.tsx`) and Application forms fetch dynamic fees and session dates to prevent pricing discrepancies. |
| **Driver** | Shift and route assignments are no longer static; they are live-queried and updated via the `buses` and `drivers` collections. |

### 3. Migration from Filesystem to Cloud
To facilitate this transition, specialized migration logic was implemented:
- **`api/migrate-data/route.ts`**: A bridge endpoint that reads legacy JSON files (like `BUSES.json`) and seeds the `buses` collection in Firestore with proper timestamps and structure.
- **`scripts/seed-firestore-config.ts`**: Initialized the baseline academic rules into the `settings/deadline-config` document.

---

## 🔒 Date Utility & Block Logic Refactor
As part of this transition, the date calculation engine was completely overhauled:
- **`calculateValidUntilDate`**: Now accepts a `deadlineConfig` object fetched from Firestore.
- **`computeBlockDatesFromValidUntil`**: Replaced the old year-number logic with a date-object logic. It calculates `softBlock` (service suspended) and `hardBlock` (data removal) accurately based on the specific validity date of a student.
- **Consistency**: This ensures that if an Admin changes the academic year end from June 30th to July 15th in the Firestore panel, every subsequent calculation across all APIs (Registration, Renewal, Webhook) follows the new rule immediately.

---

## 📈 Production Advantages
1. **Financial Flexibility**: Update bus fees on-the-fly during high-demand periods.
2. **Operational Continuity**: Extend deadlines for students during exam periods without technical intervention.
3. **Data Integrity**: Eliminates the "Drift" between local JSON files and the actual database state.
4. **Auditability**: Every change to the system configuration is recorded in the Firestore audit logs, identifying which Admin made the change.

---
*Document Version: 2.0 (Firestore Migration Complete) | February 9, 2026*
