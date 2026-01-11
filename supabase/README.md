# Supabase Database Setup

## ⚠️ IMPORTANT

**USE ONLY `COMPLETE_SCHEMA.sql` for database setup!**

This single file contains everything you need - no other SQL files are required.

## How to Setup Database

1. Go to your **Supabase Dashboard**
2. Navigate to **SQL Editor**
3. Copy and paste **ALL contents** from `COMPLETE_SCHEMA.sql`
4. Click **Run**
5. Wait for completion (should see success message)

## What COMPLETE_SCHEMA.sql Contains

### Tables (13 total)
| Table | Purpose |
|-------|---------|
| `bus_locations` | Real-time GPS tracking |
| `driver_status` | Driver operational status |
| `waiting_flags` | Student waiting signals |
| `driver_location_updates` | Historical breadcrumbs |
| `notifications` | System notifications |
| `route_cache` | ORS geometry cache |
| `trip_sessions_archive` | Analytics data |
| `driver_swap_requests` | Driver swap requests |
| `temporary_assignments` | Active swaps |
| `temporary_assignment_history` | Swap history |
| `reassignment_logs` | Audit logs |
| `payments` | Payment records |
| `payment_exports` | Export tracking |

### Security Features
- ✅ **Row Level Security (RLS)** enabled on all tables
- ✅ **Hardened Policies** - Not all data is publicly readable
- ✅ **Service role** required for write operations
- ✅ **User-scoped** read access for sensitive data

### Key Security Policies

| Table | Who Can Read |
|-------|--------------|
| `bus_locations` | Authenticated users |
| `waiting_flags` | Own flags OR drivers of that bus |
| `driver_location_updates` | Own data only |
| `trip_sessions_archive` | Service role only |
| `payments` | Own payments only |
| `reassignment_logs` | Service role only |

### Also Includes
- ✅ All performance indexes
- ✅ Helper functions and triggers
- ✅ Realtime configuration
- ✅ Documentation comments

## Verification

After running COMPLETE_SCHEMA.sql, verify with:

```sql
-- Check all tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Check RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true;

-- Check indexes
SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename;
```

## Files in This Directory

| File | Purpose |
|------|---------|
| `COMPLETE_SCHEMA.sql` | **THE ONLY SQL FILE YOU NEED** |
| `config.toml` | Supabase local config |
| `.gitignore` | Git ignore rules |
| `README.md` | This file |
| `init-data.js` | Optional: seed data |
| `init-tables.js` | Legacy: use SQL instead |
| `run-migrations.js` | Legacy: use SQL instead |

## ❌ DO NOT

- Do not use old migration files (consolidated into COMPLETE_SCHEMA.sql)
- Do not run migrations multiple times (we use IF NOT EXISTS)
- Do not modify RLS policies without security review

## Migration History

| Date | Change |
|------|--------|
| 2025-12-31 | Consolidated all SQL into COMPLETE_SCHEMA.sql |
| 2025-12-31 | Added security-hardened RLS policies |
| 2025-12-31 | Added payments & reassignment_logs tables |
