import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getTransportEntitlement, EntitlementResult } from './transport-entitlement';

/**
 * Server-side guard for student transport API routes (Phase 3).
 *
 * Loads the student document and applies the CANONICAL entitlement rule. Use this
 * at the top of any API that delivers transport data or actions (tracking, trip
 * status, waiting flags, missed-bus, driver notifications). Returns the student
 * data on success, or a ready-to-return 403 NextResponse when the caller does not
 * currently own transport access.
 *
 * Usage:
 *   const gate = await requireTransportEntitlement(auth.uid);
 *   if (!gate.ok) return gate.response;
 *   // ...gate.student is entitled
 */
export async function requireTransportEntitlement(
  uid: string
): Promise<
  | { ok: true; student: Record<string, any>; entitlement: EntitlementResult }
  | { ok: false; response: NextResponse }
> {
  let student: Record<string, any> | null = null;
  try {
    const doc = await adminDb.collection('students').doc(uid).get();
    if (doc.exists) {
      student = doc.data() as Record<string, any>;
    } else {
      const q = await adminDb.collection('students').where('uid', '==', uid).limit(1).get();
      if (!q.empty) student = q.docs[0].data() as Record<string, any>;
    }
  } catch {
    student = null;
  }

  const entitlement = getTransportEntitlement(student);
  if (!entitlement.entitled) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Transport access is not active for this account.',
          entitled: false,
          reason: entitlement.reason,
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true, student: student as Record<string, any>, entitlement };
}
