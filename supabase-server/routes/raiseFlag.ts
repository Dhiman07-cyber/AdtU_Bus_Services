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

// Geofence configuration
const MAX_DISTANCE_TO_STOP = 500; // Maximum distance in meters from stop

// Haversine formula to calculate distance between two points
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Function to get route by ID from local JSON data
function getOfflineRouteById(routeId: string): any | null {
  try {
    // Import the JSON data directly
    const busRoutesData = require('../../src/data/BusRoutes.json');
    
    const route = busRoutesData.find((r: any) => `route-${r.id}` === routeId);
    if (route) {
      return {
        id: route.id,
        routeId: `route-${route.id}`,
        routeName: route.route,
        busNumber: route.busNumber,
        stops: route.stops.map((stop: string, index: number) => ({
          name: stop,
          lat: 26.1433 + (index * 0.001),
          lng: 91.6172 + (index * 0.001)
        })),
        status: 'active',
        createdAt: new Date().toISOString()
      };
    }
    return null;
  } catch (error) {
    console.error('Error loading offline route:', error);
    return null;
  }
}

export async function raiseWaitingFlag(req: AuthenticatedRequest, res: Response) {
  try {
    const { busId, routeId, stopName, stopId, lat, lng } = req.body;
    const studentUid = req.user?.uid;
    
    console.log('Received waiting flag request:', { busId, routeId, stopName, stopId, lat, lng, studentUid });
    
    if (!studentUid) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    
    // Validate required fields
    if (!busId || busId === '') {
      return res.status(400).json({ success: false, error: 'Bus ID is required' });
    }
    
    if (!routeId || routeId === '') {
      return res.status(400).json({ success: false, error: 'Route ID is required' });
    }
    
    if (!stopName || stopName === '') {
      return res.status(400).json({ success: false, error: 'Stop name is required' });
    }
    
    // Validate student exists and is assigned to this bus
    const studentDoc = await db.collection('students').doc(studentUid).get();
    if (!studentDoc.exists) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    
    const studentData = studentDoc.data();
    console.log('Student data:', studentData);
    
    if (studentData?.busId !== busId) {
      return res.status(403).json({ success: false, error: 'Student is not assigned to this bus' });
    }
    
    // Optional geofence: compute distance from student's current GPS to stop coordinates
    if (lat && lng && stopId) {
      // Get stop coordinates from route in Firestore
      const routeDoc = await db.collection('routes').doc(routeId).get();
      if (routeDoc.exists) {
        const routeData: any = routeDoc.data();
        const stop = routeData?.stops?.find((s: any) => s.stopId === stopId);
        
        if (stop) {
          const distance = haversineDistance(lat, lng, stop.lat, stop.lng);
          
          if (distance > MAX_DISTANCE_TO_STOP) {
            // Log warning but allow the flag to be raised (student might confirm)
            console.warn(`Student ${studentUid} is ${distance.toFixed(2)}m from stop ${stopId}`);
          }
        }
      }
    }
    
    // Create waiting flag in Supabase
    const newFlagId = require('crypto').randomUUID();
    const timestamp = new Date().toISOString();
    
    console.log('Creating waiting flag in Supabase with data:', {
      id: newFlagId,
      student_uid: studentUid,
      bus_id: busId,
      route_id: routeId,
      stop_name: stopName,
      stop_id: stopId,
      lat: lat || null,
      lng: lng || null,
      status: 'waiting',
      created_at: timestamp
    });
    
    const { error } = await supabase
      .from('waiting_flags')
      .insert({
        id: newFlagId,
        student_uid: studentUid,
        bus_id: busId,
        route_id: routeId,
        stop_name: stopName,
        stop_id: stopId || null,
        lat: lat || null,
        lng: lng || null,
        status: 'waiting',
        created_at: timestamp
      });
    
    if (error) {
      console.error('Error creating waiting flag in Supabase:', error);
      return res.status(500).json({ success: false, error: 'Failed to create waiting flag: ' + error.message });
    }
    
    // Broadcast flag update via Supabase Realtime channel (route-based)
    const channel = supabase.channel(`route_${routeId}`);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Successfully subscribed to route_${routeId} channel for broadcasting`);
        
        // Send the broadcast after successful subscription
        channel.send({
          type: "broadcast",
          event: "waiting_flag_raised",
          payload: {
            flagId: newFlagId,
            studentUid,
            busId,
            routeId,
            stopId,
            stopName,
            lat: lat || null,
            lng: lng || null,
            ts: timestamp
          }
        }).then((result) => {
          console.log('Broadcast result:', result);
        }).catch((error) => {
          console.error('Error sending broadcast:', error);
        });
      } else {
        console.log(`Channel subscription status for route_${routeId}:`, status);
      }
    });
    
    // Send FCM notification to driver
    try {
      // Get driver for this route
      const busDoc = await db.collection('buses').doc(busId).get();
      const busData = busDoc.data();
      const driverUid = busData?.driverUID;
      
      if (driverUid) {
        // Get FCM tokens for the driver
        const tokensSnapshot = await db
          .collection('fcm_tokens')
          .where('userUid', '==', driverUid)
          .get();
        
        const driverTokens: string[] = [];
        tokensSnapshot.docs.forEach((tokenDoc) => {
          driverTokens.push(tokenDoc.data().deviceToken);
        });
        
        // Send FCM notification
        if (driverTokens.length > 0) {
          const message = {
            notification: {
              title: 'Student Waiting',
              body: `Student is waiting at ${stopName} stop`
            },
            tokens: driverTokens
          };
          
          await admin.messaging().sendEachForMulticast(message);
        }
      }
    } catch (fcmError) {
      console.error('Error sending FCM notification to driver:', fcmError);
    }
    
    res.json({ 
      success: true, 
      message: 'Waiting flag created successfully',
      flagId: newFlagId,
      payload: {
        flagId: newFlagId,
        studentUid,
        busId,
        routeId,
        stopId,
        stopName,
        lat: lat || null,
        lng: lng || null,
        ts: timestamp
      }
    });
  } catch (error: any) {
    console.error('Error creating waiting flag:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to create waiting flag' });
  }
}