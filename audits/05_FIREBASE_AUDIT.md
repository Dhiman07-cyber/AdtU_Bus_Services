# Firebase Audit - Authentication, Rules & Services Review

## 1. Executive Summary
Firebase acts as the system's identity manager and demographic profiles database. It handles user authentication (Google Provider), stores user and role documents (Students, Drivers, Moderators, Admins), and manages FCM (Firebase Cloud Messaging) tokens. The client-side configuration includes fallback checks for serverless builds, and Firestore access is secured via database rules.

* **Firebase Auth Integration:** 8/10
* **Firestore Security Rules:** 7/10
* **Firebase Admin SDK Setup:** 8/10
* **Push Notification Routing:** 7/10

---

## 2. Purpose of Subsystem
Firebase is used to:
1. Provide single sign-on (SSO) authentication for students and university staff.
2. Store demographic records, route schedules, and bus capacity metrics.
3. Deliver push notifications for bus arrivals and renewal deadlines.
4. Protect student identity and profile data against direct client extraction.

---

## 3. Current Implementation Inventory
* `src/lib/firebase.ts` - Client Firebase SDK initialization.
* `src/lib/firebase-admin.ts` - Server-side Firebase Admin SDK initialization.
* `firestore.rules` - Firestore database rules.
* `firestore.indexes.json` - Firestore index configurations.
* `src/contexts/auth-context.tsx` - Authentication states and data listeners.

---

## 4. End-to-End User Authentication Flow
1. **Google Sign-In:** The user clicks the login button. The client triggers `signInWithPopup(auth, GoogleAuthProvider)` via `signInWithGoogle()`.
2. **Authoritative Lookup:** The system queries `db.collection('users').doc(user.uid)` to verify if the account is pre-registered.
3. **Pre-created Account Migration:** If the document exists under an email-based ID, the backend migrates the data to a UID-based document and deletes the email-based document.
4. **Application Redirect:** If the user doc does not exist, the client sets `needsApplication = true` and redirects the user to `/apply/form`.
5. **Real-time Synchronization:** A Firestore `onSnapshot` listener binds the user's local state to their role-specific document, updating the UI if administrative actions occur.

---

## 5. Firestore Rules & Security Observations
* **Self-Escalation Shield (CONFIRMED):** In `users/{userId}` rules, users can modify their profile data but are blocked from changing their `role` field.
* **Role Check Reads (CONFIRMED):** In `firestore.rules`, user roles are checked by calling `exists()` (e.g. `exists(/databases/$(database)/documents/moderators/$(uid))`). Every check triggers a billable Firestore document read.
* **Write Restrict Fields (CONFIRMED):** Students can update non-sensitive student fields, but updates to `validUntil`, `status`, `assignedBusId`, or `shift` are blocked by rules matching authenticated user inputs.

---

## 6. Failure Scenarios & Database Edge Cases

### A. FCM Messaging Not Supported by Browser
* **Impact (CONFIRMED):** If a user launches the app in Brave or a browser with push notifications disabled, `getMessaging(app)` throws a `messaging/unsupported-browser` exception.
* **Result:** The system catches the exception and disables notifications gracefully. The core application remains functional.

### B. Firestore Permission Denied (New Registration)
* **Impact (CONFIRMED):** When a new user logs in, Firestore rules block direct collection reads, causing the `onSnapshot` listener to throw a permission denied error.
* **Result:** The `auth-context` intercepts the error and flags `needsApplication = true`, directing the student to the registration form.

---

## 7. Technical Debt
* **CONFIRMED:** Using `exists()` in Firestore rules increases query read costs and transaction billing.
* **CONFIRMED:** Legacy script references in `package.json` point to missing database cleanup scripts.

---

## 8. Production Risks & Recommendations

### Finding: Firestore Quota Depletion via exists() Rules
* **Severity:** High
* **Real-world Impact:** High student traffic can rapidly deplete the free-tier Firestore read quota, causing service disruptions.
* **Immediate Recommendation:** Configure Custom Claims in Firebase Auth during registration or approval, and check roles in `firestore.rules` using `request.auth.token.role` instead of calling `exists()`.

### Finding: Stale FCM Token Retention
* **Severity:** Medium
* **Real-world Impact:** Failed notification pushes delay deliveries when a user updates their device.
* **Immediate Recommendation:** Run a periodic backend sweep to remove FCM tokens that return invalid responses from the Firebase API.

---

## 9. Cross-References
* Database Architecture details: [04_DATABASE_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/04_DATABASE_AUDIT.md)
* Security & Custom Claims: [07_SECURITY_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/07_SECURITY_AUDIT.md)
