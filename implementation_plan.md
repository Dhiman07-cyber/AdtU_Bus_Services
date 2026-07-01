# Final Codebase Modernization & Long-Term Maintainability Sweep Plan

This document outlines the implementation plan to modernize the repository, improve developer experience, clean up dead assets/dependencies, and resolve codebase-level maintainability issues in the University Transport Management System (ITMS).

---

## Proposed Changes

### 1. Database & Notification bugfixes (Defects 1, 2, 3, 4)

#### [MODIFY] [fcm-token-service.ts](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/src/lib/services/fcm-token-service.ts)
* Add a centralized function `getValidTokensForUser(userId: string, role?: string): Promise<string[]>` that queries a user's multi-device subcollection (`students/{uid}/tokens` or `drivers/{uid}/tokens`) and falls back to legacy field mappings, ensuring zero notifications are dropped.
* Export this function as the standard interface for retrieving FCM tokens throughout the application.

#### [MODIFY] [report-bus-issue/route.ts](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/src/app/api/report-bus-issue/route.ts)
* Import `FieldValue` directly from `'firebase-admin/firestore'` instead of calling it on the db instance (`adminDb.FieldValue`).
* Replace legacy `auth.messaging()` calls with imports from `@/lib/firebase-admin` utilizing the correctly initialized `adminMessaging`.
* Replace legacy root `fcm_tokens` queries with the new `getValidTokensForUser` helper.

#### [MODIFY] [swap-request/route.ts](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/src/app/api/driver/swap-request/route.ts)
* Replace legacy `adminAuth.messaging()` calls with the `adminMessaging` instance.
* Replace legacied root `fcm_tokens` queries with the new `getValidTokensForUser` helper.

#### [MODIFY] [accept-swap/route.ts](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/src/app/api/driver/accept-swap/route.ts)
* Replace legacy `adminAuth.messaging()` calls with the `adminMessaging` instance.
* Replace legacied root `fcm_tokens` queries with the new `getValidTokensForUser` helper.

#### [MODIFY] [ack-waiting/route.ts](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/src/app/api/ack-waiting/route.ts)
* Replace legacy `adminAuth!.messaging()` calls with the `adminMessaging` instance.
* Replace legacied root `fcm_tokens` queries with the new `getValidTokensForUser` helper.

#### [MODIFY] [create-first-admin/route.ts](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/src/app/api/create-first-admin/route.ts)
* Dynamically adjust the `createdAt` timestamp in `userData` depending on whether `useAdminSDK` is active (using `firebaseAdmin.firestore.FieldValue.serverTimestamp()`) or the Client SDK fallback is used, resolving serialization issues.

#### [MODIFY] [cleanup-expired-students/route.ts](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/src/app/api/cron/cleanup-expired-students/route.ts)
* Refactor query for expired students' FCM tokens to use the centralized helper to prevent dropping cleanup notifications.

#### [MODIFY] [delete-student/route.ts](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/src/app/api/admin/delete-student/route.ts)
* Refactor target student token lookup to use the subcollection-aware helper.

#### [MODIFY] [simulate-deadlines/route.ts](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/src/app/api/admin/simulate-deadlines/route.ts)
* Refactor target student token lookup to use the subcollection-aware helper.

#### [MODIFY] [cleanup/route.ts](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/src/app/api/unauth-users/cleanup/route.ts)
* Safe-delete dead status transitions (`approved`/`rejected`) and keep the document-sweep focused solely on the 45-day inactivity rule.

---

### 2. Dead Code and Unused Files Cleanup (Phase G)

We will remove the 75 unused files identified statically by Knip to reduce the repository footprint and prevent confusion in future development:

