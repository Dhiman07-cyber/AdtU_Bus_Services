/**
 * Rollback API Route
 * 
 * POST /api/reassignment-logs/rollback - Execute rollback of a committed operation
 * GET /api/reassignment-logs/rollback?operationId=xxx - Validate rollback feasibility
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { adminDb, adminAuth } from '@/lib/firebase-admin';

// Initialize Supabase with service role
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
);

interface ChangeRecord {
    docPath: string;
    collection: string;
    docId: string;
    before: Record<string, any> | null;
    after: Record<string, any> | null;
    precondition?: Record<string, any>;
}

interface RollbackRequest {
    operationId: string;
    actorId: string;
    actorLabel: string;
}

/**
 * Verify Admin-only access (rollback is sensitive operation)
 */
async function verifyAdminOnly(request: NextRequest): Promise<{ uid: string; name: string } | null> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return null;
    }

    try {
        const token = authHeader.substring(7);
        const decodedToken = await adminAuth.verifyIdToken(token);
        const uid = decodedToken.uid;

        // Only admins can perform rollback
        const adminDoc = await adminDb.collection('admins').doc(uid).get();

        if (adminDoc.exists) {
            const data = adminDoc.data();
            return { uid, name: data?.name || 'Admin' };
        }

        return null;
    } catch (error) {
        console.error('[rollback] Auth error:', error);
        return null;
    }
}

/**
 * GET - Validate if rollback is possible
 */
export async function GET(request: NextRequest) {
    try {
        const session = await verifyAdminOnly(request);
        if (!session) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const operationId = searchParams.get('operationId');

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

    } catch (err: any) {
        console.error('[rollback/validate] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/**
 * POST - Execute rollback
 */
export async function POST(request: NextRequest) {
    try {
        const session = await verifyAdminOnly(request);
        if (!session) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }

        const body: RollbackRequest = await request.json();
        const { operationId, actorId, actorLabel } = body;

        if (!operationId || !actorId || !actorLabel) {
            return NextResponse.json(
                { error: 'Missing required fields: operationId, actorId, actorLabel' },
                { status: 400 }
            );
        }

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

        // Execute rollback - apply 'before' states
        for (const change of [...changes].reverse()) {
            if (!change.before || !change.collection || !change.docId) {
                console.warn(`[rollback] No 'before' state for ${change.docPath}, skipping`);
                continue;
            }

            try {
                const docRef = adminDb.collection(change.collection).doc(change.docId);

                // Apply before state
                await docRef.update(change.before);

                revertedDocs.push(change.docPath);
                rollbackChanges.push({
                    ...change,
                    before: change.after,
                    after: change.before,
                });

                console.log(`[rollback] Reverted: ${change.docPath}`);
            } catch (err: any) {
                errors.push(`Failed to revert ${change.docPath}: ${err.message}`);
                console.error(`[rollback] Error reverting ${change.docPath}:`, err);
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

    } catch (err: any) {
        console.error('[rollback] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
