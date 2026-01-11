---
description: Export payment reports safely (read-only, no deletion)
---

# Payment Export Workflow (Safe - Read Only)

This workflow describes how to export payment data for reporting purposes.

## ⚠️ CRITICAL ARCHITECTURE RULES

1. **Supabase `payments` table is the SINGLE SOURCE OF TRUTH**
2. **NEVER delete payment records** - they are permanent financial records
3. **Firestore is NOT used for payments** - all payment data is in Supabase
4. **Exports are READ-ONLY** - no data is modified during export

---

## Option 1: Using the API (Recommended)

### Generate Annual Export Report

```bash
# Export current academic year
curl -X GET "https://your-domain.com/api/cron/annual-export"

# Export specific financial year (e.g., 2024-2025)
curl -X GET "https://your-domain.com/api/cron/annual-export?year=2024"

# Export custom date range (e.g., 2021-2025)
curl -X GET "https://your-domain.com/api/cron/annual-export?startYear=2021&endYear=2025"
```

The API will:
1. ✅ Fetch payment records from Supabase
2. ✅ Generate a PDF report
3. ✅ Email the report to ADMIN_EMAIL
4. ✅ Record the export in `payment_exports` table
5. ❌ NO deletion of payment records

---

## Option 2: Using the CLI Script

### Prerequisites
- Node.js installed
- Environment variables configured in `.env.local`

### Run Export

```bash
# Change to project directory
cd Personal_S

# Dry run (no email sent)
node scripts/yearly_payment_export_and_cleanup.js --dry

# Export current academic year
node scripts/yearly_payment_export_and_cleanup.js

# Export specific year (e.g., 2024-2025)
node scripts/yearly_payment_export_and_cleanup.js --year=2024

# Export custom date range
node scripts/yearly_payment_export_and_cleanup.js --start=2021 --end=2025
```

### Note About --cleanup Flag

**The `--cleanup` flag is IGNORED.** If you pass it, you will see:

```
⚠️  WARNING: --cleanup flag is IGNORED
    Payment deletion has been PERMANENTLY DISABLED.
    Payments are immutable financial records.
```

---

## Viewing Payment History

### For Students (via API)

```bash
# Get student's payment history
curl -H "Authorization: Bearer <token>" \
  "https://your-domain.com/api/student/payment-history?uid=<student_uid>"
```

Supports pagination:
- `limit` - Number of records per page (max 100)
- `offset` - Starting position

### For Admins (via Supabase Dashboard)

1. Log into Supabase Dashboard
2. Navigate to Table Editor → `payments`
3. Use filters to query specific students/dates
4. Export to CSV if needed

---

## Database Schema

The `payments` table structure:

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Auto-generated primary key |
| payment_id | TEXT | Unique payment identifier |
| student_id | TEXT | Student enrollment ID |
| student_uid | TEXT | Student Firebase UID |
| amount | NUMERIC | Payment amount in INR |
| method | TEXT | "Online" or "Offline" |
| status | TEXT | "Pending" or "Completed" |
| session_start_year | INTEGER | Academic session start |
| session_end_year | INTEGER | Academic session end |
| transaction_date | TIMESTAMPTZ | Payment date |
| created_at | TIMESTAMPTZ | Record creation time |

---

## Troubleshooting

### Q: I need to delete a payment record

**A: You cannot.** Payments are immutable financial records. If there's an error:
- Create a new correcting entry
- Update the status if needed
- Contact database administrator for audit review

### Q: Payment history is not showing for a student

**A: Check:**
1. Student UID is correct
2. Payments exist in Supabase `payments` table
3. API call includes valid authentication token

### Q: Export email is not working

**A: Verify:**
1. `ADMIN_EMAIL` is set in environment
2. `GMAIL_USER` and `GMAIL_PASS` are configured
3. Gmail app password is valid (not regular password)

---

## Related Files

- API: `src/app/api/cron/annual-export/route.ts`
- CLI: `scripts/yearly_payment_export_and_cleanup.js`
- Schema: `supabase/COMPLETE_SCHEMA.sql`
