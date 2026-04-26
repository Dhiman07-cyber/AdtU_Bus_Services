import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Transaction, DocumentSnapshot, DocumentReference } from 'firebase-admin/firestore';
import { withSecurity } from '@/lib/security/api-security';
import { UpdateStudentSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

/**
 * POST /api/admin/update-user
 * 
 * Optimized:
 * - Parallelized transaction reads (Current Student, Old Bus, New Bus)
 * - Atomic capacity reconciliation
 * - Robust cleanup of undefined update fields
 */

export const POST = withSecurity(
    async (request, { auth, body }) => {
        const { uid, ...updateData } = body as any;

        try {
            await adminDb.runTransaction(async (transaction: Transaction) => {
                const studentRef = adminDb.collection('students').doc(uid) as any;
                const studentDoc = (await transaction.get(studentRef)) as any as DocumentSnapshot;

                if (!studentDoc.exists) throw new Error('Student not found');

                const currentData = studentDoc.data() || {};
                const oldBusId = currentData.busId;
                const oldShift = currentData.shift || 'Morning';

                const newBusId = updateData.busId !== undefined ? updateData.busId : oldBusId;
                const newShift = updateData.shift !== undefined ? updateData.shift : oldShift;

                const busChanged = oldBusId !== newBusId;
                const shiftChanged = oldShift !== newShift;

                // Prepare bus references if needed
                const refs: any[] = [];
                if ((busChanged || shiftChanged) && oldBusId) refs.push(adminDb.collection('buses').doc(oldBusId));
                if ((busChanged || shiftChanged) && newBusId && newBusId !== oldBusId) refs.push(adminDb.collection('buses').doc(newBusId));

                // Parallelize all dependent reads in the transaction with explicit casting via any
                const snapshots = (await Promise.all(refs.map(ref => transaction.get(ref)))) as any as DocumentSnapshot[];
                const busSnaps = new Map(snapshots.map(s => [s.id, s]));

                if (busChanged || shiftChanged) {
                    // 1. Decrement old bus capacity
                    if (oldBusId) {
                        const oldBusSnap = busSnaps.get(oldBusId);
                        if (oldBusSnap?.exists) {
                            const updates: any = {};
                            if (busChanged) {
                                updates.currentMembers = FieldValue.increment(-1);
                                updates['load.totalCount'] = FieldValue.increment(-1);
                            }
                            if (oldShift === 'Morning' || oldShift === 'Both') updates['load.morningCount'] = FieldValue.increment(-1);
                            if (oldShift === 'Evening' || oldShift === 'Both') updates['load.eveningCount'] = FieldValue.increment(-1);
                            transaction.update(oldBusSnap.ref, updates);
                        }
                    }

                    // 2. Increment new bus capacity
                    if (newBusId) {
                        const newBusSnap = busSnaps.get(newBusId);
                        if (newBusSnap?.exists) {
                            const updates: any = {};
                            if (busChanged) {
                                updates.currentMembers = FieldValue.increment(1);
                                updates['load.totalCount'] = FieldValue.increment(1);
                            }
                            if (newShift === 'Morning' || newShift === 'Both') updates['load.morningCount'] = FieldValue.increment(1);
                            if (newShift === 'Evening' || newShift === 'Both') updates['load.eveningCount'] = FieldValue.increment(1);
                            transaction.update(newBusSnap.ref, updates);
                        }
                    }
                }

                // Clean update data
                const cleanedUpdateData = Object.entries(updateData).reduce((acc, [key, value]) => {
                    if (value !== undefined) acc[key] = value;
                    return acc;
                }, { updatedAt: new Date().toISOString() } as any);

                transaction.update(studentRef, cleanedUpdateData);
            });

            return NextResponse.json({ success: true, message: 'Student updated successfully' });
        } catch (error: any) {
            return NextResponse.json({
                success: false,
                error: error.message || 'Internal Server Error'
            }, { status: error.message === 'Student not found' ? 404 : 500 });
        }
    },
    {
        requiredRoles: ['admin', 'moderator'],
        schema: UpdateStudentSchema,
        rateLimit: RateLimits.CREATE,
        allowBodyToken: true
    }
);
