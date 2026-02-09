
import { NextResponse } from 'next/server';
import { auth } from '@/lib/firebase-admin';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { idToken, studentId, response, busId } = body; // response: 'accepted' | 'rejected'

        // Validate
        if (!idToken || !studentId || !response) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Verify token (Driver's token)
        const decodedToken = await auth.verifyIdToken(idToken);
        // Could verify role here if needed, but quick check for now

        console.log(`📣 Driver responded to wait request for ${studentId}: ${response}`);

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

    } catch (error: any) {
        console.error('❌ Error responding to wait request:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
