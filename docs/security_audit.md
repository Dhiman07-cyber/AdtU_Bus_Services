# 🔒 ADTU Bus Services — Comprehensive Security Audit & Hardening Plan

> **Audit Date:** 2026-03-11  
> **Codebase:** ADTU Bus Services (Next.js 16 + Firebase + Supabase + Razorpay)  
> **134 API routes analyzed** across payment, trip, driver, student, admin, cron systems

---

## Executive Summary

Your codebase has a **strong security foundation** with:
- ✅ AES-256-GCM encryption service
- ✅ RSA-2048 document signing
- ✅ HMAC-SHA256 receipt security
- ✅ Zod input validation schemas
- ✅ Rate limiter infrastructure
- ✅ Safe error handling
- ✅ Location anti-spoofing service
- ✅ Proxy-level CSRF/DDoS protection
- ✅ CSP + security headers in [next.config.ts](file:///d:/CODING/Personal_S/next.config.ts)

However, **the security tools exist but are NOT consistently applied** across all routes. This audit identifies the gaps and provides fixes.

---

## 🚨 Critical Findings

### 1. Rate Limiting NOT Applied to 132/134 API Routes

| Severity | **CRITICAL** |
|----------|-------------|
| Impact | All API routes except `create-order` and `verify-payment` are vulnerable to abuse/flooding |
| Fix | Apply [applyRateLimit()](file:///d:/CODING/Personal_S/src/lib/security/rate-limiter.ts#158-176) to every API route handler |

**Routes with rate limiting:** 2/134 ❌
- `/api/payment/razorpay/create-order` ✅
- `/api/payment/razorpay/verify-payment` ✅ (partial)
- All 132 other routes: ❌ **NO RATE LIMITING**

### 2. [verifyApiAuth()](file:///d:/CODING/Personal_S/src/lib/security/api-auth.ts#46-192) Used in Only 11/134 Routes

| Severity | **CRITICAL** |
|----------|-------------|
| Impact | Most routes implement ad-hoc auth with `auth.verifyIdToken(body.idToken)` which is inconsistent and error-prone |
| Fix | Migrate all routes to use centralized [verifyApiAuth()](file:///d:/CODING/Personal_S/src/lib/security/api-auth.ts#46-192) |

**Routes using centralized auth:** Only data-read routes
**Routes using ad-hoc `idToken` in body:** Almost ALL trip/driver/student routes

### 3. Trip ID Generated with `Math.random()` — NOT Cryptographically Secure

| Severity | **HIGH** |
|----------|---------|
| Impact | Trip IDs in [start-trip/route.ts](file:///d:/CODING/Personal_S/src/app/api/driver/start-trip/route.ts#L28-L33) use `Math.random()` which is predictable |
| Fix | Use `crypto.randomUUID()` |

### 4. Anti-Spoofing Distance Check Uses `Math.random()` (BROKEN)

| Severity | **HIGH** |
|----------|---------|
| Impact | In [update-location/route.ts](file:///d:/CODING/Personal_S/src/app/api/driver/update-location/route.ts#L171), distance is `Math.random() * 5` — the actual Haversine function is defined but NEVER CALLED |
| Fix | Call the [calculateDistance()](file:///d:/CODING/Personal_S/src/lib/security/location-validation-service.ts#474-491) function with actual coordinates |

### 5. `idToken` Sent in Request Body Instead of Authorization Header

| Severity | **MEDIUM** |
|----------|-----------|
| Impact | Tokens in request body are logged in server logs, included in JSON parsing, and violate HTTP auth conventions |
| Fix | All routes should read tokens from `Authorization: Bearer <token>` header only |

### 6. No Input Validation on Most Routes

| Severity | **HIGH** |
|----------|---------|
| Impact | Zod schemas exist but are only used in 2 payment routes. All trip/driver/student/waiting-flag routes lack schema validation |
| Fix | Apply Zod validation to all route inputs |

### 7. Cron Route `expiry-check` Has Fail-Open Auth

| Severity | **MEDIUM** |
|----------|-----------|
| Impact | The check `if (cronSecret && authHeader !== ...)` means if `cronSecret` is set but header is wrong, it rejects. But the logic order checks for existence differently than other cron routes |
| Fix | Standardize all cron routes to use the [verifyCronAuth()](file:///d:/CODING/Personal_S/src/app/api/cron/cleanup-stale-locks/route.ts#21-34) pattern |

### 8. Service Worker Exposes Firebase Config

| Severity | **LOW** |
|----------|--------|
| Impact | [firebase-messaging-sw.js](file:///d:/CODING/Personal_S/public/firebase-messaging-sw.js) — Firebase config is public by design, but should use env vars |
| Status | Previously addressed per conversation history |

---

## 🛠️ Implementation Plan

### Phase 1: Create Security Middleware Helpers (New File)

Create a unified `withApiSecurity()` wrapper that applies:
1. ✅ Token extraction from `Authorization` header (NOT body)
2. ✅ Firebase Admin token verification
3. ✅ Role-based access control
4. ✅ Rate limiting with appropriate config per endpoint
5. ✅ Input validation via Zod schema
6. ✅ Safe error handling
7. ✅ Security audit logging
8. ✅ Request ID tracking

### Phase 2: Fix Critical Code Bugs

1. **Fix `Math.random()` trip ID** → Use `crypto.randomUUID()`
2. **Fix broken anti-spoofing** → Call actual [calculateDistance()](file:///d:/CODING/Personal_S/src/lib/security/location-validation-service.ts#474-491)
3. **Add missing Zod schemas** for trip, location, heartbeat, swap, waiting-flag inputs

### Phase 3: Harden All API Routes

Apply `withApiSecurity()` to every route, organized by priority:
1. **Payment routes** (create-order, verify-payment, webhook) — HIGHEST
2. **Trip routes** (start-trip, end-trip, start/end-journey-v2) — HIGHEST  
3. **Location routes** (update-location, location/update) — HIGH
4. **Driver action routes** (swap, accept-swap, heartbeat, mark-boarded) — HIGH
5. **Student routes** (waiting-flag, trip-status, payment-history) — HIGH
6. **Admin routes** (all 25 admin endpoints) — MEDIUM
7. **Cron routes** (standardize auth) — MEDIUM
8. **Data read routes** (buses, routes, students, drivers) — LOWER

### Phase 4: Additional Hardening

1. Add `RAZORPAY_WEBHOOK_SECRET` validation check (env var missing from [.env.example](file:///d:/CODING/Personal_S/.env.example))
2. Add `SIGNING_SECRET_KEY` to [.env.example](file:///d:/CODING/Personal_S/.env.example)
3. Add `DOCUMENT_SIGNING_SECRET` to [.env.example](file:///d:/CODING/Personal_S/.env.example)
4. Ensure all webhook routes verify signatures before processing

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/security/api-security.ts` | **CREATE** | Unified security wrapper |
| [src/lib/security/validation-schemas.ts](file:///d:/CODING/Personal_S/src/lib/security/validation-schemas.ts) | **MODIFY** | Add missing schemas |
| [src/app/api/driver/start-trip/route.ts](file:///d:/CODING/Personal_S/src/app/api/driver/start-trip/route.ts) | **MODIFY** | Security hardening |
| [src/app/api/driver/end-trip/route.ts](file:///d:/CODING/Personal_S/src/app/api/driver/end-trip/route.ts) | **MODIFY** | Security hardening |
| [src/app/api/driver/start-journey-v2/route.ts](file:///d:/CODING/Personal_S/src/app/api/driver/start-journey-v2/route.ts) | **MODIFY** | Security hardening |
| [src/app/api/driver/end-journey-v2/route.ts](file:///d:/CODING/Personal_S/src/app/api/driver/end-journey-v2/route.ts) | **MODIFY** | Security hardening |
| [src/app/api/driver/update-location/route.ts](file:///d:/CODING/Personal_S/src/app/api/driver/update-location/route.ts) | **MODIFY** | Fix anti-spoofing + security |
| [src/app/api/driver/heartbeat/route.ts](file:///d:/CODING/Personal_S/src/app/api/driver/heartbeat/route.ts) | **MODIFY** | Security hardening |
| [src/app/api/driver/swap-request/route.ts](file:///d:/CODING/Personal_S/src/app/api/driver/swap-request/route.ts) | **MODIFY** | Security hardening |
| [src/app/api/driver/accept-swap/route.ts](file:///d:/CODING/Personal_S/src/app/api/driver/accept-swap/route.ts) | **MODIFY** | Security hardening |
| [src/app/api/driver/mark-boarded/route.ts](file:///d:/CODING/Personal_S/src/app/api/driver/mark-boarded/route.ts) | **MODIFY** | Security hardening |
| [src/app/api/driver/notify-students/route.ts](file:///d:/CODING/Personal_S/src/app/api/driver/notify-students/route.ts) | **MODIFY** | Security hardening |
| [src/app/api/driver/device-session/route.ts](file:///d:/CODING/Personal_S/src/app/api/driver/device-session/route.ts) | **MODIFY** | Security hardening |
| [src/app/api/location/update/route.ts](file:///d:/CODING/Personal_S/src/app/api/location/update/route.ts) | **MODIFY** | Security hardening |
| [src/app/api/student/waiting-flag/route.ts](file:///d:/CODING/Personal_S/src/app/api/student/waiting-flag/route.ts) | **MODIFY** | Security hardening |
| [src/app/api/cron/expiry-check/route.ts](file:///d:/CODING/Personal_S/src/app/api/cron/expiry-check/route.ts) | **MODIFY** | Standardize cron auth |
| [.env.example](file:///d:/CODING/Personal_S/.env.example) | **MODIFY** | Add missing secret vars |
