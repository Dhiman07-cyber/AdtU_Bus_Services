# API Security Inventory

This inventory tracks security wrapper coverage and prioritized risk buckets for routes in `src/app/api`.

## Coverage Snapshot
- **Wrapped with `withSecurity`**: role-protected API surface for most driver/student/admin critical paths.
- **Wrapped with `withCronSecurity`**: cron endpoints requiring `CRON_SECRET`.
- **Legacy/manual auth routes**: still present and should be migrated to wrapper-based guards in follow-up batches.

## P0 Hardened in This Pass
- `src/app/api/admin/force-fix-bus-drivers/route.ts`
- `src/app/api/admin/fix-all-swap-issues/route.ts`
- `src/app/api/admin/fix-driver-status/route.ts`
- `src/app/api/driver-swap/check-expired/route.ts`
- `src/app/api/cron/cleanup-swaps/route.ts`
- `src/app/api/create-first-admin/route.ts`
- `src/app/api/analytics/route.ts`

## Remaining High Priority Buckets
- Migrate all mutable settings/admin endpoints to strict `requiredRoles: ['admin']`.
- Migrate legacy routes that parse raw JSON without schema validation.
- Consolidate Supabase usage to server singleton utility.
- Add centralized distributed rate limiting for multi-instance deployments.
