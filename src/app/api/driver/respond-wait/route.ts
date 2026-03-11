import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withSecurity } from '@/lib/security/api-security';
import { RespondWaitSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

/**
 * POST /api/driver/respond-wait
 * 
 * Sends a wait response from a driver to a student's dashboard.
 */
export const POST = withSecurity(
    async (request, { body }) => {
        const { studentId, response, busId } = body as any;

        console.log(`📣 Driver responded to wait request for ${studentId}: ${response}`);

        // Initialize Supabase client
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || '',
            process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        );

        // Broadcast to student channel
        // Channel name: student_wait_response_{studentId}
        const channel = supabase.channel(`student_wait_response_${studentId}`);

        await channel.send({
            type: 'broadcast',
            event: `wait_${response}`, // wait_accepted or wait_rejected
            payload: {
                busId,
                timestamp: Date.now()
            }
        });

        return NextResponse.json({ success: true });
    },
    {
        requiredRoles: ['driver'],
        schema: RespondWaitSchema,
        rateLimit: RateLimits.CREATE,
        allowBodyToken: true
    }
);
