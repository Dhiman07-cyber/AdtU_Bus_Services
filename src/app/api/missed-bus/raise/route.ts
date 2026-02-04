/**
 * POST /api/missed-bus/raise
 * 
 * Student raises a missed-bus request to get picked up by an alternate bus.
 * 
 * Features:
 * - Idempotent (uses opId)
 * - Rate limited (3 requests per day)
 * - Returns maintenance toast if ORS fails
 * - Returns "no candidates" modal if no eligible buses
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/firebase-admin';
import { missedBusService, MESSAGES } from '@/lib/services/missed-bus-service';

export async function POST(request: Request) {
    const startTime = Date.now();

    try {
        const body = await request.json();
        const { idToken, opId, routeId, stopId, assignedTripId, assignedBusId } = body;

        // Validate required fields
        if (!idToken || !opId || !routeId || !stopId) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Missing required fields',
                    required: ['idToken', 'opId', 'routeId', 'stopId']
                },
                { status: 400 }
            );
        }

        // Verify Firebase token
        const decodedToken = await auth.verifyIdToken(idToken);
        const studentId = decodedToken.uid;

        // Perform eager cleanup to expire stale requests (works around Vercel Hobby cron limits)
        await missedBusService.performEagerCleanup();

        // Call the service
        const result = await missedBusService.raiseRequest({
            opId,
            studentId,
            routeId,
            stopId,
            assignedTripId,
            assignedBusId
        });

        // Log the operation
        const elapsed = Date.now() - startTime;
        console.log(`📝 Missed-bus raise completed in ${elapsed}ms:`, {
            studentId,
            routeId,
            stopId,
            success: result.success,
            stage: result.stage
        });

        // Determine response status and format
        if (!result.success) {
            switch (result.stage) {
                case 'maintenance':
                    return NextResponse.json({
                        success: false,
                        stage: 'maintenance',
                        toast: MESSAGES.MAINTENANCE_TOAST,
                        message: result.message
                    }, { status: 503 });

                case 'no_candidates':
                    return NextResponse.json({
                        success: false,
                        stage: 'no_candidates',
                        modal: MESSAGES.NO_CANDIDATES_MODAL,
                        message: result.message
                    }, { status: 200 });

                case 'assigned_on_way':
                    return NextResponse.json({
                        success: false,
                        stage: 'assigned_on_way',
                        modal: MESSAGES.ASSIGNED_BUS_ON_WAY,
                        message: result.message
                    }, { status: 200 });

                case 'rate_limited':
                    return NextResponse.json({
                        success: false,
                        stage: 'rate_limited',
                        toast: MESSAGES.RATE_LIMITED,
                        message: result.message
                    }, { status: 429 });

                case 'already_pending':
                    return NextResponse.json({
                        success: false,
                        stage: 'already_pending',
                        modal: MESSAGES.ALREADY_HAS_PENDING,
                        message: result.message
                    }, { status: 409 });

                default:
                    return NextResponse.json({
                        success: false,
                        error: result.message
                    }, { status: 500 });
            }
        }

        // Success - request created
        return NextResponse.json({
            success: true,
            stage: 'pending',
            requestId: result.requestId,
            candidates: result.candidates,
            modal: MESSAGES.REQUEST_PENDING,
            message: result.message
        });

    } catch (error: any) {
        console.error('❌ Error in missed-bus/raise:', error);

        // Check if it's an auth error
        if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
            return NextResponse.json(
                { success: false, error: 'Invalid or expired token' },
                { status: 401 }
            );
        }

        return NextResponse.json(
            {
                success: false,
                stage: 'maintenance',
                toast: MESSAGES.MAINTENANCE_TOAST,
                error: error.message || 'Internal server error'
            },
            { status: 500 }
        );
    }
}
