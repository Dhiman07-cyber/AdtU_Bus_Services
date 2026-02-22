# ADTU Smart Bus Management System - Frontend Architecture & System Flow

## 1. Overview and Tech Stack
The **Frontend Architecture** is designed to provide a premium, modern, and highly responsive user experience. It serves four primary roles: **Admin, Moderator, Student,** and **Driver**. The application is built entirely as a Single Page Application (SPA) natively integrated into a server-rendered ecosystem.

### Core Technologies
*   **Framework:** Next.js (React 18+, App Router)
*   **Styling:** Custom CSS/TailwindCSS (focus on glassmorphism, dynamic animations, and dark/light modes).
*   **State Management:** React Context / Custom Hooks (e.g., `useTripLock`).
*   **Animations:** Framer Motion & CSS keyframes for high-end micro-interactions, scroll animations, and page transitions.
*   **Map Integration:** Likely Mapbox or Leaflet for live bus tracking.
*   **Real-time Data:** Firebase Web SDK (`onSnapshot`) for live config/data streams.

---

## 2. High-Level UI/UX Philosophy
*   **Premium Visuals:** The interface relies heavily on ambient glows, smooth gradients, layered shadows (for depth), and precise typography.
*   **Dynamic Interactions:** Cards feature hover zoom effects; buttons incorporate "processing" spinners; loading states are explicitly shown using skeleton screens to preserve layout continuity.
*   **Accessibility & Theming:** Deep support for adaptive Light and Dark themes, ensuring stark contrast for text elements while seamlessly blending backgrounds. 

---

## 3. User Flows per Role

### A. Student Flow
**1. Onboarding & Registration**
*   **Flow:** Student logs in -> Checks Application status -> Views dynamic Fee Structure (fetched directly from Firestore system config) -> Fills registration details.
*   **UI Focus:** Multi-step wizard layout with clear validation highlights.
*   **Feature Deep Dive (Payments):** Once approved, the student is redirected to the payment gateway module. The UI polls for the payment success via server webhooks, displaying an optimistic "Processing" overlay to prevent duplicate submissions.

**2. Live Tracking & Missed Bus Feature**
*   **Flow:** Navigates to Map View -> Sees assigned Bus moving via GPS telemetry.
*   **Missed Bus UX:** 
    *   Student taps **"I Missed My Bus"**.
    *   The UI displays one of several dynamic toasts: 
        *   If the bus is < 100m: *"Your assigned bus appears nearby..."*
        *   If searching: *"Searching other buses..."*
        *   If accepted: *"Good news — Bus [No] will pick you up."*
*   **UI Focus:** Real-time polling updates via the `missed_bus_requests` status without heavy page reloads.

### B. Driver Flow
**1. Shift & Lock System**
*   **Flow:** Driver logs into the "Driver App" portal -> Views assigned bus -> Taps **"Start Trip"**.
*   **Feature Deep Dive (useTripLock Hook):** 
    *   The frontend executes a pre-check (`/api/driver/can-operate`). If the bus is locked by another driver, a `TripLockModal` overlays the screen with retry options.
    *   Upon securing the trip lock, a `HeartbeatIndicator` component mounts, confirming to the driver that their location/status is live.
*   **UI Focus:** High-contrast, massive buttons to reduce cognitive load while driving. Clean visual status indicators (Active, Ended, Offline).

### C. Moderator Flow
**1. Approvals & Manual Creation**
*   **Flow:** Moderator accesses Dashboard -> Views pending Student Registrations in a paginated list -> Clicks "Approve" -> Configures assignment variables -> Submits.
*   **UI Focus:** Confirmation modals triggered before sensitive actions (e.g., Deletion, Approvals). Processing states on action buttons immediately disable further interaction to enforce idempotency visually.

### D. Admin Flow
**1. System Configuration**
*   **Flow:** Admin goes to Config page (e.g., `/admin/moderators/config/[id]`) -> Adjusts global params (Deadlines, Fee structures) -> Taps **"Save Configuration"**.
*   **UI Focus:** Toggle buttons with fluid animations. "Transparent container" backgrounds to avoid nested UI boxes. "Processing" indicators immediately lock the form while Firestore transactions resolve. 

---

## 4. Frontend System Components

### A. Authentication & Guards
*   **Guards:** Next.js middleware combined with HOCs (Higher Order Components) route users away from unauthorized sections (e.g., `/admin/*` is securely locked through JWT role claims).

### B. The Application State Layer
*   Frontend leverages global context strictly for **Session** and **Theme**. 
*   **Real-time Synced State:** Utilizes SWR or React Query alongside Firebase SDK listeners to ensure the "Local UI state" exactly mirrors the "Authoritative Firestore State" (resolving the "Drift" problem).

### C. Error Handling & Toasts
*   Global Toast Providers capture and uniformize ORS (OpenRouteService) maintenance failures, API timeouts, and GPS permission denials, displaying contextual instructions to the end-user rather than generic crash screens.
