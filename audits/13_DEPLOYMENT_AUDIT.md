# Deployment Audit - Serverless hosting & HTTP Security Review

## 1. Executive Summary
The application is deployed on Vercel, integrating serverless Node.js functions with edge asset delivery. The build configuration (`next.config.ts`) incorporates compiler optimizations, webpack vendor chunk splitting, and remote image security patterns. The deployment includes a strict HTTP Content Security Policy (CSP), Cross-Origin policies, and a Vercel cron worker schedule. However, a major discrepancy exists in the cron execution intervals for stale lock cleanups.

* **Build Configuration:** 9/10
* **HTTP Security Headers:** 10/10
* **Vercel Cron Alignment:** 6/10
* **CDN Caching Optimization:** 8/10

---

## 2. Purpose of Subsystem
The deployment configurations are designed to:
1. Compile and bundle Next.js 16 (React 19) serverless endpoints.
2. Direct client traffic to edge caches and verify CORS headers.
3. Manage scheduled database sweeps and cleanups via Vercel Cron.
4. Enforce strict transport security (HSTS) and sandbox frames to protect transactional data.

---

## 3. Deployment Inventory & Webpack Configuration
* `vercel.json` - Defines cron job endpoints and execution frequencies.
* `next.config.ts` - Hosts Next.js configs, compiler flags, and webpack vendor splitting rules.
* `package.json` - Lists the build pipeline scripts.

### Chunk Splitting rules (`next.config.ts`)
Webpack divides dependencies into cached chunks to reduce initial page load weights:
* `firebase`: Handles all `@firebase` and `firebase` imports.
* `supabase`: Groups `@supabase` imports.
* `uiLibs`: Combines Radix UI, Lucide, Framer Motion, and Recharts.
* `vendor`: Bundles other general dependencies.

---

## 4. End-to-End Build & Deployment Flow
1. **Source Push:** Code is pushed to git. Vercel triggers a deployment build.
2. **Next.js Compilation:** Webpack processes files, optimizing package imports (`lucide-react`, `framer-motion`, etc.) and removing console statements.
3. **Cron Registration:** Vercel parses `vercel.json` and updates the scheduler according to the specified paths and cron schedules.
4. **Edge CDN Binding:** Assets are pushed to edge locations, and security header rules are registered.

---

## 5. Security & CSP Configuration
* **HSTS Enforcements (CONFIRMED):** In `next.config.ts`, Strict-Transport-Security is enabled in production, forcing HTTPS access.
* **COOP Integration (CONFIRMED):** The Cross-Origin-Opener-Policy is set to `same-origin-allow-popups`, enabling Google OAuth sign-in popups.
* **Content Security Policy (CONFIRMED):** Next.js headers inject a detailed CSP restricting script origins (only allows Google, Vercel, and Razorpay) and workers (MapLibre uses `blob:`).

---

## 6. Failure Scenarios & Deployment Edge Cases

### A. Heartbeat Lock Recovery Delay
* **Scenario:** A driver logs off or loses cellular connectivity.
* **Impact (CONFIRMED):** The README states locks are cleared automatically within minutes. However, `vercel.json` schedules `cleanup-stale-locks` once daily (`0 4 * * *` - 4:00 AM).
* **Result:** The bus remains locked for the rest of the day, blocking other drivers unless cleared manually.

### B. Deployment with Missing API Variables
* **Impact (CONFIRMED):** Vercel builds succeed even if env keys are missing.
* **Result:** The app crashes at runtime when users attempt payments or receipt verification.

---

## 7. Technical Debt
* **CONFIRMED:** `vercel.json` uses a daily schedule for stale lock cleanups instead of the minutely schedule documented in the README.

---

## 8. Production Risks & Recommendations

### Finding: Stale Lock Cleanup Runs Only Once Daily
* **Severity:** Critical
* **Real-world Impact:** Stale driver trip locks block vehicle operation for hours, disrupting university transit schedules.
* **Immediate Recommendation:** Update the cron schedule for `/api/cron/cleanup-stale-locks` in `vercel.json` to run every 5 minutes (e.g. `*/5 * * * *`).

### Finding: Static Build Lacks Env Validation
* **Severity:** Medium
* **Real-world Impact:** Broken builds can deploy to production if environment variables are missing during setup.
* **Immediate Recommendation:** Configure a pre-build check inside the deployment pipeline to validate required variables.

---

## 9. Cross-References
* Backend services: [02_BACKEND_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/02_BACKEND_AUDIT.md)
* API endpoints security: [09_API_AUDIT.md](file:///c:/Users/ADMIN/Desktop/Projects/ITMS/audits/09_API_AUDIT.md)
