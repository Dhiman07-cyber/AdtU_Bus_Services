"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase-client';

// Dynamic imports to avoid SSR issues
const AssamRestrictedMap = dynamic(() => import('@/components/AssamRestrictedMap').then(async (mod) => {
  await import('leaflet');
  return mod;
}), { ssr: false });

// Import MapIcons separately
let MapIcons: any = null;
const getMapIcons = async () => {
  if (!MapIcons) {
    const { MapIcons: importedMapIcons } = await import('@/components/AssamRestrictedMap');
    MapIcons = importedMapIcons();
  }
  return MapIcons;
};
const Marker = dynamic(() => import('react-leaflet').then(async (mod) => {
  await import('leaflet');
  return { default: mod.Marker };
}), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(async (mod) => {
  await import('leaflet');
  return { default: mod.Popup };
}), { ssr: false });
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Bus, Clock, Navigation, AlertCircle } from 'lucide-react';

// Using shared Supabase client from @/lib/supabase-client

interface BusLocation {
  bus_id: string;
  route_id: string;
  driver_uid: string;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
  updated_at: string;
  timestamp: number;
}

interface WaitingFlag {
  id: string;
  student_uid: string;
  student_name: string;
  bus_id: string;
  lat: number;
  lng: number;
  accuracy?: number;
  message: string;
  status: string;
  created_at: string;
  timestamp: number;
}

interface DynamicStudentMapProps {
  busId: string;
  routeId: string;
  journeyActive?: boolean;
  studentLocation?: { accuracy: number };
  onWaitingFlagCreate?: (flagId: string) => void;
  onWaitingFlagRemove?: (flagId: string) => void;
}

