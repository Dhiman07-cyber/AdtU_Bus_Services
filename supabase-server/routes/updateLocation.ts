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

// Anti-spoof configuration
const MAX_SPEED_KMH = 160; // Maximum allowed speed in km/h
const MIN_UPDATE_INTERVAL = 2000; // Minimum interval between updates in milliseconds

// Simple in-memory store for last locations (in production, use Redis or similar)
const lastLocations: Record<string, { lat: number; lng: number; timestamp: number }> = {};

// Haversine formula to calculate distance between two points
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export async function updateLocation(req: AuthenticatedRequest, res: Response) {
  try {
    const { busId, lat, lng, speed, heading, accuracy } = req.body;
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
    
    // Get route ID from bus document in Firestore
    const busDoc = await db.collection('buses').doc(busId).get();
    const busData = busDoc.data();
    const routeId = busData?.routeId;
    
    if (!routeId) {
      return res.status(400).json({ error: 'Bus is not assigned to a route' });
    }
    
    // Throttle: enforce minimum interval between updates
    const now = Date.now();
    if (lastLocations[busId] && (now - lastLocations[busId].timestamp) < MIN_UPDATE_INTERVAL) {
      console.log(`Dropped location update for bus ${busId} - too frequent`);
      return res.status(429).json({ error: 'Location updates too frequent' });
    }
    
    // Anti-spoof check: validate speed
    if (lastLocations[busId]) {
      const last = lastLocations[busId];
      const distanceKm = haversineDistance(last.lat, last.lng, lat, lng);
      const deltaTimeSec = (now - last.timestamp) / 1000;
      
      // Calculate implied speed in km/h
      const impliedSpeed = (distanceKm / deltaTimeSec) * 3600;
      
      if (impliedSpeed > MAX_SPEED_KMH) {
        console.warn(`Suspicious location update for bus ${busId}: ${impliedSpeed.toFixed(2)} km/h`);
        // In production, you might want to reject this update or flag it for review
        // For now, we'll log it but still process the update
      }
    }
    
    // Update last location
    lastLocations[busId] = { lat, lng, timestamp: now };
    
    const timestamp = new Date().toISOString();
    
    // Upsert into bus_locations
    const { error: busLocationError } = await supabase
      .from('bus_locations')
      .upsert({
        bus_id: busId,
        driver_uid: driverUid,
        lat: lat,
        lng: lng,
        speed: speed || 0,
        heading: heading || 0,
        updated_at: timestamp
      });
    
    if (busLocationError) {
      console.error('Error updating bus location:', busLocationError);
      return res.status(500).json({ error: 'Failed to update bus location' });
    }
    
    // Insert into driver_location_updates for history
    const { error: locationHistoryError } = await supabase
      .from('driver_location_updates')
      .insert({
        driver_uid: driverUid,
        bus_id: busId,
        lat: lat,
        lng: lng,
        speed: speed || 0,
        heading: heading || 0,
        accuracy: accuracy || 0,
        timestamp: timestamp
      });
    
    if (locationHistoryError) {
      console.error('Error inserting location history:', locationHistoryError);
    }
    
    // Broadcast location update via Supabase Realtime channel (route-based)
    const channel = supabase.channel(`route_${routeId}`);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Successfully subscribed to route_${routeId} channel for broadcasting`);
        
        // Send the broadcast after successful subscription
        channel.send({
          type: "broadcast",
          event: "bus_location_update",
          payload: { 
            busId, 
            driverUid,
            lat, 
            lng, 
            speed: speed || 0, 
            heading: heading || 0, 
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
    
    res.json({ success: true, message: 'Location updated successfully' });
  } catch (error: any) {
    console.error('Error updating location:', error);
    res.status(500).json({ error: error.message || 'Failed to update location' });
  }
}