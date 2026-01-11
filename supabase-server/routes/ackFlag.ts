import { Request, Response } from 'express';
import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';

// Extend Request type to include user property
interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    [key: string]: any;
  };
}

// Initialize Supabase client with service role key for backend operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const db = admin.firestore();

export async function ackWaitingFlag(req: AuthenticatedRequest, res: Response) {
  try {
    const { waitingFlagId } = req.body;
    const driverUid = req.user?.uid;
    
    if (!driverUid) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Verify that the user is a driver
    const driverDoc = await db.collection('drivers').doc(driverUid).get();
    if (!driverDoc.exists) {
      return res.status(403).json({ error: 'Only drivers can acknowledge waiting flags' });
    }
    
    // Verify the flag exists and get its details
    const { data: flagData, error: fetchError } = await supabase
      .from('waiting_flags')
      .select('bus_id, route_id, student_uid')
      .eq('id', waitingFlagId)
      .single();
    
    if (fetchError) {
      console.error('Error fetching waiting flag:', fetchError);
      return res.status(404).json({ error: 'Waiting flag not found' });
    }
    
    // Verify the driver is assigned to the same bus
    const driverData = driverDoc.data();
    if (driverData?.assignedBusId !== flagData.bus_id) {
      return res.status(403).json({ error: 'Driver is not assigned to this bus' });
    }
    
    // Update waiting flag status to 'acknowledged'
    const { error } = await supabase
      .from('waiting_flags')
      .update({ status: 'acknowledged' })
      .eq('id', waitingFlagId);
    
    if (error) {
      console.error('Error acknowledging waiting flag:', error);
      return res.status(500).json({ error: 'Failed to acknowledge waiting flag' });
    }
    
    const timestamp = new Date().toISOString();
    
    // Broadcast acknowledgment via Supabase Realtime channel (route-based)
    const channel = supabase.channel(`route_${flagData.route_id}`);
    const broadcastResult = await channel.send({
      type: "broadcast",
      event: "waiting_flag_acknowledged",
      payload: {
        flagId: waitingFlagId,
        driverUid,
        ts: timestamp
      }
    });
    
    console.log('Broadcast result:', broadcastResult);
    
    // Send FCM notification to student
    try {
      // Get FCM tokens for the student
      const tokensSnapshot = await db
        .collection('fcm_tokens')
        .where('userUid', '==', flagData.student_uid)
        .get();
      
      const studentTokens: string[] = [];
      tokensSnapshot.docs.forEach((tokenDoc) => {
        studentTokens.push(tokenDoc.data().deviceToken);
      });
      
      // Send FCM notification
      if (studentTokens.length > 0) {
        const message = {
          notification: {
            title: 'Flag Acknowledged',
            body: 'Driver has acknowledged your waiting flag'
          },
          tokens: studentTokens
        };
        
        await admin.messaging().sendEachForMulticast(message);
      }
    } catch (fcmError) {
      console.error('Error sending FCM notification to student:', fcmError);
    }
    
    res.json({ success: true, message: 'Waiting flag acknowledged successfully' });
  } catch (error: any) {
    console.error('Error acknowledging waiting flag:', error);
    res.status(500).json({ error: error.message || 'Failed to acknowledge waiting flag' });
  }
}