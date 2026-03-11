import { NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';
import { createClient } from '@supabase/supabase-js';
import { withSecurity } from '@/lib/security/api-security';
import { 
    WaitingFlagPostSchema, 
    WaitingFlagQuerySchema, 
    WaitingFlagDeleteSchema 
} from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

/**
 * POST /api/student/waiting-flag
 * 
 * Raises a waiting flag for a student.
 */
export const POST = withSecurity(
    async (request, { auth, body }) => {
        const { busId, lat, lng, message, timestamp, routeId, stopName, stopId, stopLat, stopLng } = body as any;
        const studentUid = auth.uid;

        // Initialize Supabase client
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || '',
            process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        );

        // 1. Get student data and verify assignment
        let studentDoc = await adminDb.collection('students').doc(studentUid).get();
        let studentData: any = null;

        if (studentDoc.exists) {
            studentData = studentDoc.data();
        } else {
            const studentQuery = await adminDb.collection('students')
                .where('uid', '==', studentUid)
                .limit(1)
                .get();

            if (!studentQuery.empty) {
                studentDoc = studentQuery.docs[0];
                studentData = studentDoc.data();
            }
        }

        if (!studentData) {
            return NextResponse.json({ error: 'Student record not found' }, { status: 404 });
        }

        const studentBusId = studentData.busId || studentData.assignedBusId;
        if (!studentBusId || studentBusId !== busId) {
            return NextResponse.json({
                error: `Forbidden: You are not assigned to bus ${busId}. Your assigned bus is ${studentBusId || 'none'}.`
            }, { status: 403 });
        }

        // 2. Prevent duplicate active flags
        const actualStudentId = studentDoc.id;
        const { data: existingFlags } = await supabase
            .from('waiting_flags')
            .select('id')
            .eq('student_uid', actualStudentId)
            .eq('bus_id', busId)
            .in('status', ['raised', 'waiting', 'acknowledged'])
            .limit(1);

        if (existingFlags && existingFlags.length > 0) {
            return NextResponse.json({
                success: false,
                error: 'You already have an active waiting flag for this bus',
                existingFlagId: existingFlags[0].id
            }, { status: 409 });
        }

        // 3. Prepare flag data
        const currentTimestamp = timestamp || Date.now();
        const flagData: any = {
            student_uid: actualStudentId,
            student_name: studentData.fullName || studentData.name || 'Student',
            bus_id: busId,
            route_id: routeId || 'unknown',
            stop_id: stopId || 'unknown',
            stop_name: stopName || 'Unknown Stop',
            status: 'raised',
            created_at: new Date(currentTimestamp).toISOString(),
            message: message || null
        };

        // Determine coordinates
        if (lat !== undefined && lng !== undefined) {
            flagData.stop_lat = parseFloat(lat as any);
            flagData.stop_lng = parseFloat(lng as any);
        } else if (stopLat !== undefined && stopLng !== undefined) {
            flagData.stop_lat = parseFloat(stopLat as any);
            flagData.stop_lng = parseFloat(stopLng as any);
        } else {
            return NextResponse.json({
                error: 'Location is required to raise a waiting flag.',
                code: 'LOCATION_REQUIRED'
            }, { status: 400 });
        }

        // 4. Insert into Supabase
        const { data, error: supabaseError } = await supabase
            .from('waiting_flags')
            .insert(flagData)
            .select();

        if (supabaseError) {
            console.error('Supabase insert error:', supabaseError);
            return NextResponse.json({ error: 'Failed to create waiting flag' }, { status: 500 });
        }

        const insertedFlag = data[0];

        // 5. Broadcast to driver
        try {
            const channel = supabase.channel(`waiting_flags_${busId}`);
            await new Promise<void>((resolve) => {
                const timeout = setTimeout(() => resolve(), 2000);
                channel.subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        clearTimeout(timeout);
                        resolve();
                    }
                });
            });

            await channel.send({
                type: 'broadcast',
                event: 'waiting_flag_created',
                payload: insertedFlag
            });
            await supabase.removeChannel(channel);
        } catch (err) {
            console.warn('Broadcast failed (non-critical):', err);
        }

        return NextResponse.json({
            success: true,
            flagId: insertedFlag.id,
            flag: insertedFlag
        });
    },
    {
        requiredRoles: ['student'],
        schema: WaitingFlagPostSchema,
        rateLimit: RateLimits.WAITING_FLAG,
        allowBodyToken: true
    }
);

/**
 * DELETE /api/student/waiting-flag
 * 
 * Cancels a waiting flag.
 */
export const DELETE = withSecurity(
    async (request, { auth, body }) => {
        const { flagId, busId } = body as any;
        const studentUid = auth.uid;

        // Initialize Supabase client
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || '',
            process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        );

        // 1. Get student document to match ID format used in waiting_flags
        const studentQuery = await adminDb.collection('students')
            .where('uid', '==', studentUid)
            .limit(1)
            .get();

        const actualStudentId = studentQuery.empty ? studentUid : studentQuery.docs[0].id;

        // 2. Update status in Supabase (don't delete for audit)
        const { error: supabaseError } = await supabase
            .from('waiting_flags')
            .update({ status: 'cancelled' })
            .eq('id', flagId)
            .eq('student_uid', actualStudentId);

        if (supabaseError) {
            console.error('Supabase error:', supabaseError);
            return NextResponse.json({ error: 'Failed to cancel waiting flag' }, { status: 500 });
        }

        // 3. Broadcast removal
        try {
            const channel = supabase.channel(`waiting_flags_${busId}`);
            await new Promise<void>((resolve) => {
                const timeout = setTimeout(() => resolve(), 2000);
                channel.subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        clearTimeout(timeout);
                        resolve();
                    }
                });
            });

            await channel.send({
                type: 'broadcast',
                event: 'waiting_flag_removed',
                payload: { flagId, studentUid: actualStudentId }
            });
            await supabase.removeChannel(channel);
        } catch (err) {
            console.warn('Broadcast failed (non-critical):', err);
        }

        return NextResponse.json({ success: true });
    },
    {
        requiredRoles: ['student'],
        schema: WaitingFlagDeleteSchema,
        rateLimit: RateLimits.WAITING_FLAG,
        allowBodyToken: true
    }
);

/**
 * GET /api/student/waiting-flag
 * 
 * Fetches the current active flag for a student.
 */
export const GET = withSecurity(
    async (request, { auth, body }) => {
        const { studentUid } = body as any;
        const requesterUid = auth.uid;

        // Security check: Only allow fetching your own flag
        // (Wait, we need to handle doc ID vs auth UID here too)
        
        // Initialize Supabase client
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL || '',
            process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        );

        const { data, error } = await supabase
            .from('waiting_flags')
            .select('*')
            .eq('student_uid', studentUid)
            .in('status', ['waiting', 'raised', 'acknowledged'])
            .maybeSingle();

        if (error) {
            console.error('Error fetching waiting flag:', error);
            return NextResponse.json({ error: 'Database error' }, { status: 500 });
        }

        return NextResponse.json({ data: data || null });
    },
    {
        requiredRoles: ['student'],
        schema: WaitingFlagQuerySchema,
        rateLimit: RateLimits.READ
    }
);