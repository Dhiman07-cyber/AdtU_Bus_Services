import { createClient } from '@supabase/supabase-js';
import { RealtimeChannel } from '@supabase/supabase-js';

// Environment configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const isProduction = process.env.NODE_ENV === 'production';

// Initialize Supabase clients
let supabaseAnon: any = null;
let supabaseServiceClient: any = null;

try {
  if (supabaseUrl && supabaseAnonKey) {
    supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);
  }
} catch (error) {
  console.error('❌ Supabase client init failed:', error);
}

// Server-side service client
try {
  if (typeof window === 'undefined' && supabaseUrl && supabaseServiceRoleKey) {
    supabaseServiceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false }
    });
  } else if (supabaseUrl && supabaseAnonKey) {
    supabaseServiceClient = supabaseAnon;
  }
} catch (error) {
  console.error('❌ Supabase service client init failed:', error);
  if (supabaseAnon) supabaseServiceClient = supabaseAnon;
}


// Type definitions
interface BusLocation {
  bus_id: string;
  driver_uid: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  updated_at: string;
}

interface WaitingFlag {
  id: string;
  student_uid: string;
  bus_id: string;
  route_id: string;
  stop_name: string;
  status: 'waiting' | 'boarded' | 'cancelled' | 'missed';
  created_at: string;
}

interface DriverStatus {
  driver_uid: string;
  bus_id: string;
  status: 'idle' | 'online' | 'offline' | 'completed';
  last_updated: string;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  audience: any;
  created_by: string;
  status: 'draft' | 'sent';
  created_at: string;
}

// Channel management
const channels: Map<string, RealtimeChannel> = new Map();

export class SupabaseService {
  private supabase: any;
  private supabaseService: any;

  constructor() {
    this.supabase = supabaseAnon;
    this.supabaseService = supabaseServiceClient;
  }

  // Public methods to check initialization status
  public isAnonClientInitialized(): boolean {
    return !!this.supabase;
  }

  public isServiceClientInitialized(): boolean {
    return !!this.supabaseService;
  }

  // Data Query Methods
  async getBusLocations(busId?: string): Promise<BusLocation[]> {
    try {
      // Use anon client for frontend, service client for backend
      const client = typeof window === 'undefined' && this.supabaseService ? this.supabaseService : this.supabase;

      if (!client) {
        console.error('No Supabase client available');
        return [];
      }

      let query = client.from('bus_locations').select('*');

      if (busId) {
        query = query.eq('bus_id', busId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching bus locations:', error);
        return [];
      }

      return data as BusLocation[];
    } catch (error) {
      console.error('Error fetching bus locations:', error);
      return [];
    }
  }

  async getWaitingFlags(busId?: string, status?: string): Promise<WaitingFlag[]> {
    try {
      // Use anon client for frontend, service client for backend
      const client = typeof window === 'undefined' && this.supabaseService ? this.supabaseService : this.supabase;

      if (!client) {
        console.error('No Supabase client available');
        return [];
      }

      let query = client.from('waiting_flags').select('*');

      if (busId) {
        query = query.eq('bus_id', busId);
      }

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching waiting flags:', error);
        return [];
      }

      return data as WaitingFlag[];
    } catch (error) {
      console.error('Error fetching waiting flags:', error);
      return [];
    }
  }

  async getWaitingFlagByStudentUid(studentUid: string): Promise<WaitingFlag | null> {
    try {
      // Use anon client for frontend, service client for backend
      const client = typeof window === 'undefined' && this.supabaseService ? this.supabaseService : this.supabase;

      if (!client) {
        console.error('No Supabase client available');
        return null;
      }

      const { data, error } = await client
        .from('waiting_flags')
        .select('*')
        .eq('student_uid', studentUid)
        .eq('status', 'waiting')
        .maybeSingle();

      if (error) {
        console.error('Error fetching waiting flag by student UID:', error);
        return null;
      }

      return data as WaitingFlag;
    } catch (error) {
      console.error('Error fetching waiting flag by student UID:', error);
      return null;
    }
  }

  async getDriverStatus(driverUid?: string): Promise<DriverStatus[]> {
    try {
      // Use anon client for frontend, service client for backend
      const client = typeof window === 'undefined' && this.supabaseService ? this.supabaseService : this.supabase;

      if (!client) {
        console.error('No Supabase client available');
        return [];
      }

      let query = client.from('driver_status').select('*');

      if (driverUid) {
        query = query.eq('driver_uid', driverUid);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching driver status:', error);
        return [];
      }

      return data as DriverStatus[];
    } catch (error) {
      console.error('Error fetching driver status:', error);
      return [];
    }
  }

