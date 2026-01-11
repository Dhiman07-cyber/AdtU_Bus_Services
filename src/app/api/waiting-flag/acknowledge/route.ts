/**
 * POST /api/waiting-flag/acknowledge
 * 
 * Driver acknowledges a waiting flag with:
 * - Driver validation
 * - Status update
 * - Real-time broadcast to student
 * - Audit logging
 */

import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { idToken, flagId, action } = body;

    // Validate required fields
    if (!idToken || !flagId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate action
    if (!['acknowledge', 'boarded', 'ignore'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action' },
        { status: 400 }
      );
    }

    // Verify Firebase token
    const decodedToken = await auth.verifyIdToken(idToken);
    const driverUid = decodedToken.uid;

    // Verify user is a driver
    const userDoc = await adminDb.collection('users').doc(driverUid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'driver') {
      return NextResponse.json(
        { error: 'User is not authorized as a driver' },
        { status: 403 }
      );
    }

    // Get flag details
    const { data: flag, error: fetchError } = await supabase
      .from('waiting_flags')
      .select('*')
      .eq('id', flagId)
      .single();

    if (fetchError || !flag) {
      return NextResponse.json(
        { error: 'Waiting flag not found' },
        { status: 404 }
      );
    }

    // Verify driver is assigned to this bus
    const driverDoc = await adminDb.collection('drivers').doc(driverUid).get();
    const driverData = driverDoc.data();

    if (driverData?.assignedBusId !== flag.bus_id &&
      driverData?.busId !== flag.bus_id) {
      return NextResponse.json(
        { error: 'Driver is not assigned to this bus' },
        { status: 403 }
      );
    }

    // Check flag status
    if (flag.status !== 'raised') {
      return NextResponse.json(
        { error: `Flag already ${flag.status}` },
        { status: 400 }
      );
    }

    // Update flag status based on action
    let newStatus = 'raised';
    let updateData: any = {
      ack_by_driver_uid: driverUid
    };

    switch (action) {
      case 'acknowledge':
        newStatus = 'acknowledged';
        updateData.acknowledged_at = new Date().toISOString();
        break;
      case 'boarded':
        newStatus = 'boarded';
        updateData.boarded_at = new Date().toISOString();
        break;
      case 'ignore':
        newStatus = 'cancelled';
        updateData.cancelled_at = new Date().toISOString();
        break;
    }

    updateData.status = newStatus;

    // Update in Supabase
    const { error: updateError } = await supabase
      .from('waiting_flags')
      .update(updateData)
      .eq('id', flagId);

    if (updateError) {
      console.error('❌ Error updating flag:', updateError);
      return NextResponse.json(
        { error: 'Failed to update flag' },
        { status: 500 }
      );
    }

    // Broadcast to student
    if (action === 'acknowledge') {
      const studentChannel = supabase.channel(`student_${flag.student_uid}`);
      await studentChannel.send({
        type: 'broadcast',
        event: 'flag_acknowledged',
        payload: {
          flagId,
          driverUid,
          driverName: driverData?.name || 'Driver',
          timestamp: new Date().toISOString()
        }
      });
      console.log(`📢 Acknowledgment broadcast to student ${flag.student_uid}`);
    }

    // Broadcast update to all drivers on this bus
    const busChannel = supabase.channel(`waiting_flags_${flag.bus_id}`);
    await busChannel.send({
      type: 'broadcast',
      event: 'waiting_flag_updated',
      payload: {
        flagId,
        status: newStatus,
        action,
        driverUid,
        timestamp: new Date().toISOString()
      }
    });

    // Update in Firestore backup
    const firestoreDoc = await adminDb
      .collection('waiting_flags')
      .where('supabaseId', '==', flagId)
      .limit(1)
      .get();

    if (!firestoreDoc.empty) {
      await firestoreDoc.docs[0].ref.update(updateData);
    }

    // Log operation (audit_logs moved to Supabase)
    console.log(`📝 Waiting flag ${action}:`, {
      actorUid: driverUid,
      action: `waiting_flag_${action}`,
      flagId,
      studentUid: flag.student_uid,
      busId: flag.bus_id,
      previousStatus: flag.status,
      newStatus,
      timestamp: new Date().toISOString()
    });

    const elapsed = Date.now() - startTime;
    console.log(`✅ Flag ${action} completed in ${elapsed}ms`);

    return NextResponse.json({
      success: true,
      message: `Flag ${action} successfully`,
      newStatus
    });

  } catch (error: any) {
    console.error('❌ Error in waiting-flag/acknowledge:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