export default function DynamicStudentMap({ 
  busId, 
  routeId,
  journeyActive = false,
  studentLocation,
  onWaitingFlagCreate,
  onWaitingFlagRemove 
}: DynamicStudentMapProps) {
  const { currentUser } = useAuth();
  const [busLocation, setBusLocation] = useState<BusLocation | null>(null);
  const [waitingFlags, setWaitingFlags] = useState<WaitingFlag[]>([]);
  const [isWaiting, setIsWaiting] = useState(false);
  const [currentFlagId, setCurrentFlagId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapIcons, setMapIcons] = useState<any>(null);

  // Load MapIcons on component mount
  useEffect(() => {
    const loadMapIcons = async () => {
      try {
        const icons = await getMapIcons();
        setMapIcons(icons);
      } catch (error) {
        console.error('Failed to load map icons:', error);
      }
    };
    loadMapIcons();
  }, []);

  // Subscribe to real-time bus location updates
  useEffect(() => {
    if (!busId || !routeId) {
      setBusLocation(null);
      setLoading(false);
      return;
    }

    console.log('🔄 Subscribing to bus location updates for bus:', busId);

    const channel = supabase
      .channel(`bus_location_broadcast_${busId}`)
      .on('broadcast', { event: 'location_update' }, (payload) => {
        console.log('📍 Received bus location update:', payload);
        setBusLocation(payload.payload);
      })
      .on('broadcast', { event: 'trip_ended' }, (payload) => {
        console.log('🏁 Trip ended, clearing bus location:', payload);
        setBusLocation(null);
      })
      .subscribe((status) => {
        console.log('📡 Bus location channel status:', status);
        if (status === 'SUBSCRIBED') {
          setLoading(false);
        }
      });

    return () => {
      console.log('🔌 Unsubscribing from bus location updates');
      supabase.removeChannel(channel);
    };
  }, [busId, routeId]);

  // Subscribe to real-time waiting flags - always subscribe to see flags
  useEffect(() => {
    if (!busId) return;

    console.log('🔄 Subscribing to waiting flags for bus:', busId);

    const channel = supabase
      .channel(`waiting_flags_${busId}`)
      .on('broadcast', { event: 'waiting_flag_created' }, (payload) => {
        console.log('🚩 Received waiting flag created:', payload);
        setWaitingFlags(prev => [...prev, payload.payload]);
        if (payload.payload.student_uid === currentUser?.uid) {
          setIsWaiting(true);
          setCurrentFlagId(payload.payload.id);
          onWaitingFlagCreate?.(payload.payload.id);
        }
      })
      .on('broadcast', { event: 'waiting_flag_removed' }, (payload) => {
        console.log('🚩 Received waiting flag removed:', payload);
        setWaitingFlags(prev => prev.filter(flag => flag.id !== payload.payload.flagId));
        if (payload.payload.studentUid === currentUser?.uid) {
          setIsWaiting(false);
          setCurrentFlagId(null);
          onWaitingFlagRemove?.(payload.payload.flagId);
        }
      })
      .on('broadcast', { event: 'trip_ended' }, (payload) => {
        console.log('🏁 Trip ended, clearing all waiting flags:', payload);
        setWaitingFlags([]);
        setIsWaiting(false);
        setCurrentFlagId(null);
      })
      .subscribe((status) => {
        console.log('📡 Waiting flags channel status:', status);
      });

    return () => {
      console.log('🔌 Unsubscribing from waiting flags');
      supabase.removeChannel(channel);
    };
  }, [busId, currentUser?.uid, onWaitingFlagCreate, onWaitingFlagRemove]);

  // Get initial data
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Get current bus location (optional - table might not exist)
        try {
          const { data: busData, error: busError } = await supabase
            .from('bus_locations')
            .select('*')
            .eq('bus_id', busId)
            .maybeSingle(); // Use maybeSingle() instead of single() to avoid 406 errors

          if (busError && busError.code !== 'PGRST116') {
            console.warn('⚠️ Bus location table might not exist:', busError);
          } else if (busData) {
            setBusLocation(busData);
          }
        } catch (error) {
          console.warn('⚠️ Bus location query failed (table might not exist):', error);
        }

        // Get current waiting flags (optional - table might not exist)
        try {
          const { data: flagsData, error: flagsError } = await supabase
            .from('waiting_flags')
            .select('*')
            .eq('bus_id', busId)
            .eq('status', 'waiting');

          if (flagsError) {
            console.warn('⚠️ Waiting flags table might not exist:', flagsError);
          } else if (flagsData) {
            setWaitingFlags(flagsData);
            // Check if current student has a waiting flag
            const studentFlag = flagsData.find(flag => flag.student_uid === currentUser?.uid);
            if (studentFlag) {
              setIsWaiting(true);
              setCurrentFlagId(studentFlag.id);
            }
          }
        } catch (error) {
          console.warn('⚠️ Waiting flags query failed (table might not exist):', error);
        }

        setLoading(false);
      } catch (error) {
        console.error('Error fetching initial data:', error);
        setError('Failed to load map data');
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [busId, currentUser?.uid]);

  const handleWaitingFlag = async () => {
    if (!currentUser || !studentLocation) {
      setError('Location not available');
      return;
    }

    try {
      if (isWaiting && currentFlagId) {
        // Remove waiting flag
        const token = await currentUser.getIdToken();
        const response = await fetch('/api/student/waiting-flag', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            idToken: token,
            flagId: currentFlagId,
            busId: busId
          })
        });

        if (response.ok) {
          setIsWaiting(false);
          setCurrentFlagId(null);
        } else {
          const error = await response.json();
          setError(error.error || 'Failed to remove waiting flag');
        }
      } else {
        // Create waiting flag
        const token = await currentUser.getIdToken();
        const response = await fetch('/api/student/waiting-flag', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            idToken: token,
            busId: busId,
            accuracy: studentLocation.accuracy,
            message: 'Waiting for bus',
            timestamp: Date.now()
          })
        });

        if (response.ok) {
          const result = await response.json();
          setIsWaiting(true);
          setCurrentFlagId(result.flagId);
        } else {
          const error = await response.json();
          setError(error.error || 'Failed to create waiting flag');
        }
      }
    } catch (error) {
      console.error('Error handling waiting flag:', error);
      setError('Failed to update waiting status');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p>Loading live map data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-96">
          <div className="text-center text-red-600">
            <p>{error}</p>
            <Button onClick={() => window.location.reload()} className="mt-4">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Map */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Live Bus Tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!journeyActive && (
            <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                <div>
                  <p className="font-medium">Journey Not Started</p>
                  <p className="text-sm">The map is ready. Bus location will appear when the driver starts the trip.</p>
                </div>
              </div>
            </div>
          )}
          <AssamRestrictedMap key={`student-map-${busId}`} restrictToGuwahati={true} style={{ height: '500px' }}>
            {/* Bus Location Marker - Only show when journey is active */}
            {journeyActive && busLocation && mapIcons && (
              <Marker
                position={[0, 0]}
                icon={mapIcons.bus}
              >
                <Popup>
                  <div className="text-sm">
                    <div className="font-bold">🚌 Bus {busId}</div>
                    <div>Speed: {busLocation.speed?.toFixed(1) || 0} km/h</div>
                    <div className="text-xs text-gray-600">
                      Updated: {new Date(busLocation.updated_at).toLocaleTimeString()}
                    </div>
                    {busLocation.accuracy && (
                      <div className="text-xs text-gray-500">
                        Accuracy: ±{busLocation.accuracy.toFixed(0)}m
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Student's Own Location */}
            {studentLocation && mapIcons && (
              <Marker
                position={[0, 0]}
                icon={mapIcons.student}
              >
                <Popup>
                  <div className="text-sm">
                    <div className="font-bold">📍 Your Location</div>
                    <div className="text-xs text-gray-600">Accuracy: {studentLocation.accuracy}m</div>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Other Students' Waiting Flags - Only show when journey is active */}
            {journeyActive && mapIcons && waitingFlags.map((flag) => (
              <Marker
                key={flag.id}
                position={[flag.lat, flag.lng]}
                icon={flag.student_uid === currentUser?.uid ? mapIcons.waitingFlag : mapIcons.waitingFlagOther}
              >
                <Popup>
                  <div className="text-sm">
                    <div className="font-bold">
                      {flag.student_uid === currentUser?.uid ? '🚩 You are waiting' : '🚩 Student waiting'}
                    </div>
                    <div>{flag.student_name}</div>
                    <div className="text-xs text-gray-600">{flag.message}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(flag.created_at).toLocaleTimeString()}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </AssamRestrictedMap>
        </CardContent>
      </Card>

      {/* Status and Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bus Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bus className="h-5 w-5" />
              Bus Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {busLocation ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span>Status:</span>
                  <Badge variant="default" className="bg-green-500">
                    <div className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse"></div>
                    Live
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Speed:</span>
                  <span className="font-medium">{busLocation.speed?.toFixed(1) || 0} km/h</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Last Update:</span>
                  <span className="text-sm text-gray-600">
                    {new Date(busLocation.updated_at).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center text-gray-500">
                <Clock className="h-8 w-8 mx-auto mb-2" />
                <p>Bus location not available</p>
                <p className="text-sm">Driver may not have started the trip yet</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Waiting Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Navigation className="h-5 w-5" />
              Your Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span>Waiting Status:</span>
                <Badge variant={isWaiting ? "default" : "secondary"}>
                  {isWaiting ? "Waiting" : "Not Waiting"}
                </Badge>
              </div>
              
              <Button
                onClick={handleWaitingFlag}
                variant={isWaiting ? "destructive" : "default"}
                className="w-full"
                disabled={!studentLocation}
              >
                {isWaiting ? "Stop Waiting" : "I'm Waiting"}
              </Button>
              
              {!studentLocation && (
                <p className="text-sm text-gray-500 text-center">
                  Enable location to use waiting feature
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
