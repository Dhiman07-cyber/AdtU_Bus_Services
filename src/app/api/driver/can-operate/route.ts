/**
 * POST /api/driver/can-operate
 * 
 * Check if a driver can operate a specific bus.
 * Returns whether the driver is allowed to open the Track Bus page.
 * 
 * Request body:
 * - busId: string (bus ID to check)
 * 
 * Response:
 * - allowed: boolean
 * - reason?: string (only when denied)
 */

import { NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';
import { tripLockService } from '@/lib/services/trip-lock-service';
import { withSecurity } from '@/lib/security/api-security';
import { BusIdSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

export const POST = withSecurity(
    async (request, { auth, body }) => {
        const { busId } = body as any;
        const driverId = auth.uid;

        // Check driver assignment to this bus
        const driverDoc = await adminDb.collection('drivers').doc(driverId).get();
        if (!driverDoc.exists) {
            return NextResponse.json(
                { error: 'Driver profile not found' },
                { status: 404 }
            );
        }

        const driverData = driverDoc.data();
        const busDoc = await adminDb.collection('buses').doc(busId).get();

        if (!busDoc.exists) {
            return NextResponse.json(
                { error: 'Bus not found' },
                { status: 404 }
            );
        }

        const busData = busDoc.data();

        // Validate driver is assigned to this bus
        const driverClaimsBus =
            driverData?.assignedBusId === busId ||
            driverData?.busId === busId;

        const busClaimsDriver =
            busData?.assignedDriverId === driverId ||
            busData?.activeDriverId === driverId ||
            busData?.driverUID === driverId;

        if (!driverClaimsBus && !busClaimsDriver) {
            return NextResponse.json({
                allowed: false,
                reason: 'You are not assigned to this bus. Please contact operations.'
            });
        }

        // Check lock status using TripLockService
        const result = await tripLockService.canOperate(driverId, busId);

        return NextResponse.json({
            allowed: result.allowed,
            reason: result.allowed ? undefined : result.reason
        });
    },
    {
        requiredRoles: ['driver'],
        schema: BusIdSchema,
        rateLimit: RateLimits.READ,
        allowBodyToken: true
    }
);
