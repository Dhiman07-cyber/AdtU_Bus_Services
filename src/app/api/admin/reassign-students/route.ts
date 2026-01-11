/**
 * POST /api/admin/reassign-students
 * 
 * Server-side student reassignment using Firebase Admin SDK.
 * This bypasses Firestore security rules and is the recommended way to perform
 * bulk reassignments.
 * 
 * Request Body:
 * {
 *   assignments: [
 *     { studentId, fromBusId, toBusId, shift }
 *   ],
 *   sourceBusId: string,
 *   actorId: string,
 *   actorName: string
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy Supabase client initialization
let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
    if (!supabaseClient) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!url || !key) {
            throw new Error('Missing Supabase environment variables');
        }

        supabaseClient = createClient(url, key, {
            auth: { persistSession: false }
        });
    }
    return supabaseClient;
}

interface ReassignmentItem {
    studentId: string;
    studentName: string;
    fromBusId: string;
    toBusId: string;
    toBusNumber: string;
    shift: 'Morning' | 'Evening';
    stopName?: string;
}

interface ReassignmentRequest {
    assignments: ReassignmentItem[];
    sourceBusId: string;
    actorId: string;
    actorName: string;
}

export async function POST(request: NextRequest) {
    try {
        // Verify authentication
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.substring(7);
        const decodedToken = await adminAuth.verifyIdToken(token);
        const uid = decodedToken.uid;

        // Verify user is admin or moderator
        const [adminDoc, moderatorDoc] = await Promise.all([
            adminDb.collection('admins').doc(uid).get(),
            adminDb.collection('moderators').doc(uid).get(),
        ]);

        if (!adminDoc.exists && !moderatorDoc.exists) {
            return NextResponse.json({
                success: false,
                error: 'Insufficient permissions. Only admins and moderators can reassign students.'
            }, { status: 403 });
        }

        const body: ReassignmentRequest = await request.json();
        const { assignments, sourceBusId, actorId, actorName } = body;

        // Determine actor label
        let actorLabel = actorName || 'System';
        if (adminDoc.exists) {
            const data = adminDoc.data();
            actorLabel = `${data?.fullName || data?.name || actorName} (Admin)`; // Fixed: Check fullName
        } else if (moderatorDoc.exists) {
            const modData = moderatorDoc.data();
            actorLabel = `${modData?.fullName || modData?.name || actorName} (${modData?.employeeId || 'Moderator'})`; // Fixed: Check fullName
        }

        if (!assignments || assignments.length === 0) {
            return NextResponse.json({ success: false, error: 'No assignments provided' }, { status: 400 });
        }

        console.log(`🔄 Starting reassignment: ${assignments.length} students by ${actorName}`);

        // Use a batch for atomic writes
        const batch = adminDb.batch();

        // Track load changes per bus
        const busLoadChanges = new Map<string, { morningDelta: number; eveningDelta: number }>();

        // Process each assignment
        for (const assignment of assignments) {
            const { studentId, fromBusId, toBusId, shift } = assignment;

            // Get student ref
            const studentRef = adminDb.collection('students').doc(studentId);

            // Get target bus data for routeId
            const targetBusSnap = await adminDb.collection('buses').doc(toBusId).get();
            if (!targetBusSnap.exists) {
                throw new Error(`Target bus ${toBusId} not found`);
            }
            const targetBusData = targetBusSnap.data()!;

            // Update student
            batch.update(studentRef, {
                busId: toBusId,
                routeId: targetBusData.route?.routeId || targetBusData.routeId || '',
                updatedAt: FieldValue.serverTimestamp(),
            });

            // Track load changes for source bus (decrement)
            if (!busLoadChanges.has(fromBusId)) {
                busLoadChanges.set(fromBusId, { morningDelta: 0, eveningDelta: 0 });
            }
            const sourceChanges = busLoadChanges.get(fromBusId)!;
            if (shift === 'Morning') sourceChanges.morningDelta--;
            else sourceChanges.eveningDelta--;

            // Track load changes for target bus (increment)
            if (!busLoadChanges.has(toBusId)) {
                busLoadChanges.set(toBusId, { morningDelta: 0, eveningDelta: 0 });
            }
            const targetChanges = busLoadChanges.get(toBusId)!;
            if (shift === 'Morning') targetChanges.morningDelta++;
            else targetChanges.eveningDelta++;
        }

        // Apply bus load changes
        for (const [busId, deltas] of busLoadChanges.entries()) {
            const busRef = adminDb.collection('buses').doc(busId);
            const busSnap = await busRef.get();

            if (busSnap.exists) {
                const busData = busSnap.data()!;
                const currentLoad = busData.load || { morningCount: 0, eveningCount: 0 };

                const newMorning = Math.max(0, (currentLoad.morningCount || 0) + deltas.morningDelta);
                const newEvening = Math.max(0, (currentLoad.eveningCount || 0) + deltas.eveningDelta);

                batch.update(busRef, {
                    'load.morningCount': newMorning,
                    'load.eveningCount': newEvening,
                    currentMembers: newMorning + newEvening,
                    updatedAt: FieldValue.serverTimestamp(),
                });
            }
        }

        // Commit the batch
        await batch.commit();

        console.log(`✅ Successfully reassigned ${assignments.length} students`);

        // Log to Supabase reassignment_logs with full before/after snapshots for rollback
        try {
            const operationId = `student_reassignment_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            const targetBuses = [...new Set(assignments.map(a => a.toBusId))];

            // Fetch bus labels for summary
            const busLabels = new Map<string, string>();
            const uniqueBusIds = [...new Set([sourceBusId, ...targetBuses])];

            for (const bId of uniqueBusIds) {
                const bSnap = await adminDb.collection('buses').doc(bId).get();
                if (bSnap.exists) {
                    const bData = bSnap.data()!;
                    const bNum = bId.replace(/[^0-9]/g, '') || '?';
                    busLabels.set(bId, `Bus-${bNum} (${bData.busNumber || bData.registrationNumber || 'N/A'})`);
                } else {
                    busLabels.set(bId, bId);
                }
            }

            const sourceLabel = busLabels.get(sourceBusId) || sourceBusId;
            const destLabels = targetBuses.map(id => busLabels.get(id) || id).join(', ');

            // Build comprehensive change records for rollback support
            const changes: Array<{
                docPath: string;
                collection: string;
                docId: string;
                before: Record<string, any> | null;
                after: Record<string, any> | null;
            }> = [];

            // Add student changes
            for (const a of assignments) {
                changes.push({
                    docPath: `students/${a.studentId}`,
                    collection: 'students',
                    docId: a.studentId,
                    before: {
                        busId: a.fromBusId,
                        studentName: a.studentName,
                        shift: a.shift,
                    },
                    after: {
                        busId: a.toBusId,
                        studentName: a.studentName,
                        shift: a.shift,
                    },
                });
            }

            // Add bus load changes for proper rollback
            for (const [busId, deltas] of busLoadChanges.entries()) {
                const busSnap = await adminDb.collection('buses').doc(busId).get();
                if (busSnap.exists) {
                    const busData = busSnap.data()!;
                    const currentLoad = busData.load || { morningCount: 0, eveningCount: 0 };

                    // Calculate what the load was BEFORE this operation
                    const beforeMorning = Math.max(0, (currentLoad.morningCount || 0) - deltas.morningDelta);
                    const beforeEvening = Math.max(0, (currentLoad.eveningCount || 0) - deltas.eveningDelta);

                    changes.push({
                        docPath: `buses/${busId}`,
                        collection: 'buses',
                        docId: busId,
                        before: {
                            'load.morningCount': beforeMorning,
                            'load.eveningCount': beforeEvening,
                            currentMembers: beforeMorning + beforeEvening,
                        },
                        after: {
                            'load.morningCount': currentLoad.morningCount || 0,
                            'load.eveningCount': currentLoad.eveningCount || 0,
                            currentMembers: (currentLoad.morningCount || 0) + (currentLoad.eveningCount || 0),
                        },
                    });
                }
            }

            // Delete old student_reassignment logs first (keep only ONE per type)
            const supabase = getSupabaseClient();

            await supabase
                .from('reassignment_logs')
                .delete()
                .eq('type', 'student_reassignment');

            // Insert new log
            await supabase.from('reassignment_logs').insert([{
                operation_id: operationId,
                type: 'student_reassignment',
                actor_id: actorId,
                actor_label: actorLabel,
                status: 'committed',
                summary: `Reassigned ${assignments.length} student(s) from ${sourceLabel} to ${destLabels}`,
                changes: changes,
                meta: {
                    studentCount: assignments.length,
                    sourceBusId,
                    targetBuses,
                    busLoadChanges: Object.fromEntries(busLoadChanges),
                },
            }]);
            console.log(`✅ Logged to Supabase: ${operationId}`);
        } catch (auditError) {
            console.warn('Failed to create Supabase audit log:', auditError);
            // Don't fail the operation for audit errors
        }

        return NextResponse.json({
            success: true,
            message: `Successfully reassigned ${assignments.length} student(s)`,
            movedCount: assignments.length,
            assignments,
        });

    } catch (error: any) {
        console.error('❌ Reassignment failed:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Reassignment failed' },
            { status: 500 }
        );
    }
}