  async getNotifications(limit?: number): Promise<Notification[]> {
    try {
      // Use anon client for frontend, service client for backend
      const client = typeof window === 'undefined' && this.supabaseService ? this.supabaseService : this.supabase;

      if (!client) {
        console.error('No Supabase client available');
        return [];
      }

      let query = client.from('notifications').select('*').order('created_at', { ascending: false });

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching notifications:', error);
        return [];
      }

      return data as Notification[];
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return [];
    }
  }

  async createWaitingFlag(
    studentUid: string,
    busId: string,
    routeId: string,
    stopName: string
  ): Promise<string | null> {
    try {
      // For write operations, we need the service client on server-side
      const client = typeof window === 'undefined' && this.supabaseService ? this.supabaseService : this.supabase;

      if (!client) {
        console.error('No Supabase client available');
        return null;
      }

      const newFlag = {
        student_uid: studentUid,
        bus_id: busId,
        route_id: routeId,
        stop_name: stopName,
        status: 'waiting'
      };

      // Try to insert the waiting flag
      const { data, error } = await client
        .from('waiting_flags')
        .insert(newFlag)
        .select()
        .single();

      if (error) {
        console.error('Error creating waiting flag:', error);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });

        // Log the full error object for better debugging
        console.error('Full error object:', JSON.stringify(error, null, 2));

        // If it's an RLS error, we might need to use the service client
        if (error.message && error.message.includes('row-level security')) {
          console.log('RLS error detected, trying with service client if available...');
          if (this.supabaseService && typeof window === 'undefined') {
            console.log('Retrying with service client...');
            const { data: retryData, error: retryError } = await this.supabaseService
              .from('waiting_flags')
              .insert(newFlag)
              .select()
              .single();

            if (retryError) {
              console.error('Retry with service client also failed:', retryError);
              console.error('Retry error details:', {
                message: retryError.message,
                code: retryError.code,
                details: retryError.details,
                hint: retryError.hint
              });
              return null;
            }

            return retryData.id;
          }
        }

        return null;
      }

      // Broadcast the flag update via Supabase Realtime channel
      const channel = client.channel(`route_${routeId}`);
      const broadcastResult = await channel.send({
        type: "broadcast",
        event: "waiting_flag_raised",
        payload: {
          flagId: data.id,
          studentUid,
          busId,
          routeId,
          stopName,
          lat: null,
          lng: null,
          ts: data.created_at
        }
      });

      console.log('Broadcast result:', broadcastResult);

      return data.id;
    } catch (error: any) {
      console.error('Error creating waiting flag:', error);
      console.error('Error type:', typeof error);
      if (error.message) console.error('Error message:', error.message);
      // Log the full error object for better debugging
      console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      return null;
    }
  }

  async removeWaitingFlag(flagId: string): Promise<boolean> {
    try {
      // For write operations, we need the service client on server-side
      const client = typeof window === 'undefined' && this.supabaseService ? this.supabaseService : this.supabase;

      if (!client) {
        console.error('No Supabase client available');
        return false;
      }

      const { error } = await client
        .from('waiting_flags')
        .update({ status: 'cancelled' })
        .eq('id', flagId);

      if (error) {
        console.error('Error removing waiting flag:', error);
        return false;
      }

      // Get the flag data to broadcast the update
      const { data: flagData, error: fetchError } = await client
        .from('waiting_flags')
        .select('bus_id, route_id, student_uid')
        .eq('id', flagId)
        .single();

      if (!fetchError && flagData) {
        // Broadcast the flag update via Supabase Realtime channel
        const channel = client.channel(`route_${flagData.route_id}`);
        const broadcastResult = await channel.send({
          type: "broadcast",
          event: "waiting_flag_removed",
          payload: {
            flagId,
            studentUid: flagData.student_uid,
            busId: flagData.bus_id,
            status: 'cancelled'
          }
        });

        console.log('Broadcast result:', broadcastResult);
      }

      return true;
    } catch (error) {
      console.error('Error removing waiting flag:', error);
      return false;
    }
  }

  async removeWaitingFlagByStudentUid(studentUid: string): Promise<boolean> {
    try {
      // For write operations, we need the service client on server-side
      const client = typeof window === 'undefined' && this.supabaseService ? this.supabaseService : this.supabase;

      if (!client) {
        console.error('No Supabase client available');
        return false;
      }

      const { error } = await client
        .from('waiting_flags')
        .update({ status: 'cancelled' })
        .eq('student_uid', studentUid)
        .eq('status', 'waiting');

      if (error) {
        console.error('Error removing waiting flag by student UID:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error removing waiting flag by student UID:', error);
      return false;
    }
  }

  async startJourney(busId: string, driverUid: string): Promise<boolean> {
    try {
      // For write operations, we need the service client on server-side
      const client = typeof window === 'undefined' && this.supabaseService ? this.supabaseService : this.supabase;

      if (!client) {
        console.error('No Supabase client available');
        return false;
      }

      // Update bus_locations table
      const { error: busError } = await client
        .from('bus_locations')
        .upsert({
          bus_id: busId,
          driver_uid: driverUid,
          lat: 0,
          lng: 0,
          speed: 0,
          heading: 0,
          updated_at: new Date().toISOString()
        });

      if (busError) {
        console.error('Error updating bus location:', busError);
        return false;
      }

      // Update driver_status table
      const { error: driverError } = await client
        .from('driver_status')
        .upsert({
          driver_uid: driverUid,
          bus_id: busId,
          status: 'online',
          last_updated: new Date().toISOString()
        });

      if (driverError) {
        console.error('Error updating driver status:', driverError);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error starting journey:', error);
      return false;
    }
  }

  async endJourney(busId: string, driverUid: string): Promise<boolean> {
    try {
      // For write operations, we need the service client on server-side
      const client = typeof window === 'undefined' && this.supabaseService ? this.supabaseService : this.supabase;

      if (!client) {
        console.error('No Supabase client available');
        return false;
      }

      // Update driver_status table
      const { error: driverError } = await client
        .from('driver_status')
        .update({
          status: 'idle',
          last_updated: new Date().toISOString()
        })
        .eq('driver_uid', driverUid);

      if (driverError) {
        console.error('Error updating driver status:', driverError);
        return false;
      }

      // Optionally remove bus location or mark as inactive
      const { error: busError } = await client
        .from('bus_locations')
        .update({
          updated_at: new Date().toISOString()
        })
        .eq('bus_id', busId);

      if (busError) {
        console.error('Error updating bus location:', busError);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error ending journey:', error);
      return false;
    }
  }

  async sendLocationUpdate(
    busId: string,
    driverUid: string,
    lat: number,
    lng: number,
    speed: number,
    heading: number
  ): Promise<boolean> {
    try {
      // For write operations, we need the service client on server-side
      const client = typeof window === 'undefined' && this.supabaseService ? this.supabaseService : this.supabase;

      if (!client) {
        console.error('No Supabase client available for location update');
        return false;
      }

      // Get route ID from bus document to use for channel
      let routeId = null;
      try {
        const busDoc = await client.from('buses').select('route_id').eq('bus_id', busId).single();
        if (busDoc.data) {
          routeId = busDoc.data.route_id;
        }
      } catch (err) {
        console.warn('Could not fetch route ID for bus:', busId, err);
      }

      // Update bus_locations table
      const { data, error } = await client
        .from('bus_locations')
        .upsert({
          bus_id: busId,
          driver_uid: driverUid,
          lat: lat,
          lng: lng,
          speed: speed,
          heading: heading,
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error sending location update to Supabase:', error);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        });
        // Also log the full error object to see what's in it
        console.error('Full error object:', JSON.stringify(error, null, 2));

        // Check if it's an RLS error and try with service client
        if (error.message && error.message.includes('row-level security') &&
          this.supabaseService && typeof window === 'undefined') {
          console.log('RLS error detected, retrying with service client...');
          const { data: retryData, error: retryError } = await this.supabaseService
            .from('bus_locations')
            .upsert({
              bus_id: busId,
              driver_uid: driverUid,
              lat: lat,
              lng: lng,
              speed: speed,
              heading: heading,
              updated_at: new Date().toISOString()
            });

          if (retryError) {
            console.error('Retry with service client also failed:', retryError);
            return false;
          }

          console.log('Location update successful on retry:', retryData);
          return true;
        }

        return false;
      }

      console.log('Location update successful:', data);

      // Broadcast the update to all subscribers using route-based channel
      if (routeId) {
        const channel = client.channel(`route_${routeId}`);
        const broadcastResult = await channel.send({
          type: 'broadcast',
          event: 'bus_location_update',
          payload: {
            busId: busId,
            driverUid: driverUid,
            lat: lat,
            lng: lng,
            speed: speed,
            heading: heading,
            ts: new Date().toISOString()
          }
        });

        console.log('Broadcast result:', broadcastResult);
      }

      return true;
    } catch (error: any) {
      console.error('Error sending location update:', error);
      console.error('Error type:', typeof error);
      console.error('Error keys:', Object.keys(error));
      if (error.message) console.error('Error message:', error.message);
      // Log the full error object to help with debugging
      console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      return false;
    }
  }
}

// Export singleton instance
export const supabaseService = new SupabaseService();