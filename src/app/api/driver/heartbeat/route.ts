/**
 * POST /api/driver/heartbeat
 * 
 * Update heartbeat for an active trip to keep lock alive.
 * Should be called every 5 seconds from driver app.
 * 
 * Request body:
 * - tripId: string
 * - busId: string
 * 
 * Response:
 * - success: boolean
 * - reason?: string (on failure)
 */

import { NextResponse } from 'next/server';
import { tripLockService } from '@/lib/services/trip-lock-service';
import { withSecurity } from '@/lib/security/api-security';
import { HeartbeatSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

export const POST = withSecurity(
    async (request, { auth, body }) => {
        const { tripId, busId } = body;
        const driverId = auth.uid;

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
    },
    {
        requiredRoles: ['driver'],
        schema: HeartbeatSchema,
        rateLimit: RateLimits.LOCATION_UPDATE, // High frequency for telemetry
        allowBodyToken: true
    }
);