* [DELETE] `src/app/driver/Map.tsx`
* [DELETE] `src/app/setup-admin/deploy-rules.tsx`
* [DELETE] `src/app/student/profile/premium-profile.tsx`
* [DELETE] `src/components/AnimatedLoader.tsx`
* [DELETE] `src/components/application/info-row.tsx`
* [DELETE] `src/components/application/PaymentProofUpload.tsx`
* [DELETE] `src/components/bus-pass/SecureQRDisplay.tsx`
* [DELETE] `src/components/BusIssueReport.tsx`
* [DELETE] `src/components/BusMap.tsx`
* [DELETE] `src/components/ConnectionStatusIndicator.tsx`
* [DELETE] `src/components/CreateNotificationModal.tsx`
* [DELETE] `src/components/dashboard/ActiveTripsCard.tsx`
* [DELETE] `src/components/driver/HeartbeatIndicator.tsx`
* [DELETE] `src/components/driver/index.ts`
* [DELETE] `src/components/driver/SessionExpiredModal.tsx`
* [DELETE] `src/components/driver/TripLockModal.tsx`
* [DELETE] `src/components/EditNotificationModal.tsx`
* [DELETE] `src/components/EnhancedBusMap.tsx`
* [DELETE] `src/components/FeedbackCard.tsx`
* [DELETE] `src/components/FeedbackViewModal.tsx`
* [DELETE] `src/components/google-signin-button.tsx`
* [DELETE] `src/components/image-position-picker.tsx`
* [DELETE] `src/components/ImageUpload.tsx`
* [DELETE] `src/components/landing/CTASection.tsx`
* [DELETE] `src/components/landing/FeatureCards.tsx`
* [DELETE] `src/components/landing/FooterMinimal.tsx`
* [DELETE] `src/components/landing/Hero.tsx`
* [DELETE] `src/components/landing/HowItWorks.tsx`
* [DELETE] `src/components/landing/Icon.tsx`
* [DELETE] `src/components/landing/MockupPreview.tsx`
* [DELETE] `src/components/landing/premium/BentoFeatures.tsx`
* [DELETE] `src/components/landing/premium/FloatingCard.tsx`
* [DELETE] `src/components/landing/premium/GradientMesh.tsx`
* [DELETE] `src/components/landing/premium/HeroPremium.tsx`
* [DELETE] `src/components/landing/premium/InteractiveRoles.tsx`
* [DELETE] `src/components/landing/premium/SpotlightCard.tsx`
* [DELETE] `src/components/landing/premium/TimelineProcess.tsx`
* [DELETE] `src/components/landing/RoleHighlights.tsx`
* [DELETE] `src/components/landing/ScrollRevealWrapper.tsx`
* [DELETE] `src/components/landing/StatsBand.tsx`
* [DELETE] `src/components/LocationPermissionRequest.tsx`
* [DELETE] `src/components/MapLive.tsx`
* [DELETE] `src/components/maps/MapProviderPill.tsx`
* [DELETE] `src/components/notifications/NotificationFilters.tsx`
* [DELETE] `src/components/ProcessingOverlay.tsx`
* [DELETE] `src/components/protected-route.tsx`
* [DELETE] `src/components/route-dropdown.tsx`
* [DELETE] `src/components/smart-allocation/ConfirmReassignDialog.tsx`
* [DELETE] `src/components/smart-allocation/SankeyPreview.tsx`
* [DELETE] `src/components/theme-toggle.tsx`
* [DELETE] `src/components/UberLikeDriverMap.tsx`
* [DELETE] `src/components/ui/form.tsx`
* [DELETE] `src/components/ui/navigation-menu.tsx`
* [DELETE] `src/components/ui/separator.tsx`
* [DELETE] `src/components/user-enrollment-form.tsx`
* [DELETE] `src/components/WaitingToggle.tsx`
* [DELETE] `src/config/supabase-tables.ts`
* [DELETE] `src/data/landing.ts`
* [DELETE] `src/hooks/useDriverMissedBusRequests.ts`
* [DELETE] `src/hooks/useFirestoreConnectionStatus.ts`
* [DELETE] `src/hooks/useTripLock.ts`
* [DELETE] `src/lib/coordinate-validator.ts`
* [DELETE] `src/lib/eta-calculator.ts`
* [DELETE] `src/lib/firestore-utils.ts`
* [DELETE] `src/lib/live-tracking-service.ts`
* [DELETE] `src/lib/security/location-validation-service.ts`
* [DELETE] `src/lib/security/server-logger.ts`
* [DELETE] `src/lib/services/auto-split-service.ts`
* [DELETE] `src/lib/services/bus-reassignment-service-v2.ts`
* [DELETE] `src/lib/staging/index.ts`
* [DELETE] `src/lib/staging/stagingAdapter.ts`
* [DELETE] `src/lib/utils/driver-bus-relations.ts`
* [DELETE] `src/lib/utils/safe-storage.ts`
* [DELETE] `src/lib/utils/session.ts`
* [DELETE] `src/lib/utils/verification.ts`

---

### 3. Unused Dependencies Cleanup (Phase H)

We will remove unused dependencies from `package.json` to keep the bundle slim and avoid security exposure:

#### [MODIFY] [package.json](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/package.json)
* Remove: `@hookform/resolvers`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-separator`, and `@radix-ui/react-switch`.
* Remove unused devDependencies: `@eslint/eslintrc`, `@testing-library/jest-dom`, `@testing-library/react`, `@types/d3-axis`, `@types/d3-drag`, `@types/d3-geo`, `@types/w3c-screen-orientation`, and `tw-animate-css`.

---

## Recommended Implementation Order

1. **Step 1**: Implement `getValidTokensForUser` in `src/lib/services/fcm-token-service.ts`.
2. **Step 2**: Apply changes to all notification API routes (`report-bus-issue`, `swap-request`, `accept-swap`, `ack-waiting`) to leverage the new central helper and fix Firebase `.messaging()` & `FieldValue` runtime crashes.
3. **Step 3**: Fix Admin bootstrap serialization mismatch in `create-first-admin/route.ts`.
4. **Step 4**: Update cron jobs and admin routes to query tokens from subcollections.
5. **Step 5**: Remove the 75 unused files.
6. **Step 6**: Remove unused packages from `package.json` and run `npm install`.

---

## Verification Plan

### Automated Tests
* We will run all existing tests to verify zero regressions:
  ```powershell
  npx tsc --noEmit
  npm run build
  npx vitest run
  ```
* We will verify that TypeScript compilation and ESLint linting return 0 errors after file removals.
