
import { headers } from 'next/headers';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { FieldValue, Transaction, DocumentSnapshot, DocumentReference } from 'firebase-admin/firestore';
import { createUpdatedByEntry } from '@/lib/utils/updatedBy';

export async function POST(request: Request) {
    try {
        // 1. Authentication Check
        const authHeader = (await headers()).get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 });
        }

        const token = authHeader.substring(7);
        let currentUserRole = '';
        let currentUserName = 'System';
        let currentUserEmployeeId = 'ADMIN';

        try {
            const decodedToken = await adminAuth.verifyIdToken(token);
            const uid = decodedToken.uid;

            // Check admin/moderator role
            const adminDoc = await adminDb.collection('admins').doc(uid).get();
            if (adminDoc.exists) {
                currentUserRole = 'admin';
                currentUserName = adminDoc.data()?.name || 'Admin';
                currentUserEmployeeId = adminDoc.data()?.employeeId || 'ADMIN';
            } else {
                const modDoc = await adminDb.collection('moderators').doc(uid).get();
                if (modDoc.exists) {
                    currentUserRole = 'moderator';
                    currentUserName = modDoc.data()?.fullName || 'Moderator';
                    currentUserEmployeeId = modDoc.data()?.employeeId || 'MOD';
                }
            }

            if (!currentUserRole) {
                return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403 });
            }
        } catch (error) {
            return new Response(JSON.stringify({ success: false, error: 'Invalid token' }), { status: 401 });
        }

        // 2. Parse Request Body
        const body = await request.json();
        const { uid, ...updateData } = body;

        if (!uid) {
            return new Response(JSON.stringify({ success: false, error: 'Student UID is required' }), { status: 400 });
        }

        console.log(`📝 Update request for student ${uid} by ${currentUserRole}`);

        // 3. Run Transaction
        await adminDb.runTransaction(async (transaction: Transaction) => {
            // Get current student doc
            const studentRef = adminDb.collection('students').doc(uid) as DocumentReference;
            const studentDoc = await transaction.get(studentRef) as DocumentSnapshot;

            if (!studentDoc.exists) {
                throw new Error('Student not found');
            }

            const currentData = studentDoc.data() || {};
            const oldBusId = currentData.busId;
            const oldShift = currentData.shift || 'Morning';

            // Determine new values (fallback to old if not provided)
            const newBusId = updateData.busId !== undefined ? updateData.busId : oldBusId;
            const newShift = updateData.shift !== undefined ? updateData.shift : oldShift;

            // Clean undefined values from updateData to avoid Firestore errors
            const cleanedUpdateData = Object.entries(updateData).reduce((acc, [key, value]) => {
                if (value !== undefined) acc[key] = value;
                return acc;
            }, {} as any);

            // Add audit trail
            cleanedUpdateData.updatedAt = new Date().toISOString();
            cleanedUpdateData.updatedBy = FieldValue.arrayUnion(createUpdatedByEntry(currentUserName, currentUserEmployeeId));

            // Check if Bus or Shift changed
            const busChanged = oldBusId !== newBusId;
            const shiftChanged = oldShift !== newShift;

            // Handle Capacity Logic
            if (busChanged || shiftChanged) {
                console.log(`🚌 Bus/Shift change detected for ${uid}`);
                console.log(`   Old: Bus ${oldBusId} (${oldShift})`);
                console.log(`   New: Bus ${newBusId} (${newShift})`);

                // 1. Decrement from Old Bus (if it existed)
                if (oldBusId) {
                    const oldBusRef = adminDb.collection('buses').doc(oldBusId) as DocumentReference;
                    const oldBusDoc = await transaction.get(oldBusRef) as DocumentSnapshot;

                    if (oldBusDoc.exists) {
                        const updates: any = {};
                        // Only decrement members if bus actually changed (if just shift changed, members count stays same)
                        if (busChanged) {
                            updates.currentMembers = FieldValue.increment(-1);
                        }

                        // Handle load decrement based on OLD shift
                        if (oldShift === 'Morning' || oldShift === 'Both') {
                            updates['load.morningCount'] = FieldValue.increment(-1);
                        }
                        if (oldShift === 'Evening' || oldShift === 'Both') {
                            updates['load.eveningCount'] = FieldValue.increment(-1);
                        }

                        // Safety check to ensure counts don't go below 0 (though FieldValue.increment handles negative, logic ensures correctness)
                        transaction.update(oldBusRef, updates);
                    }
                }

                // 2. Increment to New Bus (if it exists)
                if (newBusId) {
                    const newBusRef = adminDb.collection('buses').doc(newBusId) as DocumentReference;
                    const newBusDoc = await transaction.get(newBusRef) as DocumentSnapshot;

                    if (newBusDoc.exists) {
                        const updates: any = {};
                        // Only increment members if bus actually changed
                        if (busChanged) {
                            updates.currentMembers = FieldValue.increment(1);
                        }

                        // Handle load increment based on NEW shift
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

            // 3. Update Student Document
            transaction.update(studentRef, cleanedUpdateData);
        });

        return new Response(JSON.stringify({
            success: true,
            message: 'Student updated successfully'
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error('Error updating user:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Internal Server Error'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
