import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue, Transaction, DocumentSnapshot, DocumentReference } from 'firebase-admin/firestore';
import { withSecurity } from '@/lib/security/api-security';
import { UpdateStudentSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

export const POST = withSecurity(
    async (request, { auth, body }) => {
        const currentUserUid = auth.uid;
        const currentUserRole = auth.role;
        let currentUserName = auth.name || 'System';
        let currentUserEmployeeId = 'ADMIN';

        // Fetch extra info for moderators/admins for audit logs
        if (currentUserRole === 'moderator') {
            const modDoc = await adminDb.collection('moderators').doc(currentUserUid).get();
            if (modDoc.exists) {
                currentUserName = modDoc.data()?.fullName || modDoc.data()?.name || currentUserName;
                currentUserEmployeeId = modDoc.data()?.employeeId || modDoc.data()?.staffId || 'MOD';
            }
        } else if (currentUserRole === 'admin') {
            const adminDoc = await adminDb.collection('admins').doc(currentUserUid).get();
            if (adminDoc.exists) {
                currentUserName = adminDoc.data()?.name || currentUserName;
                currentUserEmployeeId = adminDoc.data()?.employeeId || 'ADMIN';
            }
        }

        const { uid, ...updateData } = body as any;

        try {
            await adminDb.runTransaction(async (transaction: Transaction) => {
                const studentRef = adminDb.collection('students').doc(uid) as DocumentReference;
                const studentDoc = await transaction.get(studentRef) as DocumentSnapshot;

                if (!studentDoc.exists) {
                    throw new Error('Student not found');
                }

                const currentData = studentDoc.data() || {};
                const oldBusId = currentData.busId;
                const oldShift = currentData.shift || 'Morning';

                const newBusId = updateData.busId !== undefined ? updateData.busId : oldBusId;
                const newShift = updateData.shift !== undefined ? updateData.shift : oldShift;

                const cleanedUpdateData = Object.entries(updateData).reduce((acc, [key, value]) => {
                    if (value !== undefined) acc[key] = value;
                    return acc;
                }, {} as any);

                cleanedUpdateData.updatedAt = new Date().toISOString();

                const busChanged = oldBusId !== newBusId;
                const shiftChanged = oldShift !== newShift;

                if (busChanged || shiftChanged) {
                    if (oldBusId) {
                        const oldBusRef = adminDb.collection('buses').doc(oldBusId) as DocumentReference;
                        const oldBusDoc = await transaction.get(oldBusRef) as DocumentSnapshot;
                        if (oldBusDoc.exists) {
                            const updates: any = {};
                            if (busChanged) {
                                updates.currentMembers = FieldValue.increment(-1);
                                updates['load.totalCount'] = FieldValue.increment(-1);
                            }
                            if (oldShift === 'Morning' || oldShift === 'Both') {
                                updates['load.morningCount'] = FieldValue.increment(-1);
                            }
                            if (oldShift === 'Evening' || oldShift === 'Both') {
                                updates['load.eveningCount'] = FieldValue.increment(-1);
                            }
                            transaction.update(oldBusRef, updates);
                        }
                    }

                    if (newBusId) {
                        const newBusRef = adminDb.collection('buses').doc(newBusId) as DocumentReference;
                        const newBusDoc = await transaction.get(newBusRef) as DocumentSnapshot;
                        if (newBusDoc.exists) {
                            const updates: any = {};
                            if (busChanged) {
                                updates.currentMembers = FieldValue.increment(1);
                                updates['load.totalCount'] = FieldValue.increment(1);
                            }
                            if (newShift === 'Morning' || newShift === 'Both') {
                                updates['load.morningCount'] = FieldValue.increment(1);
                            }
                            if (newShift === 'Evening' || newShift === 'Both') {
                                updates['load.eveningCount'] = FieldValue.increment(1);
                            }
                            transaction.update(newBusRef, updates);
                        }
                    }
                }

                transaction.update(studentRef, cleanedUpdateData);
            });

            return NextResponse.json({
                success: true,
                message: 'Student updated successfully'
            });
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
