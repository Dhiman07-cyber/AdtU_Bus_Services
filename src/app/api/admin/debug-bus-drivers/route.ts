import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { withSecurity } from '@/lib/security/api-security';
import { EmptySchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

export const GET = withSecurity(
    async () => {
        const busesSnapshot = await adminDb.collection('buses').get();
        const buses = busesSnapshot.docs.map((doc: any) => {
            const data = doc.data();
            return {
                docId: doc.id,
                busId: data.busId,
                busNumber: data.busNumber,
                assignedDriverId: data.assignedDriverId,
                activeDriverId: data.activeDriverId,
                driverUid: data.driverUid,
                driver_uid: data.driver_uid
            };
        });

        const driversSnapshot = await adminDb.collection('drivers').get();
        const drivers = driversSnapshot.docs.map((doc: any) => {
            const data = doc.data();
            return {
                uid: doc.id,
                driverId: data.driverId,
                fullName: data.fullName || data.name,
                busId: data.busId,
                assignedBusId: data.assignedBusId
            };
        });

        return NextResponse.json({
            success: true,
            buses,
            drivers,
            summary: {
                totalBuses: buses.length, totalDrivers: drivers.length,
                busesWithLegacyIds: buses.filter((b: any) =>
                    b.assignedDriverId?.startsWith('driver_') || b.activeDriverId?.startsWith('driver_')
                ).length
            }
        });
    },
    {
        requiredRoles: ['admin'],
        schema: EmptySchema,
        rateLimit: RateLimits.READ
    }
);
