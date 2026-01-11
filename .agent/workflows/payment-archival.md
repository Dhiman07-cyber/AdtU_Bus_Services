# Payment Archival & Cleanup System

## Overview

This system implements a **safe, permanent, and storage-efficient payment lifecycle** where:

1. **Supabase** stores active yearly payment data (for dashboards, reports, refunds)
2. **Firestore** permanently stores **minimal student payment history**
3. **Students never lose transaction history**
4. **Supabase is cleaned yearly** without breaking validity, history, or audits

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   ACTIVE PAYMENTS                            │
│                   (Supabase - payments table)                 │
│                                                               │
│   • Online & Offline payments                                │
│   • Admin dashboards, reports                                │
│   • Refund processing                                        │
│   • CLEANED YEARLY after archival                            │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Annual Archival (July 31)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                ARCHIVED PAYMENTS                             │
│          (Firestore - students/{id}/paymentHistory)          │
│                                                               │
│   • Minimal format (year, mode, amount, paidAt, duration)   │
│   • Max 6 entries per student                                │
│   • Used for student history view                            │
│   • Used for validity calculation                            │
│   • PERMANENT - never deleted                                │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Types (`src/lib/types/payment-archival.ts`)

- `ArchivedPaymentEntry` - Minimal payment record stored in student document
- `AnnualArchivalResult` - Result of the archival operation
- `ArchivalConfig` - Configuration for the archival process
- Utility functions for conversion, deduplication, and validity calculation

### 2. Service (`src/lib/services/payment-archival.service.ts`)

The `PaymentArchivalService` handles:

1. **Fetch payments** from Supabase for the financial year
2. **Group by student** 
3. **Archive to Firestore** student documents
4. **Verify archival success** before any cleanup
5. **Cleanup Supabase** only after verification passes

### 3. Cron Job (`src/app/api/cron/annual-export/route.ts`)

Triggered on **soft block date (July 31)** via Vercel Cron:

1. Fetches all payments for the academic year
2. Runs payment archival to Firestore
3. Verifies archival success
4. Generates PDF report
5. Sends email to admin
6. ONLY THEN cleans up Supabase

### 4. Student Payment History API (`src/app/api/student/payment-history/route.ts`)

Returns archived payment history from Firestore (works after cleanup).

## Firestore Student Structure

```typescript
students/{studentId} {
  ...existingFields,
  paymentHistory: [
    {
      year: "2024-2025",
      mode: "online" | "offline",
      amount: 4500,
      paidAt: "2025-06-12T10:41:00Z",
      durationMonths: 12,
      orderId?: "order_KJH89...",      // online only
      paymentId?: "pay_LKM78...",      // online only
      verifiedBy?: "Admin (Admin)"     // offline only
    }
  ],
  paymentHistoryUpdatedAt: Timestamp
}
```

## Safety Rules (NON-NEGOTIABLE)

1. ❌ **NEVER** delete Supabase before Firestore archival success
2. ❌ **NEVER** delete Supabase before email success
3. ❌ **NEVER** delete Supabase if verification fails
4. ✅ Archival is **idempotent** - can safely re-run
5. ✅ **Max 6 entries** per student (oldest removed if exceeded)
6. ✅ **Deduplication** prevents duplicate entries

## Testing

### Dry Run (No writes/deletes)
```bash
curl "https://yoursite.com/api/cron/annual-export?cleanup=true&dryrun=true"
```

### Manual Trigger with Cleanup
```bash
curl "https://yoursite.com/api/cron/annual-export?cleanup=true"
```

### Check Student Payment History
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://yoursite.com/api/student/payment-history?uid=studentUid123"
```

## Validity Calculation After Cleanup

After Supabase cleanup, student validity is calculated from Firestore:

```typescript
import { getCurrentValidityFromHistory } from '@/lib/types/payment-archival';

// Get paymentHistory from student document
const validUntil = getCurrentValidityFromHistory(paymentHistory);
// Returns ISO date string of when validity expires
```

## Cron Schedule

The annual archival runs automatically on **July 31 at 9:00 AM IST**:

```json
{
  "path": "/api/cron/annual-export?cleanup=true",
  "schedule": "30 3 31 7 *",
  "comment": "Annual payment export, archival, and cleanup on July 31"
}
```

## Flow Diagram

```
[July 31 - Soft Block Date]
           │
           ▼
┌──────────────────────┐
│ Fetch Supabase       │
│ Payments for FY      │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Group by Student     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Archive to Firestore │
│ (each student)       │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Verification Gate    │
│ (80%+ success rate)  │
└────────┬─────┬───────┘
         │     │
    PASS │     │ FAIL
         │     │
         ▼     └───────► [ABORT - No cleanup]
┌──────────────────────┐
│ Generate PDF Report  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Send Email to Admin  │
└────────┬─────┬───────┘
         │     │
    SENT │     │ FAILED
         │     │
         ▼     └───────► [ABORT - No cleanup]
┌──────────────────────┐
│ Cleanup Supabase     │
│ (delete completed)   │
└──────────┬───────────┘
           │
           ▼
       [DONE ✓]
```
