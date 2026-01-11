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

export async function endJourney(req: AuthenticatedRequest, res: Response) {
  try {
    const { busId } = req.body;
    const driverUid = req.user?.uid;
    
    if (!driverUid) {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    
    // Verify that the driver is assigned to this bus
    const driverDoc = await db.collection('drivers').doc(driverUid).get();
    if (!driverDoc.exists) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    
    const driverData = driverDoc.data();
    if (driverData?.assignedBusId !== busId) {
      return res.status(403).json({ error: 'Driver is not assigned to this bus' });
    }
    
    // Get route ID from bus document
    const busDoc = await db.collection('buses').doc(busId).get();
    const busData = busDoc.data();
    const routeId = busData?.routeId;
    
    if (!routeId) {
      return res.status(400).json({ error: 'Bus is not assigned to a route' });
    }
    
    const timestamp = new Date().toISOString();
    
    // Update Firestore: buses/{busId} → set status = "idle"
    await db.collection('buses').doc(busId).update({
      status: 'idle',
      lastEndedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Reset bus passenger count to 0 (ephemeral)
    try {
      await db.collection('buses').doc(busId).update({
        currentPassengerCount: 0
      });
    } catch (busError) {
      console.error('Error resetting bus passenger count:', busError);
    }
    
    // Update Supabase driver_status to offline
    const { error: driverStatusError } = await supabase
      .from('driver_status')
      .upsert({
        driver_uid: driverUid,
        bus_id: busId,
        status: 'offline',
        last_updated: timestamp
      });
    
    if (driverStatusError) {
      console.error('Error updating driver status:', driverStatusError);
      return res.status(500).json({ error: 'Failed to update driver status' });
    }
    
    // Clean up: mark all waiting flags for this bus as cancelled
    const { error: cleanupError } = await supabase
      .from('waiting_flags')
      .update({ status: 'cancelled' })
      .eq('bus_id', busId)
      .eq('status', 'waiting');
    
    if (cleanupError) {
      console.error('Error cleaning up waiting flags:', cleanupError);
    }
    
    // Broadcast bus_ended event via Supabase Realtime channel (route-based)
    const channel = supabase.channel(`route_${routeId}`);
    const broadcastResult = await channel.send({
      type: "broadcast",
      event: "bus_ended",
      payload: { 
        busId,
        routeId,
        ts: timestamp 
      }
    });
    
    console.log('Broadcast result:', broadcastResult);
    
    // Send FCM notification to all students assigned to this route
    try {
      const studentsSnapshot = await db
        .collection('students')
        .where('routeId', '==', routeId)
        .get();
      
      const studentTokens: string[] = [];
      
      for (const doc of studentsSnapshot.docs) {
        // Get FCM tokens for this student
        const tokensSnapshot = await db
          .collection('fcm_tokens')
          .where('userUid', '==', doc.id)
          .get();
        
        tokensSnapshot.docs.forEach((tokenDoc) => {
          studentTokens.push(tokenDoc.data().deviceToken);
        });
      }
      
      // Send FCM notification
      if (studentTokens.length > 0) {
        const message = {
          notification: {
            title: 'Journey Ended',
            body: `Bus ${busId} has finished its journey on route ${routeId}`
          },
          tokens: studentTokens
        };
        
        await admin.messaging().sendEachForMulticast(message);
      }
    } catch (fcmError) {
      console.error('Error sending FCM notifications:', fcmError);
    }
    
    res.json({ 
      success: true,
      message: 'Journey ended successfully',
      routeId,
      ts: timestamp
    });
  } catch (error: any) {
    console.error('Error ending journey:', error);
    res.status(500).json({ error: error.message || 'Failed to end journey' });
  }
}