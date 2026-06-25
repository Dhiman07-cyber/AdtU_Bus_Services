/**
 * Admin Integrity Scan
 *
 * GET /api/admin/integrity-scan
 *   Runs the cross-collection integrity detector on demand and returns a
 *   severity-ranked report. Read-only — never mutates business state.
 *
 * SECURITY: admin-only.
 */

import { NextResponse } from 'next/server';
import { withSecurity } from '@/lib/security/api-security';
import { RateLimits } from '@/lib/security/rate-limiter';
import { runIntegrityScan } from '@/lib/services/integrity-detector';

export const dynamic = 'force-dynamic';

export const GET = withSecurity(
  async () => {
    const report = await runIntegrityScan();
    return NextResponse.json({ success: true, report });
  },
  {
    requiredRoles: ['admin'],
    rateLimit: RateLimits.READ,
  }
);
