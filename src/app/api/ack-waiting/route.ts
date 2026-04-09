import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { getSupabaseServer } from '@/lib/supabase-server';
import { withSecurity } from '@/lib/security/api-security';
import { AckWaitingSchema } from '@/lib/security/validation-schemas';
import { RateLimits } from '@/lib/security/rate-limiter';

// Initialize Supabase client
const supabase = getSupabaseServer();

export const POST = withSecurity(
  async (request, { auth, body, requestId }) => {
    const { waitingFlagId } = body;
    const driverUid = auth.uid;

    try {
      // 1. Verify that the driver exists in Firestore and get their assigned bus
      const driverDoc = await adminDb.collection('drivers').doc(driverUid).get();
      if (!driverDoc.exists) {
        return NextResponse.json({ success: false, error: 'Driver not found', requestId }, { status: 404 });
      }

      const driverData = driverDoc.data();
      const driverBusId = driverData?.assignedBusId;

      // 2. Get the waiting flag from Supabase
      const { data: waitingFlag, error: selectError } = await supabase
        .from('waiting_flags')
        .select('*')
        .eq('id', waitingFlagId)
        .single();

      if (selectError || !waitingFlag) {
        console.warn(`[${requestId}] Waiting flag ${waitingFlagId} not found`);
        return NextResponse.json({ success: false, error: 'Waiting flag not found', requestId }, { status: 404 });
      }

      // 3. Authorization check: Is this the driver for this bus?
      // Check both assigned bus and any temporary assignments if necessary
      // For now, matching the original logic: driverData.assignedBusId === waitingFlag.bus_id
      if (driverBusId !== waitingFlag.bus_id) {
        console.warn(`[${requestId}] Driver ${driverUid} unauthorized for flag on bus ${waitingFlag.bus_id} (assigned to ${driverBusId})`);
        return NextResponse.json({ success: false, error: 'Authorization failed: Driver-bus mismatch', requestId }, { status: 403 });
      }

      // 4. Update waiting flag status to acknowledged
      const { error: updateError } = await supabase
        .from('waiting_flags')
        .update({ 
            status: 'acknowledged',
            ack_by_driver_uid: driverUid 
        })
        .eq('id', waitingFlagId);

      if (updateError) {
        console.error(`[${requestId}] Failed to update flag status:`, updateError);
        return NextResponse.json({ success: false, error: 'Database update failed', requestId }, { status: 500 });
      }

      // 5. Asynchronous FCM notification to student (don't block the response)
      const notifyStudent = async () => {
        try {
          // Get FCM tokens for this student
          const tokensSnapshot = await adminDb
            .collection('fcm_tokens')
            .where('userUid', '==', waitingFlag.student_uid)
            .get();

          const studentTokens = tokensSnapshot.docs
            .map((doc: any) => doc.data().deviceToken)
            .filter((token: string) => token);

          if (studentTokens.length > 0) {
            const message = {
              notification: {
                title: 'Bus Acknowledged 🚌',
                body: `Driver ${driverData?.fullName || 'the bus driver'} has acknowledged your waiting request. Get ready!`
              },
              tokens: studentTokens,
              data: {
                type: 'waiting_flag_ack',
                flagId: waitingFlagId,
                busId: waitingFlag.bus_id
              }
            };

            await adminAuth!.messaging().sendEachForMulticast(message);
          }
        } catch (fcmError) {
          console.error(`[${requestId}] Background FCM notification failed:`, fcmError);
        }
      };

      // Execute notification in background (opportunistic)
      notifyStudent();

      return NextResponse.json({ 
        success: true,
        message: 'Waiting flag acknowledged successfully',
        requestId
      });

    } catch (error: any) {
      console.error(`[${requestId}] Unexpected error in ack-waiting:`, error);
      return NextResponse.json(
        { success: false, error: 'An internal error occurred', requestId },
        { status: 500 }
      );
    }
  },
  {
    requiredRoles: ['driver'],
    schema: AckWaitingSchema,
    rateLimit: RateLimits.CREATE
  }
);