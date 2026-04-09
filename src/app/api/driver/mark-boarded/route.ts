import { NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';
import { getSupabaseServer } from '@/lib/supabase-server';
import { withSecurity } from '@/lib/security/api-security';
import { MarkBoardedSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

/**
 * POST /api/driver/mark-boarded
 * 
 * Body: { flagId }
 * 
 * Actions:
 * - Update waiting_flags.status = "picked_up"
 * - Broadcast update to student channel
 * - Broadcast update to bus channel
 */
export const POST = withSecurity(
    async (request, { auth, body }) => {
        const { flagId } = body as any;
        const driverUid = auth.uid;

        // Initialize Supabase client
        const supabase = getSupabaseServer();

        // Get waiting flag
        const { data: flagData, error: flagError } = await supabase
            .from('waiting_flags')
            .select('*')
            .eq('id', flagId)
            .single();

        if (flagError || !flagData) {
            return NextResponse.json(
                { error: 'Waiting flag not found' },
                { status: 404 }
            );
        }

        // Update waiting flag status
        const { error: updateError } = await supabase
            .from('waiting_flags')
            .update({
                status: 'picked_up',
                boarded_at: new Date().toISOString(),
                ack_by_driver_uid: driverUid
            })
            .eq('id', flagId);

        if (updateError) {
            console.error('Error marking flag as picked_up:', updateError);
            return NextResponse.json(
                { error: 'Failed to mark flag as picked_up' },
                { status: 500 }
            );
        }

        // Broadcast to multiple channels for instant UI updates
        try {
            // 1. Broadcast to waiting_flags channel (for driver UI update)
            const flagsChannel = supabase.channel(`waiting_flags_${flagData.bus_id}`);
            await flagsChannel.send({
                type: 'broadcast',
                event: 'waiting_flag_updated',
                payload: {
                    flagId,
                    studentUid: flagData.student_uid,
                    status: 'picked_up',
                    timestamp: new Date().toISOString()
                }
            });
            await supabase.removeChannel(flagsChannel);

            // 2. Broadcast to student-specific channel (for student UI update)
            const studentChannel = supabase.channel(`student_${flagData.student_uid}`);
            await studentChannel.send({
                type: 'broadcast',
                event: 'flag_acknowledged', // The frontend listens to flag_acknowledged for both ack and pickup
                payload: {
                    flagId,
                    busId: flagData.bus_id,
                    status: 'picked_up',
                    ackByDriverUid: driverUid,
                    timestamp: new Date().toISOString(),
                    message: 'Driver has arrived!'
                }
            });
            await supabase.removeChannel(studentChannel);

            // 3. Broadcast to route channel (for admin/monitoring)
            const routeChannel = supabase.channel(`route_${flagData.route_id}`);
            await routeChannel.send({
                type: 'broadcast',
                event: 'waiting_flag_updated',
                payload: {
                    flagId,
                    studentUid: flagData.student_uid,
                    busId: flagData.bus_id,
                    routeId: flagData.route_id,
                    status: 'picked_up',
                    timestamp: new Date().toISOString()
                }
            });
            await supabase.removeChannel(routeChannel);
        } catch (broadcastError) {
            console.error('Broadcast error (non-critical):', broadcastError);
        }

        // Update in Firestore backup if exists
        try {
            const firestoreDoc = await adminDb
                .collection('waiting_flags')
                .where('supabaseId', '==', flagId)
                .limit(1)
                .get();

            if (!firestoreDoc.empty) {
                await firestoreDoc.docs[0].ref.update({
                    status: 'picked_up',
                    boarded_at: new Date().toISOString()
                });
            }
        } catch (fsError) {
            console.error('Firestore sync error:', fsError);
        }

        console.log(`✅ Flag marked as picked up for student ${flagData.student_uid}`);

        return NextResponse.json({
            success: true,
            message: 'Student boarded successfully',
            data: {
                flagId,
                studentUid: flagData.student_uid,
            }
        });
    },
    {
        requiredRoles: ['driver'],
        schema: MarkBoardedSchema,
        rateLimit: RateLimits.CREATE, // Prevent spam
        allowBodyToken: true
    }
);
