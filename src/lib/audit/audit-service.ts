import { adminDb, FieldValue } from '@/lib/firebase-admin';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 4 — Tiered Audit Service
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Two durability tiers, deliberately separated so each business action and each
 * operational event gets the guarantee it needs without over-engineering the
 * already-completed Phase 1/2/3 transaction paths:
 *
 *   TIER A — Business-Critical Mutations (lifecycle / entitlement / capacity /
 *            ownership). The audit record is written INSIDE the same Firestore
 *            transaction as the mutation via `writeAuditInTransaction`.
 *            Guarantee: the mutation commits IF AND ONLY IF its audit commits.
 *            There is NO best-effort logging for these paths.
 *
 *   TIER B — Operational Events (notifications, reminders, reconciliation /
 *            integrity reports, cleanup summaries, monitoring). Written
 *            best-effort via `recordOperationalEvent`; if the write fails we
 *            persist an `audit_failure` record so the loss is DETECTABLE and
 *            REPLAYABLE (see `replayAuditFailures`). Operational telemetry is
 *            never silently dropped.
 *
 * Schema compatibility: the emitted document is a SUPERSET of the legacy
 * `activity_logs` shape (it keeps `action`, `performedBy`, `actorName`,
 * `actorRole`, `targetId`, `targetName`, `reason`, `details`, `timestamp`) so
 * every existing reader keeps working, while adding the canonical Phase 4 fields
 * (`actorId`, `targetType`, `before`, `after`, `correlationId`, `createdAtISO`).
 */

export const AUDIT_COLLECTION = 'activity_logs';
export const AUDIT_FAILURE_COLLECTION = 'audit_failures';

export type AuditActorRole = 'admin' | 'moderator' | 'system' | 'student' | 'driver';

export interface AuditActor {
  id: string;
  role: AuditActorRole;
  name?: string;
}

export interface AuditEntry {
  /** Canonical action verb, e.g. 'application_approved', 'student_hard_deleted'. */
  action: string;
  /** Who performed it. Use { id: 'system', role: 'system' } for cron/automated paths. */
  actor: AuditActor;
  /** Primary subject id (student uid, application id, bus id, …). */
  targetId: string;
  /** Subject collection/kind, e.g. 'student' | 'application' | 'renewal_request' | 'bus'. */
  targetType?: string;
  /** Human-readable subject label for fast scanning. */
  targetName?: string;
  /** WHY the action happened (business reason / trigger). */
  reason?: string;
  /** Compact snapshot of relevant state before the change (WHAT changed). */
  before?: Record<string, unknown> | null;
  /** Compact snapshot of relevant state after the change. */
  after?: Record<string, unknown> | null;
  /** Any extra action-specific metadata. */
  details?: Record<string, unknown>;
  /** Ties together the multiple audit rows emitted by one logical operation. */
  correlationId?: string;
}

type AuditDoc = Record<string, unknown>;

/**
 * Build the persisted audit document.
 * @param useServerTimestamp when false, only the ISO timestamp is set (used for
 *        the `audit_failure` outbox payload where a nested serverTimestamp would
 *        be awkward to replay).
 */
function buildAuditDoc(entry: AuditEntry, useServerTimestamp = true): AuditDoc {
  const doc: AuditDoc = {
    action: entry.action,
    // Canonical Phase 4 actor fields …
    actorId: entry.actor.id,
    actorRole: entry.actor.role,
    actorName: entry.actor.name ?? null,
    // … plus the legacy field name kept for backward-compatible readers.
    performedBy: entry.actor.id,
    targetId: entry.targetId,
    targetType: entry.targetType ?? null,
    targetName: entry.targetName ?? null,
    reason: entry.reason ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    details: entry.details ?? {},
    correlationId: entry.correlationId ?? null,
    // Sortable, always-present ISO timestamp (survives serverTimestamp gaps).
    createdAtISO: new Date().toISOString(),
  };
  if (useServerTimestamp) {
    doc.timestamp = FieldValue.serverTimestamp();
  }
  return doc;
}

/**
 * TIER A — write an audit record inside an existing Firestore transaction.
 *
 * Call this from within `adminDb.runTransaction(...)` AFTER all transaction
 * reads. The audit row commits atomically with the business mutation: if the
 * transaction aborts/rolls back, no orphan audit row is left behind; if it
 * commits, the audit row is guaranteed present.
 */
