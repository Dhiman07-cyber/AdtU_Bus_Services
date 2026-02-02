/**
 * POST /api/driver/heartbeat
 * 
 * Update heartbeat for an active trip to keep lock alive.
 * Should be called every 5 seconds from driver app.
 * 
 * Request body:
 * - idToken: string (Firebase ID token)
 * - tripId: string
 * - busId: string
 * 
 * Response:
 * - success: boolean
 * - reason?: string (on failure)
 */

import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';
import { tripLockService } from '@/lib/services/trip-lock-service';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { idToken, tripId, busId } = body;

        // Validate required fields
        if (!idToken || !tripId || !busId) {
            return NextResponse.json(
                { error: 'Missing required fields: idToken, tripId, busId' },
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

        // Update heartbeat
        const result = await tripLockService.heartbeat(tripId, driverId, busId);

        if (!result.success) {
            return NextResponse.json(
                { success: false, reason: result.reason },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString()
        });

    } catch (error: any) {
        console.error('Error in heartbeat:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to update heartbeat' },
            { status: 500 }
        );
    }
}
