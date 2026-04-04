/**
 * Rollback API Route
 * 
 * POST /api/reassignment-logs/rollback - Execute rollback of a committed operation
 * GET /api/reassignment-logs/rollback?operationId=xxx - Validate rollback feasibility
 * 
 * SECURITY: Uses withSecurity wrapper. Admin-only access for rollback operations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { adminDb } from '@/lib/firebase-admin';
import { withSecurity } from '@/lib/security/api-security';
import { RateLimits } from '@/lib/security/rate-limiter';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

interface ChangeRecord {
    docPath: string;
    collection: string;
    docId: string;
    before: Record<string, any> | null;
    after: Record<string, any> | null;
    precondition?: Record<string, any>;
}

interface ReassignmentLog {
    id: string;
    operation_id: string;
    type: string;
    actor_id: string;
    actor_label: string;
    logged_at: string;
    status: string;
    summary: string | null;
    changes: ChangeRecord[];
    meta: Record<string, any>;
    rollback_of: string | null;
    created_at: string;
}

const RollbackSchema = z.object({
    operationId: z.string().min(1).max(200),
    actorId: z.string().min(1).max(128),
    actorLabel: z.string().min(1).max(200),
});

// ============================================================================
// SUPABASE CLIENT (lazy singleton)
// ============================================================================

let _supabase: ReturnType<typeof createClient> | null = null;

function getSupabase() {
    if (_supabase) return _supabase;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;

    _supabase = createClient(url, key, { auth: { persistSession: false } });
    return _supabase;
}

// ============================================================================
// GET - Validate if rollback is possible
// ============================================================================

export const GET = withSecurity(
    async (request, { auth }) => {
        const supabase = getSupabase();
        if (!supabase) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const url = new URL(request.url);
        const operationId = url.searchParams.get('operationId');

        if (!operationId) {
            return NextResponse.json({ error: 'operationId required' }, { status: 400 });
        }

        // Get the operation log
        const { data: log, error } = await (supabase
            .from('reassignment_logs') as any)
            .select('*')
            .eq('operation_id', operationId)
            .single();

        if (error || !log) {
            return NextResponse.json({ error: 'Operation not found' }, { status: 404 });
        }

        const typedLog = log as unknown as ReassignmentLog;

        // Check if rollback is possible
        if (typedLog.status !== 'committed') {
            return NextResponse.json({
                canRollback: false,
                reason: `Cannot rollback: status is '${typedLog.status}', expected 'committed'`,
                log: typedLog,
            });
        }

        // Validate current state matches 'after' snapshots
        const conflicts: string[] = [];
        const changes = typedLog.changes;

        for (const change of changes) {
            if (!change.after || !change.collection || !change.docId) continue;

            try {
                const docRef = adminDb.collection(change.collection).doc(change.docId);
                const docSnap = await docRef.get();

                if (!docSnap.exists) {
                    conflicts.push(`Document ${change.docPath} no longer exists`);
                    continue;
                }

                const currentData = docSnap.data();

                // Compare relevant fields
                for (const key of Object.keys(change.after)) {
                    const expected = JSON.stringify(change.after[key]);
                    const actual = JSON.stringify(currentData?.[key]);

                    if (expected !== actual) {
                        conflicts.push(
                            `${change.docPath}.${key}: expected '${expected}', found '${actual}'`
                        );
                    }
                }
            } catch (err: any) {
                conflicts.push(`Error checking ${change.docPath}: ${err.message}`);
            }
        }

        return NextResponse.json({
            canRollback: conflicts.length === 0,
            conflicts,
            log: {
                operation_id: log.operation_id,
                type: log.type,
                actor_label: log.actor_label,
                timestamp: log.timestamp,
                summary: log.summary,
                changesCount: changes.length,
            },
        });
    },
    {
        requiredRoles: ['admin'],
        rateLimit: RateLimits.READ,
    }
);

// ============================================================================
// POST - Execute rollback
// ============================================================================

export const POST = withSecurity(
    async (request, { auth, body }) => {
        const supabase = getSupabase();
        if (!supabase) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const { operationId, actorId, actorLabel } = body as z.infer<typeof RollbackSchema>;

        // Get the original operation
        const { data: originalLog, error: fetchError } = await supabase
            .from('reassignment_logs')
            .select('*')
            .eq('operation_id', operationId)
            .single();

        if (fetchError || !originalLog) {
            return NextResponse.json({ error: 'Operation not found' }, { status: 404 });
        }

        const typedOriginalLog = originalLog as unknown as ReassignmentLog;

        if (typedOriginalLog.status !== 'committed') {
            return NextResponse.json({
                success: false,
                error: `Cannot rollback: status is '${typedOriginalLog.status}'`,
            }, { status: 400 });
        }

        const changes = typedOriginalLog.changes;
        const rollbackOpId = `rollback_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        // Create pending rollback log
        await (supabase
            .from('reassignment_logs') as any)
            .insert([{
                operation_id: rollbackOpId,
                type: 'rollback',
                actor_id: actorId,
                actor_label: actorLabel,
                status: 'pending',
                summary: `Rollback of operation ${operationId}`,
                changes: [],
                meta: { rollbackOf: operationId },
                rollback_of: operationId,
            }]);

        const revertedDocs: string[] = [];
        const rollbackChanges: ChangeRecord[] = [];
        const errors: string[] = [];

        // Execute rollback - apply 'before' states in reverse order
        for (const change of [...changes].reverse()) {
            if (!change.before || !change.collection || !change.docId) continue;

            try {
                const docRef = adminDb.collection(change.collection).doc(change.docId);
                await docRef.update(change.before);

                revertedDocs.push(change.docPath);
                rollbackChanges.push({
                    ...change,
                    before: change.after,
                    after: change.before,
                });
            } catch (err: any) {
                errors.push(`Failed to revert ${change.docPath}: ${err.message}`);
            }
        }

        const rollbackSuccess = errors.length === 0;

        // Update rollback log
        const { error: updateRollbackError } = await (supabase
            .from('reassignment_logs') as any)
            .update({
                status: rollbackSuccess ? 'committed' : 'failed',
                changes: rollbackChanges,
                meta: {
                    rollbackOf: operationId,
                    revertedDocs,
                    errors: errors.length > 0 ? errors : undefined,
                    completedAt: new Date().toISOString(),
                },
            })
            .eq('operation_id', rollbackOpId);

        if (updateRollbackError) {
            console.error('Failed to update rollback log:', updateRollbackError);
            errors.push(`Metadata error: Failed to finalized rollback audit log (${updateRollbackError.message})`);
        }

        // Mark original as rolled_back (if successful)
        if (rollbackSuccess) {
            const { error: updateOriginalError } = await (supabase
                .from('reassignment_logs') as any)
                .update({
                    status: 'rolled_back',
                    meta: {
                        ...typedOriginalLog.meta,
                        rolledBackBy: rollbackOpId,
                        rolledBackAt: new Date().toISOString(),
                    },
                })
                .eq('operation_id', operationId);

            if (updateOriginalError) {
                console.error('Failed to update original log status:', updateOriginalError);
                errors.push(`Status update error: Rollback succeeded but original log status could not be updated (${updateOriginalError.message})`);
            }
        }

        return NextResponse.json({
            success: rollbackSuccess && errors.length === 0,
            message: (rollbackSuccess && errors.length === 0)
                ? 'Rollback completed successfully'
                : rollbackSuccess
                    ? 'Rollback completed (Firestore), but status update had errors'
                    : 'Rollback partially failed',
            rollbackOperationId: rollbackOpId,
            revertedDocs,
            errors: errors.length > 0 ? errors : undefined,
        });
    },
    {
        requiredRoles: ['admin'],
        schema: RollbackSchema,
        rateLimit: RateLimits.BULK_OPERATION,
    }
);
