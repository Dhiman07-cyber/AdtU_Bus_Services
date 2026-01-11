"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Bus, 
  MapPin,
  User,
  Users,
  Bell,
  AlertCircle
} from "lucide-react";
import { supabase } from '@/lib/supabase-client';

interface DriverStatus {
  driver_uid: string;
  bus_id: string;
  status: string;
  last_updated: string;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  audience: string;
  created_by: string;
  status: string;
  created_at: string;
  route_id: string | null;
}

export default function ModeratorDashboard() {
  const { currentUser, userData } = useAuth();
  const router = useRouter();
  const [driverStatuses, setDriverStatuses] = useState<DriverStatus[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Redirect if user is not a moderator
  useEffect(() => {
    if (userData && userData.role !== "moderator") {
      router.push(`/${userData.role}`);
    }
  }, [userData, router]);

  // Subscribe to global updates
  useEffect(() => {
    if (!supabase) return;

    // Subscribe to driver status updates
    const driverStatusChannel = supabase.channel('global_updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'driver_status' },
        (payload: any) => {
          console.log('Driver status insert:', payload);
          setDriverStatuses(prev => [...prev, payload.new]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'driver_status' },
        (payload: any) => {
          console.log('Driver status update:', payload);
          setDriverStatuses(prev => 
            prev.map(status => 
              status.driver_uid === payload.new.driver_uid ? payload.new : status
            )
          );
        }
      )
      .subscribe();

    // Subscribe to notifications
    const notificationChannel = supabase.channel('global_notifications')
      .on(
        'broadcast',
        { event: 'notification_update' },
        (payload: any) => {
          console.log('Global notification:', payload);
          setNotifications(prev => [payload.payload, ...prev.slice(0, 9)]); // Keep only last 10
        }
      )
      .subscribe();

    // Fetch initial data
    const fetchData = async () => {
      try {
        // Fetch driver statuses
        const { data: statusData, error: statusError } = await supabase
          .from('driver_status')
          .select('*');
        
        if (statusError) {
          console.error('Error fetching driver statuses:', statusError);
        } else {
          setDriverStatuses(statusData || []);
        }

        // Fetch recent notifications
        const { data: notificationData, error: notificationError } = await supabase
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);
        
        if (notificationError) {
          console.error('Error fetching notifications:', notificationError);
        } else {
          setNotifications(notificationData || []);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Cleanup
    return () => {
      if (supabase) {
        supabase.removeChannel(driverStatusChannel);
        supabase.removeChannel(notificationChannel);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="mt-12 space-y-6">
      <div>
        <h1 className="text-3xl font-bold dark:text-white">Moderator Dashboard</h1>
        <p className="text-gray-500 dark:text-gray-400">
          Monitor all driver activities and system notifications
        </p>
      </div>

      {/* Driver Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Driver Status</CardTitle>
          <CardDescription>
            Real-time status of all drivers
          </CardDescription>
        </CardHeader>
        <CardContent>
          {driverStatuses.length === 0 ? (
            <p className="text-muted-foreground">No driver statuses available</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {driverStatuses.map((status) => (
                <div 
                  key={status.driver_uid} 
                  className="border rounded-lg p-4 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <div className="bg-blue-100 p-2 rounded-full">
                      <User className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium">Driver: {status.driver_uid.substring(0, 8)}...</p>
                      <p className="text-sm text-muted-foreground">Bus: {status.bus_id}</p>
                    </div>
                  </div>
                  <Badge 
                    variant={status.status === 'online' ? 'default' : 'secondary'}
                  >
                    {status.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>System Notifications</CardTitle>
          <CardDescription>
            Recent system-wide notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <p className="text-muted-foreground">No notifications available</p>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div 
                  key={notification.id} 
                  className="border rounded-lg p-4 flex items-start space-x-3"
                >
                  <div className="bg-green-100 p-2 rounded-full mt-1">
                    <Bell className="h-5 w-5 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <p className="font-medium">{notification.title}</p>
                      <Badge variant="outline">
                        {notification.type}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {notification.message}
                    </p>
                    <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                      <span>
                        {new Date(notification.created_at).toLocaleString()}
                      </span>
                      {notification.route_id && (
                        <span>Route: {notification.route_id}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Stats */}
      <Card>
        <CardHeader>
          <CardTitle>System Overview</CardTitle>
          <CardDescription>
            Current system statistics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border rounded-lg p-4 flex items-center space-x-3">
              <div className="bg-purple-100 p-2 rounded-full">
                <Bus className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{driverStatuses.length}</p>
                <p className="text-sm text-muted-foreground">Active Drivers</p>
              </div>
            </div>
            
            <div className="border rounded-lg p-4 flex items-center space-x-3">
              <div className="bg-orange-100 p-2 rounded-full">
                <MapPin className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {driverStatuses.filter(s => s.status === 'online').length}
                </p>
                <p className="text-sm text-muted-foreground">Buses En Route</p>
              </div>
            </div>
            
            <div className="border rounded-lg p-4 flex items-center space-x-3">
              <div className="bg-red-100 p-2 rounded-full">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{notifications.length}</p>
                <p className="text-sm text-muted-foreground">Notifications</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
