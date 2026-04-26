import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { withSecurity } from '@/lib/security/api-security';
import { EmptySchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

export const POST = withSecurity(
    async () => {
        console.log('🔄 Starting bus count synchronization...');

        // Get all buses
        const busesSnapshot = await adminDb.collection('buses').get();
        const buses = busesSnapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`📊 Found ${buses.length} buses to process`);

        // Get all active students
        const studentsSnapshot = await adminDb.collection('students')
            .where('status', '==', 'active')
            .get();

        const students = studentsSnapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`👥 Found ${students.length} active students`);

        const busCounts = new Map<string, { morningCount: number; eveningCount: number; total: number; stopCounts: Record<string, number> }>();

        buses.forEach((bus: any) => {
            busCounts.set(bus.id, { morningCount: 0, eveningCount: 0, total: 0, stopCounts: {} });
        });

        students.forEach((student: any) => {
            const busId = student.busId || student.assignedBusId || '';
            if (!busId) return;

            let matchedBusId: string | null = null;
            for (const bus of buses) {
                if (bus.id === busId || bus.busId === busId || bus.busNumber === busId) {
                    matchedBusId = bus.id;
                    break;
                }
            }

            if (!matchedBusId) {
                console.log(`⚠️ Student ${student.fullName || student.id} has unknown busId: ${busId}`);
                return;
            }

            const counts = busCounts.get(matchedBusId)!;
            const shift = (student.shift || 'morning').toLowerCase();

            counts.total++;
            if (shift === 'morning' || shift === 'both') counts.morningCount++;
            if (shift === 'evening' || shift === 'both') counts.eveningCount++;

            // Count per stop
            const stopId = student.stopId || '';
            if (stopId) {
                counts.stopCounts[stopId] = (counts.stopCounts[stopId] || 0) + 1;
            }
        });

        const updates: any[] = [];
        const batch = adminDb.batch();

        for (const bus of buses) {
            const counts = busCounts.get(bus.id) || { morningCount: 0, eveningCount: 0, total: 0, stopCounts: {} };
            const busRef = adminDb.collection('buses').doc(bus.id);

            const oldCounts = {
                currentMembers: bus.currentMembers || 0,
                morningCount: bus.load?.morningCount || 0,
                eveningCount: bus.load?.eveningCount || 0,
                stopCounts: bus.stopCounts || {}
            };

            const newCounts = {
                currentMembers: counts.total,
                morningCount: counts.morningCount,
                eveningCount: counts.eveningCount,
                stopCounts: counts.stopCounts
            };

            if (
                oldCounts.currentMembers !== newCounts.currentMembers ||
                oldCounts.morningCount !== newCounts.morningCount ||
                oldCounts.eveningCount !== newCounts.eveningCount ||
                JSON.stringify(oldCounts.stopCounts) !== JSON.stringify(newCounts.stopCounts)
            ) {
                batch.update(busRef, {
                    currentMembers: newCounts.currentMembers,
                    'load.morningCount': newCounts.morningCount,
                    'load.eveningCount': newCounts.eveningCount,
                    stopCounts: newCounts.stopCounts,
                    updatedAt: new Date().toISOString(),
                });

                updates.push({
                    busId: bus.id,
                    busNumber: bus.busNumber || bus.id,
                    old: oldCounts,
                    new: newCounts,
                });
            }
        }

        if (updates.length > 0) {
            await batch.commit();
            console.log(`✅ Updated ${updates.length} buses`);
        }

        return NextResponse.json({
            success: true,
            message: `Synchronized ${updates.length} bus(es) with student data`,
            totalBuses: buses.length,
            totalStudents: students.length,
            updatedBuses: updates,
        });
    },
    {
        requiredRoles: ['admin', 'moderator'],
        schema: EmptySchema,
        rateLimit: RateLimits.CREATE,
        allowBodyToken: true
    }
);
