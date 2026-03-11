import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { withSecurity } from '@/lib/security/api-security';
import { DebugDriverBusLinkSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

export const GET = withSecurity(
    async (request, { body }) => {
        const { driverUID } = body as any;
        const driverDoc = await adminDb.collection('drivers').doc(driverUID).get();
        if (!driverDoc.exists) return NextResponse.json({ success: false, error: 'Driver not found' }, { status: 404 });

        const driverData = driverDoc.data();
        const [assignedBuses, activeBuses] = await Promise.all([
            adminDb.collection('buses').where('assignedDriverId', '==', driverUID).get(),
            adminDb.collection('buses').where('activeDriverId', '==', driverUID).get()
        ]);

        const linkedBuses: any[] = [];
        const busIds = new Set<string>();

        assignedBuses.docs.forEach((doc: any) => {
            const data = doc.data();
            busIds.add(doc.id);
            linkedBuses.push({ busId: doc.id, busNumber: data.busNumber, linkType: 'assignedDriverId', assignedDriverId: data.assignedDriverId, activeDriverId: data.activeDriverId });
        });

        activeBuses.docs.forEach((doc: any) => {
            const data = doc.data();
            if (!busIds.has(doc.id)) {
                busIds.add(doc.id);
                linkedBuses.push({ busId: doc.id, busNumber: data.busNumber, linkType: 'activeDriverId', assignedDriverId: data.assignedDriverId, activeDriverId: data.activeDriverId });
            }
        });

        const isReserved = !driverData?.assignedBusId && !driverData?.busId;
        const hasConflict = linkedBuses.length > 0;

        return NextResponse.json({
            success: true,
            driver: { uid: driverUID, name: driverData?.fullName || driverData?.name, driverId: driverData?.driverId, status: driverData?.status, assignedBusId: driverData?.assignedBusId, busId: driverData?.busId, isReservedInDriverDoc: isReserved },
            linkedBuses,
            analysis: {
                isReserved, hasConflict,
                message: hasConflict ? `⚠️ Driver appears reserved but is still linked to ${linkedBuses.length} bus(es).` : isReserved ? '✅ Driver properly reserved.' : 'ℹ️ Driver has bus assignment.'
            }
        });
    },
    {
        requiredRoles: ['admin'],
        schema: DebugDriverBusLinkSchema,
        rateLimit: RateLimits.READ
    }
);
