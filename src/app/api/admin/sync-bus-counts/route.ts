import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

/**
 * API to synchronize bus capacity counts with actual student assignments
 * This recalculates currentMembers, load.morningCount, and load.eveningCount
 * from the students collection
 */
export async function POST(request: NextRequest) {
    try {
        // Authenticate
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const decodedToken = await adminAuth.verifyIdToken(token);
        const uid = decodedToken.uid;

        // Verify user is admin or moderator
        const adminDoc = await adminDb.collection('admins').doc(uid).get();
        const modDoc = await adminDb.collection('moderators').doc(uid).get();

        if (!adminDoc.exists && !modDoc.exists) {
            return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
        }

        console.log('🔄 Starting bus count synchronization...');

        // Get all buses
        const busesSnapshot = await adminDb.collection('buses').get();
        const buses = busesSnapshot.docs.map((doc: { id: any; data: () => any; }) => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`📊 Found ${buses.length} buses to process`);

        // Get all active students
        const studentsSnapshot = await adminDb.collection('students')
            .where('status', '==', 'active')
            .get();

        const students = studentsSnapshot.docs.map((doc: { id: any; data: () => any; }) => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`👥 Found ${students.length} active students`);

        // Build a map of busId -> { morningCount, eveningCount }
        const busCounts = new Map<string, { morningCount: number; eveningCount: number; total: number }>();

        // Initialize all buses with zero counts
        buses.forEach((bus: { id: string; }) => {
            busCounts.set(bus.id, { morningCount: 0, eveningCount: 0, total: 0 });
        });

        // Count students per bus
        students.forEach((student: any) => {
            // Check both busId and assignedBusId fields
            const busId = student.busId || student.assignedBusId || '';
            if (!busId) return;

            // Find matching bus (by id, busId field, or busNumber)
            let matchedBusId: string | null = null;

            for (const bus of buses) {
                if (
                    bus.id === busId ||
                    (bus as any).busId === busId ||
                    (bus as any).busNumber === busId
                ) {
                    matchedBusId = bus.id;
                    break;
                }
            }

            if (!matchedBusId) {
                console.log(`⚠️ Student ${student.fullName || student.id} has unknown busId: ${busId}`);
                return;
            }

            const counts = busCounts.get(matchedBusId) || { morningCount: 0, eveningCount: 0, total: 0 };
            const shift = (student.shift || 'morning').toLowerCase();

            counts.total++;
            if (shift === 'morning' || shift === 'both') {
                counts.morningCount++;
            }
            if (shift === 'evening' || shift === 'both') {
                counts.eveningCount++;
            }

            busCounts.set(matchedBusId, counts);
        });

        // Update all buses with correct counts
        const updates: { busId: string; busNumber: string; old: any; new: any }[] = [];
        const batch = adminDb.batch();

        for (const bus of buses) {
            const counts = busCounts.get(bus.id) || { morningCount: 0, eveningCount: 0, total: 0 };
            const busRef = adminDb.collection('buses').doc(bus.id);

            const oldCounts = {
                currentMembers: (bus as any).currentMembers || 0,
                morningCount: (bus as any).load?.morningCount || 0,
                eveningCount: (bus as any).load?.eveningCount || 0,
            };

            const newCounts = {
                currentMembers: counts.total,
                morningCount: counts.morningCount,
                eveningCount: counts.eveningCount,
            };

            // Only update if counts differ
            if (
                oldCounts.currentMembers !== newCounts.currentMembers ||
                oldCounts.morningCount !== newCounts.morningCount ||
                oldCounts.eveningCount !== newCounts.eveningCount
            ) {
                batch.update(busRef, {
                    currentMembers: newCounts.currentMembers,
                    'load.morningCount': newCounts.morningCount,
                    'load.eveningCount': newCounts.eveningCount,
                    updatedAt: new Date().toISOString(),
                });

                updates.push({
                    busId: bus.id,
                    busNumber: (bus as any).busNumber || bus.id,
                    old: oldCounts,
                    new: newCounts,
                });

                console.log(`📝 Bus ${(bus as any).busNumber || bus.id}: ${oldCounts.currentMembers} → ${newCounts.currentMembers} (M: ${oldCounts.morningCount}→${newCounts.morningCount}, E: ${oldCounts.eveningCount}→${newCounts.eveningCount})`);
            }
        }

        if (updates.length > 0) {
            await batch.commit();
            console.log(`✅ Updated ${updates.length} buses`);
        } else {
            console.log('✅ All bus counts are already correct');
        }

        return NextResponse.json({
            success: true,
            message: `Synchronized ${updates.length} bus(es) with student data`,
            totalBuses: buses.length,
            totalStudents: students.length,
            updatedBuses: updates,
        });

    } catch (error: any) {
        console.error('❌ Error syncing bus counts:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to sync bus counts' },
            { status: 500 }
        );
    }
}