export function writeAuditInTransaction(
  transaction: FirebaseFirestore.Transaction,
  entry: AuditEntry,
): void {
  const ref = adminDb.collection(AUDIT_COLLECTION).doc();
  transaction.set(ref, buildAuditDoc(entry));
}

/**
 * TIER A (convenience) — run a business mutation and its audit in ONE
 * transaction. The callback receives the transaction and must return the
 * AuditEntry (or an array of entries) describing what it changed. The entries
 * are written within the same transaction, so mutation ⟺ audit is atomic.
 */
export async function mutateWithAudit<T>(
  fn: (transaction: FirebaseFirestore.Transaction) => Promise<{ result: T; audit: AuditEntry | AuditEntry[] }>,
): Promise<T> {
  return adminDb.runTransaction(async (transaction: FirebaseFirestore.Transaction) => {
    const { result, audit } = await fn(transaction);
    const entries = Array.isArray(audit) ? audit : [audit];
    for (const entry of entries) {
      writeAuditInTransaction(transaction, entry);
    }
    return result;
  });
}

/**
 * TIER B — record an operational event best-effort.
 *
 * On success: one `activity_logs` row. On failure: one `audit_failures` row so
 * the lost event is detectable (admins can query unrecovered failures) and
 * replayable (see `replayAuditFailures`). Never throws.
 */
export async function recordOperationalEvent(entry: AuditEntry): Promise<void> {
  try {
    await adminDb.collection(AUDIT_COLLECTION).add(buildAuditDoc(entry));
  } catch (err: unknown) {
    try {
      await adminDb.collection(AUDIT_FAILURE_COLLECTION).add({
        kind: 'operational_event',
        payload: buildAuditDoc(entry, /* useServerTimestamp */ false),
        error: err instanceof Error ? err.message : String(err),
        recovered: false,
        createdAtISO: new Date().toISOString(),
      });
    } catch (nestedErr) {
      // Last resort only — both the primary write and the outbox failed.
      console.error('CRITICAL: audit + audit_failure both failed for', entry.action, nestedErr);
    }
  }
}

/**
 * Build a proper AuditEntry from a Phase 4 outbox record's root-level fields.
 *
 * Phase 4 outbox writers (payment_student_validity_sync,
 * payment_status_dual_write_divergence, webhook_payment_sync_pending,
 * trip_supabase_end_failure) store their data at the document root, NOT inside
 * a `payload` field. This helper translates each kind into a valid AuditEntry
 * so the replay creates a meaningful, admin-visible audit record in
 * `activity_logs` instead of a near-empty garbage row.
 */
function buildRecoveryAuditEntry(data: Record<string, unknown>): AuditEntry {
  const kind = (data.kind as string) || 'unknown';
  switch (kind) {
    case 'payment_student_validity_sync':
      return {
        action: 'recovery_payment_student_validity_sync',
        actor: SYSTEM_ACTOR,
        targetId: (data.studentUid as string) || (data.paymentId as string) || 'unknown',
        targetType: 'student',
        reason: (data.error as string) || 'Student validity update failed after 3 retries',
        details: {
          paymentId: data.paymentId,
          studentUid: data.studentUid,
          paymentStatus: data.paymentStatus,
          studentValidityUpdated: data.studentValidityUpdated,
        },
      };
    case 'payment_status_dual_write_divergence':
      return {
        action: 'recovery_payment_status_divergence',
        actor: SYSTEM_ACTOR,
        targetId: (data.paymentId as string) || 'unknown',
        targetType: 'payment',
        reason: `Supabase: ${data.supabaseSuccess}, Firestore: ${data.firestoreSuccess}`,
        details: {
          paymentId: data.paymentId,
          newStatus: data.newStatus,
          supabaseSuccess: data.supabaseSuccess,
          firestoreSuccess: data.firestoreSuccess,
        },
      };
    case 'webhook_payment_sync_pending':
      return {
        action: 'recovery_webhook_payment_sync_pending',
        actor: SYSTEM_ACTOR,
        targetId: (data.paymentId as string) || 'unknown',
        targetType: 'payment',
        reason: (data.error as string) || 'Webhook payment sync pending — Supabase ledger entry missing',
        details: {
          paymentId: data.paymentId,
        },
      };
    case 'trip_supabase_end_failure':
      return {
        action: 'recovery_trip_supabase_end_failure',
        actor: SYSTEM_ACTOR,
        targetId: (data.tripId as string) || 'unknown',
        targetType: 'trip',
        reason: (data.error as string) || 'Supabase active_trips status update failed',
        details: {
          tripId: data.tripId,
          driverId: data.driverId,
          busId: data.busId,
        },
      };
    default:
      return {
        action: `recovery_unknown_${kind}`,
        actor: SYSTEM_ACTOR,
        targetId: 'unknown',
        targetType: 'unknown',
        reason: `Unknown outbox kind: ${kind}`,
        details: data as Record<string, unknown>,
      };
  }
}

