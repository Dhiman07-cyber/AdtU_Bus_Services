
import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { idToken, busId, studentId, studentName, stopName } = body;

        // Validate
        if (!idToken || !busId || !studentId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Verify token
        const decodedToken = await auth.verifyIdToken(idToken);
        if (decodedToken.uid !== studentId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        console.log(`📣 Requesting wait for student ${studentId} on bus ${busId}`);

        // Broadcast to driver channel
        // Channel name: driver_wait_request_{busId}
        const channel = supabase.channel(`driver_wait_request_${busId}`);

        await channel.send({
            type: 'broadcast',
            event: 'wait_request',
            payload: {
                studentId,
                studentName,
                stopName,
                timestamp: Date.now()
            }
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('❌ Error requesting wait:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
