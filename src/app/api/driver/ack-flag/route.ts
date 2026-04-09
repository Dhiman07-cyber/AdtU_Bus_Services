import { NextResponse } from 'next/server';
import { db as adminDb } from '@/lib/firebase-admin';
import { getSupabaseServer } from '@/lib/supabase-server';
import { withSecurity } from '@/lib/security/api-security';
import { MarkBoardedSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

/**
 * POST /api/driver/ack-flag
 * 
 * Body: { flagId }
 * 
 * Validates:
 * - Driver is authenticated and assigned to the route/bus
 * 
 * Actions:
 * - Update waiting_flags.status = "acknowledged"
 * - Set ackBy_driver_uid
 * - Broadcast update to route channel
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

    // Verify driver is assigned to this bus/route
    const driverDoc = await adminDb.collection('drivers').doc(driverUid).get();
    if (!driverDoc.exists) {
      return NextResponse.json({ error: 'Driver profile not found' }, { status: 404 });
    }

    const driverData = driverDoc.data();
    const driverClaimsBus =
      driverData?.assignedBusId === flagData.bus_id ||
      driverData?.busId === flagData.bus_id;

    if (!driverClaimsBus) {
      console.error('Driver assignment validation failed:', {
        driverUid,
        busId: flagData.bus_id
      });
      return NextResponse.json(
        { error: 'Driver is not assigned to this bus' },
        { status: 403 }
      );
    }

    // Update waiting flag status
    const { error: updateError } = await supabase
      .from('waiting_flags')
      .update({
        status: 'acknowledged',
        ack_by_driver_uid: driverUid
      })
      .eq('id', flagId);

    if (updateError) {
      console.error('Error acknowledging flag:', updateError);
      return NextResponse.json(
        { error: 'Failed to acknowledge flag' },
        { status: 500 }
      );
    }

    // Broadcast to multiple channels for instant UI updates
    try {
      // 1. Broadcast to waiting_flags channel (for driver UI update)
      const flagsChannel = supabase.channel(`waiting_flags_${flagData.bus_id}`);
      await flagsChannel.send({
        type: 'broadcast',
        event: 'waiting_flag_acknowledged',
        payload: {
          flagId,
          studentUid: flagData.student_uid,
          status: 'acknowledged'
        }
      });
      await supabase.removeChannel(flagsChannel);

      // 2. Broadcast to student-specific channel (for student UI update)
      const studentChannel = supabase.channel(`student_${flagData.student_uid}`);
      await studentChannel.send({
        type: 'broadcast',
        event: 'flag_acknowledged',
        payload: {
          flagId,
          busId: flagData.bus_id,
          ackByDriverUid: driverUid,
          timestamp: new Date().toISOString(),
          message: 'Driver has acknowledged your waiting flag!'
        }
      });
      await supabase.removeChannel(studentChannel);

      // 3. Broadcast to route channel (for admin/monitoring)
      const routeChannel = supabase.channel(`route_${flagData.route_id}`);
      await routeChannel.send({
        type: 'broadcast',
        event: 'waiting_flag_acknowledged',
        payload: {
          flagId,
          studentUid: flagData.student_uid,
          busId: flagData.bus_id,
          routeId: flagData.route_id,
          ackByDriverUid: driverUid,
          timestamp: new Date().toISOString()
        }
      });
      await supabase.removeChannel(routeChannel);
    } catch (broadcastError) {
      console.error('Broadcast error (non-critical):', broadcastError);
    }

    console.log('✅ Flag acknowledged - student will see in-app toast via broadcast');

    return NextResponse.json({
      success: true,
      message: 'Flag acknowledged successfully',
      data: {
        flagId,
        studentUid: flagData.student_uid,
        ackByDriverUid: driverUid
      }
    });
  },
  {
    requiredRoles: ['driver'],
    schema: MarkBoardedSchema,
    rateLimit: RateLimits.CREATE,
    allowBodyToken: true
  }
);