/**
 * Recovery — replay unrecovered `audit_failures` back into `activity_logs`.
 *
 * Two replay strategies dispatched by `kind`:
 *
 *   1. `operational_event` — the original Tier B audit write failed. Replays the
 *      stored `data.payload` (a complete AuditDoc) directly into `activity_logs`.
 *
 *   2. Phase 4 outbox kinds — a cross-system operation failed and the outbox
 *      record was written at the document root (no `payload` wrapper). Builds a
 *      proper AuditEntry from root-level fields so the admin audit trail is
 *      complete and searchable.
 *
 * Returns the number of events successfully replayed. Safe to run repeatedly
 * (each failure is marked `recovered: true` once its row lands). Idempotent:
 * re-replaying a record creates a duplicate audit entry (tagged
 * `replayedFromFailure: true`) but never corrupts state. Bounded by `limit`
 * per invocation to prevent runaway processing.
 */
export async function replayAuditFailures(limit = 200): Promise<{ replayed: number; remaining: number }> {
  const snap = await adminDb
    .collection(AUDIT_FAILURE_COLLECTION)
    .where('recovered', '==', false)
    .limit(limit)
    .get();

  let replayed = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    try {
      let auditDoc: AuditDoc;

      if (data.kind === 'operational_event' && data.payload) {
        // Tier B replay: the original audit write failed; replay the stored payload as-is.
        auditDoc = { ...(data.payload as Record<string, unknown>), timestamp: FieldValue.serverTimestamp(), replayedFromFailure: true };
      } else {
        // Phase 4 outbox kinds: build a proper AuditEntry from root-level fields.
        const entry = buildRecoveryAuditEntry(data);
        auditDoc = { ...buildAuditDoc(entry), replayedFromFailure: true, outboxKind: data.kind };
      }

      await adminDb.collection(AUDIT_COLLECTION).add(auditDoc);
      await doc.ref.update({ recovered: true, recoveredAtISO: new Date().toISOString() });
      replayed++;
    } catch (err) {
      console.error('Failed to replay audit failure', doc.id, err);
    }
  }

  const remainingSnap = await adminDb
    .collection(AUDIT_FAILURE_COLLECTION)
    .where('recovered', '==', false)
    .count()
    .get()
    .catch(() => null);

  return {
    replayed,
    remaining: remainingSnap ? remainingSnap.data().count : -1,
  };
}

/**
 * Resolve the acting user's display identity for an audit actor. Reuses the
 * admins/moderators/users lookup. MUST be called BEFORE opening a transaction
 * (it performs reads) for Tier A paths.
 */
export async function resolveActor(actorId: string): Promise<AuditActor> {
  try {
    const [adminSnap, modSnap] = await adminDb.getAll(
      adminDb.collection('admins').doc(actorId),
      adminDb.collection('moderators').doc(actorId),
    );
    if (adminSnap.exists) {
      const d = adminSnap.data();
      return { id: actorId, role: 'admin', name: d?.fullName || d?.name || 'Admin' };
    }
    if (modSnap.exists) {
      const d = modSnap.data();
      return { id: actorId, role: 'moderator', name: d?.fullName || d?.name || 'Moderator' };
    }
  } catch (err) {
    console.error('resolveActor lookup failed for', actorId, err);
  }
  return { id: actorId, role: 'system', name: 'Unknown' };
}

/** Convenience constant for automated / cron actors. */
export const SYSTEM_ACTOR: AuditActor = { id: 'system', role: 'system', name: 'System (automated)' };
