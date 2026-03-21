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
        const { data: log, error } = await supabase
            .from('reassignment_logs')
            .select('*')
            .eq('operation_id', operationId)
            .single();

        if (error || !log) {
            return NextResponse.json({ error: 'Operation not found' }, { status: 404 });
        }

        // Check if rollback is possible
        if (log.status !== 'committed') {
            return NextResponse.json({
                canRollback: false,
                reason: `Cannot rollback: status is '${log.status}', expected 'committed'`,
                log,
            });
        }

        // Validate current state matches 'after' snapshots
        const conflicts: string[] = [];
        const changes = log.changes as ChangeRecord[];

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

        if (originalLog.status !== 'committed') {
            return NextResponse.json({
                success: false,
                error: `Cannot rollback: status is '${originalLog.status}'`,
            }, { status: 400 });
        }

        const changes = originalLog.changes as ChangeRecord[];
        const rollbackOpId = `rollback_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        // Create pending rollback log
        await supabase
            .from('reassignment_logs')
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
        await supabase
            .from('reassignment_logs')
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

        // Mark original as rolled_back (if successful)
        if (rollbackSuccess) {
            await supabase
                .from('reassignment_logs')
                .update({
                    status: 'rolled_back',
                    meta: {
                        ...originalLog.meta,
                        rolledBackBy: rollbackOpId,
                        rolledBackAt: new Date().toISOString(),
                    },
                })
                .eq('operation_id', operationId);
        }

        return NextResponse.json({
            success: rollbackSuccess,
            message: rollbackSuccess
                ? 'Rollback completed successfully'
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
