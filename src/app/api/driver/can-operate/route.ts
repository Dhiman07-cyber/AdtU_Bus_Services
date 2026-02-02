/**
 * POST /api/driver/can-operate
 * 
 * Check if a driver can operate a specific bus.
 * Returns whether the driver is allowed to open the Track Bus page.
 * 
 * Request body:
 * - idToken: string (Firebase ID token)
 * - busId: string (bus ID to check)
 * 
 * Response:
 * - allowed: boolean
 * - reason?: string (only when denied)
 */

import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';
import { tripLockService } from '@/lib/services/trip-lock-service';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { idToken, busId } = body;

        // Validate required fields
        if (!idToken || !busId) {
            return NextResponse.json(
                { error: 'Missing required fields: idToken, busId' },
                { status: 400 }
            );
        }

        // Verify Firebase token
        if (!auth) {
            return NextResponse.json(
                { error: 'Firebase Admin not initialized' },
                { status: 500 }
            );
        }

        const decodedToken = await auth.verifyIdToken(idToken);
        const driverId = decodedToken.uid;

        // Verify user is a driver
        const userDoc = await adminDb.collection('users').doc(driverId).get();
        if (!userDoc.exists || userDoc.data()?.role !== 'driver') {
            return NextResponse.json(
                { error: 'User is not authorized as a driver' },
                { status: 403 }
            );
        }

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

    } catch (error: any) {
        console.error('Error in can-operate:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
