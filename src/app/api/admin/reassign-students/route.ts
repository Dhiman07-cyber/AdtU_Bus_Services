import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getSupabaseServer } from '@/lib/supabase-server';
import { withSecurity } from '@/lib/security/api-security';
import { ReassignStudentsSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

export const POST = withSecurity(
    async (request, { auth, body }) => {
        const currentUserUid = auth.uid;
        const currentUserRole = auth.role;
        const { assignments, sourceBusId, actorId, actorName } = body as any;

        if (!assignments || assignments.length === 0) {
            return NextResponse.json({ success: false, error: 'No assignments provided' }, { status: 400 });
        }

        // 1. Parallel Initial Data Fetching
        const busIdsToLoad = new Set<string>();
        for (const assignment of assignments) {
            busIdsToLoad.add(assignment.toBusId);
            busIdsToLoad.add(assignment.fromBusId);
        }
        if (sourceBusId) busIdsToLoad.add(sourceBusId);

        const busRefs = Array.from(busIdsToLoad).map(id => adminDb.collection('buses').doc(id));
        
        // Fetch actor info and all buses in parallel
        const actorInfoPromise = (async () => {
            let label = actorName || 'System';
            if (currentUserRole === 'admin') {
                const adminDoc = await adminDb.collection('admins').doc(currentUserUid).get();
                if (adminDoc.exists) {
                    const data = adminDoc.data();
                    label = `${data?.fullName || data?.name || actorName} (Admin)`;
                }
            } else if (currentUserRole === 'moderator') {
                const modDoc = await adminDb.collection('moderators').doc(currentUserUid).get();
                if (modDoc.exists) {
                    const modData = modDoc.data();
                    label = `${modData?.fullName || modData?.name || actorName} (${modData?.employeeId || 'Moderator'})`;
                }
            }
            return label;
        })();

        const busesPromise = adminDb.getAll(...busRefs);

        const [actorLabel, busSnapsList] = await Promise.all([actorInfoPromise, busesPromise]) as [string, any[]];
        
        const busSnapshots = new Map<string, any>();
        busSnapsList.forEach(snap => {
            if (snap.exists) busSnapshots.set(snap.id, snap);
        });

        console.log(`🔄 Starting reassignment: ${assignments.length} students by ${actorLabel}`);

        // Use a batch for atomic writes
        const batch = adminDb.batch();
        const busLoadChanges = new Map<string, { morningDelta: number; eveningDelta: number }>();

        // Process each assignment
        for (const assignment of assignments) {
            const { studentId, fromBusId, toBusId, shift } = assignment;
            const studentRef = adminDb.collection('students').doc(studentId);

            // Get target bus data for routeId
            const targetBusSnap = busSnapshots.get(toBusId);
            if (!targetBusSnap.exists) throw new Error(`Target bus ${toBusId} not found`);
            const targetBusData = targetBusSnap.data()!;

            const studentUpdateData: any = {
                busId: toBusId,
                routeId: targetBusData.route?.routeId || targetBusData.routeId || '',
                updatedAt: FieldValue.serverTimestamp(),
            };
            if (assignment.stopId) studentUpdateData.stopId = assignment.stopId;
            if (assignment.stopName) studentUpdateData.stopName = assignment.stopName;
            batch.update(studentRef, studentUpdateData);

            // Track load changes (source)
            if (!busLoadChanges.has(fromBusId)) busLoadChanges.set(fromBusId, { morningDelta: 0, eveningDelta: 0 });
            const sourceChanges = busLoadChanges.get(fromBusId)!;
            if (shift === 'Morning') sourceChanges.morningDelta--;
            else sourceChanges.eveningDelta--;

            // Track load changes (target)
            if (!busLoadChanges.has(toBusId)) busLoadChanges.set(toBusId, { morningDelta: 0, eveningDelta: 0 });
            const targetChanges = busLoadChanges.get(toBusId)!;
            if (shift === 'Morning') targetChanges.morningDelta++;
            else targetChanges.eveningDelta++;
        }

        // Apply bus load changes
        for (const [busId, deltas] of busLoadChanges.entries()) {
            const busRef = adminDb.collection('buses').doc(busId);
            const busSnap = busSnapshots.get(busId);
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

        await batch.commit();

        // Supabase Audit Logging
        try {
            const operationId = `student_reassignment_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            const targetBuses = [...new Set(assignments.map((a: any) => a.toBusId))];
            const uniqueBusIds = [...new Set([sourceBusId, ...targetBuses])];
            const busLabels = new Map<string, string>();

            for (const bId of uniqueBusIds) {
                const bSnap = busSnapshots.get(bId);
                if (bSnap.exists) {
                    const bData = bSnap.data()!;
                    const bNum = bId.replace(/[^0-9]/g, '') || '?';
                    busLabels.set(bId, `Bus-${bNum} (${bData.busNumber || bData.registrationNumber || 'N/A'})`);
                } else busLabels.set(bId, bId);
            }

            const sourceLabel = busLabels.get(sourceBusId) || sourceBusId;
            const destLabels = (targetBuses as string[]).map(id => busLabels.get(id) || id).join(', ');

            const changes: any[] = [];
            for (const a of assignments as any[]) {
                changes.push({
                    docPath: `students/${a.studentId}`,
                    collection: 'students',
                    docId: a.studentId,
                    before: { busId: a.fromBusId, studentName: a.studentName, shift: a.shift },
                    after: { busId: a.toBusId, studentName: a.studentName, shift: a.shift },
                });
            }

            for (const [busId, deltas] of busLoadChanges.entries()) {
                const busSnap = busSnapshots.get(busId);
                if (busSnap.exists) {
                    const busData = busSnap.data()!;
                    const currentLoad = busData.load || { morningCount: 0, eveningCount: 0 };
                    const beforeMorning = Math.max(0, (currentLoad.morningCount || 0) - deltas.morningDelta);
                    const beforeEvening = Math.max(0, (currentLoad.eveningCount || 0) - deltas.eveningDelta);
                    changes.push({
                        docPath: `buses/${busId}`,
                        collection: 'buses',
                        docId: busId,
                        before: { 'load.morningCount': beforeMorning, 'load.eveningCount': beforeEvening, currentMembers: beforeMorning + beforeEvening },
                        after: { 'load.morningCount': currentLoad.morningCount || 0, 'load.eveningCount': currentLoad.eveningCount || 0, currentMembers: (currentLoad.morningCount || 0) + (currentLoad.eveningCount || 0) },
                    });
                }
            }

            const supabase = getSupabaseServer();
            
            // Delete and Insert can be sequential or we can just upsert if we have a natural key
            // But since we want to clear old ones, we use a promise chain
            const logTask = (async () => {
                await supabase.from('reassignment_logs').delete().eq('type', 'student_reassignment');
                return supabase.from('reassignment_logs').insert([{
                    operation_id: operationId,
                    type: 'student_reassignment',
                    actor_id: actorId,
                    actor_label: actorLabel,
                    status: 'committed',
                    summary: `Reassigned ${assignments.length} student(s) from ${sourceLabel} to ${destLabels}`,
                    changes: changes,
                    meta: { studentCount: assignments.length, sourceBusId, targetBuses, busLoadChanges: Object.fromEntries(busLoadChanges) },
                }]);
            })();

            // Don't necessarily need to await the log task to return response
            // but we do it to ensure consistency if the user checks logs immediately
            await logTask;
        } catch (auditError) {
            console.warn('Failed to create Supabase audit log:', auditError);
        }

        return NextResponse.json({
            success: true,
            message: `Successfully reassigned ${assignments.length} student(s)`,
            movedCount: assignments.length,
            assignments,
        });
    },
    {
        requiredRoles: ['admin', 'moderator'],
        schema: ReassignStudentsSchema,
        rateLimit: RateLimits.CREATE,
        allowBodyToken: true
    }
);
