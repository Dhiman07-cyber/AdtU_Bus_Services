/**
 * POST /api/missed-bus/cancel
 * 
 * Student cancels their pending missed-bus pickup request.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/firebase-admin';
import { missedBusService } from '@/lib/services/missed-bus-service';

export async function POST(request: Request) {
    const startTime = Date.now();

    try {
        const body = await request.json();
        const { idToken, requestId } = body;

        // Validate required fields
        if (!idToken || !requestId) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'Missing required fields',
                    required: ['idToken', 'requestId']
                },
                { status: 400 }
            );
        }

        // Verify Firebase token
        const decodedToken = await auth.verifyIdToken(idToken);
        const studentId = decodedToken.uid;

        // Call the service
        const result = await missedBusService.cancelRequest({
            studentId,
            requestId
        });

        // Log the operation
        const elapsed = Date.now() - startTime;
        console.log(`📝 Missed-bus cancel completed in ${elapsed}ms:`, {
            studentId,
            requestId,
            success: result.success
        });

        if (!result.success) {
            return NextResponse.json({
                success: false,
                error: result.message
            }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            message: result.message
        });

    } catch (error: any) {
        console.error('❌ Error in missed-bus/cancel:', error);

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
                error: error.message || 'Internal server error'
            },
            { status: 500 }
        );
    }
}
