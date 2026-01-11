"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bus,
  MapPin,
  Navigation,
  Clock,
  User,
  Users,
  Play,
  Square,
  AlertCircle,
  Activity
} from "lucide-react";
import { getStudentsByBusId, getBusById, getRouteById, getDriverById as getDriverByUidNew } from "@/lib/dataService";
// AssamRestrictedMap is dynamically imported below
import dynamic from "next/dynamic";

// Dynamic import for map component to avoid SSR issues
const DynamicAssamRestrictedMap = dynamic(
  () => import("@/components/AssamRestrictedMap").then(async (mod) => {
    // Ensure Leaflet is loaded before returning the component
    await import('leaflet');
    return mod;
  }),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[500px] bg-muted rounded-xl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-muted-foreground">Loading map...</p>
        </div>
      </div>
    )
  }
);

// Import MapIcons for marker icons
let MapIcons: any = null;
// Dynamic imports for react-leaflet components to avoid SSR issues
const Marker = dynamic(() => import("react-leaflet").then(async (mod) => {
  await import('leaflet');
  return { default: mod.Marker };
}), { ssr: false });
const Polyline = dynamic(() => import("react-leaflet").then(async (mod) => {
  await import('leaflet');
  return { default: mod.Polyline };
}), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then(async (mod) => {
  await import('leaflet');
  return { default: mod.Popup };
}), { ssr: false });
import { useGeolocation } from "@/hooks/useGeolocation";
import LocationPermissionModal from "@/components/LocationPermissionModal";
import { GeolocationPosition } from "@/lib/geolocation-service";
import { useBusLocation } from "@/hooks/useBusLocation";
import { useWaitingFlags } from "@/hooks/useWaitingFlags";
import ErrorBoundary from "@/components/error-boundary";
import { db } from "@/lib/firebase";

export default function DriverBusPage() {
  const { currentUser, userData } = useAuth();
  const router = useRouter();
  const [driverData, setDriverData] = useState<any>(null);
  const [busData, setBusData] = useState<any>(null);
  const [routeData, setRouteData] = useState<any>(null);
  const [tripActive, setTripActive] = useState(false);

  // Debug wrapper for setTripActive
  const setTripActiveWithDebug = (value: boolean, reason: string) => {
    console.log(`🔄 setTripActive(${value}) called from: ${reason}`);
    setTripActive(value);
  };
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [tripData, setTripData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [startingTrip, setStartingTrip] = useState(false);
  const [stoppingTrip, setStoppingTrip] = useState(false);
  const [swapRequesting, setSwapRequesting] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [geolocationEnabled, setGeolocationEnabled] = useState(false);
  const lastUpdateRef = useRef<number>(0);
  const previousLocationRef = useRef<GeolocationPosition | null>(null);

  // Initialize MapIcons when component mounts
  useEffect(() => {
    const initMapIcons = async () => {
      try {
        const L = await import('leaflet');
        if (L.default) {
          MapIcons = {
            bus: L.default.icon({
              iconUrl: 'https://cdn-icons-png.flaticon.com/512/809/809098.png',
              iconSize: [36, 36],
              iconAnchor: [18, 18],
              popupAnchor: [0, -18]
            }),

            waitingFlag: L.default.icon({
              iconUrl: 'https://cdn-icons-png.flaticon.com/512/2540/2540614.png',
              iconSize: [30, 30],
              iconAnchor: [15, 30],
              popupAnchor: [0, -30]
            }),

            waitingFlagAcknowledged: L.default.icon({
              iconUrl: 'https://cdn-icons-png.flaticon.com/512/5610/5610944.png',
              iconSize: [30, 30],
              iconAnchor: [15, 30],
              popupAnchor: [0, -30]
            })
          };
        }
      } catch (error) {
        console.error('Failed to initialize map icons:', error);
      }
    };

    initMapIcons();
  }, []);

  // Realtime hooks - only active when trip is active
  const { currentLocation: busLocation } = useBusLocation(tripActive && driverData?.assignedRouteId ? driverData.assignedRouteId : '');
  const { flags: waitingFlags, acknowledgeFlag, markAsBoarded } = useWaitingFlags(tripActive && driverData?.assignedRouteId ? driverData.assignedRouteId : '');

  // Helper functions for distance calculation
  const deg2rad = (deg: number) => deg * (Math.PI / 180);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Radius of the earth in meters
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in meters
  };

  // Handle location update callback - MUST be defined before useGeolocation hook
  const handleLocationUpdate = useCallback(async (newPosition: GeolocationPosition) => {
    if (!tripActive || !driverData || !currentUser) return;

    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;

    // Throttle updates to every 3-5 seconds
    if (timeSinceLastUpdate < 3000) return;

    lastUpdateRef.current = now;

    try {
      const token = await currentUser.getIdToken();

      // Calculate speed if we have previous location
      let speed = newPosition.speed || 0;
      if (!speed && previousLocationRef.current) {
        const distance = calculateDistance(
          previousLocationRef.current.lat,
          previousLocationRef.current.lng,
          newPosition.lat,
          newPosition.lng
        );
        const timeDiff = (newPosition.timestamp - previousLocationRef.current.timestamp) / 1000; // seconds
        if (timeDiff > 0) {
          speed = (distance / timeDiff) * 3.6; // Convert m/s to km/h
        }
      }

      // Send location update to server using real-time API
      const response = await fetch('/api/location/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: token,
          busId: driverData.assignedBusId,
          routeId: driverData.assignedRouteId,
          lat: newPosition.lat,
          lng: newPosition.lng,
          speed: speed,
          heading: newPosition.heading || 0,
          accuracy: newPosition.accuracy,
          timestamp: newPosition.timestamp
        })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Failed to update location:', error);
      }

      previousLocationRef.current = newPosition;
    } catch (error) {
      console.error('Error updating location:', error);
    }
  }, [tripActive, driverData, currentUser, calculateDistance]);

  // Geolocation hook - only enabled when explicitly enabled
  const {
    position,
    error: locationError,
    loading: geoLoading,
    permissionDenied,
    retryTracking
  } = useGeolocation({
    watch: geolocationEnabled, // Continuous tracking when enabled
    enabled: geolocationEnabled,
    onPositionUpdate: handleLocationUpdate
  });

  // Fetch driver data and related information
  useEffect(() => {
    const fetchData = async () => {
      if (!currentUser?.uid) {
        setLoading(false);
        return;
      }

      try {
        console.log('🔄 Fetching driver data for UID:', currentUser.uid);

        // Fetch driver data
        const driver = await getDriverByUidNew(currentUser.uid);
        console.log('📋 Driver data received:', driver);

        if (driver) {
          setDriverData(driver);

          // Fetch bus data if assigned
          if (driver.assignedBusId) {
            console.log('🚌 Fetching bus data for ID:', driver.assignedBusId);
            const bus = await getBusById(driver.assignedBusId);
            console.log('🚌 Bus data received:', bus);
            if (bus) {
              setBusData(bus);
            }
          }

          // Fetch route data if assigned
          if (driver.assignedRouteId) {
            console.log('🗺️ Fetching route data for ID:', driver.assignedRouteId);
            const route = await getRouteById(driver.assignedRouteId);
            console.log('🗺️ Route data received:', route);
            if (route) {
              setRouteData(route);
            }
          }
        } else {
          console.warn('⚠️ No driver data found for UID:', currentUser.uid);
        }
      } catch (error) {
        console.error("❌ Error fetching data:", error);
        // Set loading to false even on error to prevent infinite loading
        setLoading(false);
      } finally {
        if (driverData?.assignedBusId) {
          const bus = await getBusById(driverData.assignedBusId);
          if (bus?.status === 'Inactive') {
            router.push('/driver');
          }
        }
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser?.uid]);

  // Redirect if user is not a driver
  useEffect(() => {
    if (userData && userData.role !== "driver") {
      router.push(`/${userData.role}`);
    }
  }, [userData, router]);

  // Show location modal if permission denied
  useEffect(() => {
    if (permissionDenied) {
      setShowLocationModal(true);
    }
  }, [permissionDenied]);

  // Fetch trip data when active
  useEffect(() => {
    if (tripActive && activeTripId && db) {
      const fetchTripData = async () => {
        try {
          const { doc, getDoc } = await import('firebase/firestore');
          const tripDoc = await getDoc(doc(db, 'trip_sessions', activeTripId));
          if (tripDoc.exists()) {
            const data = tripDoc.data();

            // Parse routeGeometry from JSON string
            if (data.routeGeometry && typeof data.routeGeometry === 'string') {
              data.routeGeometry = JSON.parse(data.routeGeometry);
            }

            setTripData(data);
            console.log('✅ Trip data loaded:', data);
          }
        } catch (error) {
          console.error('❌ Error fetching trip data:', error);
        }
      };
      fetchTripData();
    } else {
      setTripData(null);
    }
  }, [tripActive, activeTripId]);

  // Check for active trip on page load (trip persistence)
  useEffect(() => {
    const checkActiveTrip = async () => {
      if (!driverData?.assignedBusId || !currentUser?.uid) return;

      try {
        console.log('🔄 Checking for active trip on page load...');

        // Check for active trip via API endpoint
        const token = await currentUser.getIdToken();
        const response = await fetch('/api/driver/check-active-trip', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            busId: driverData.assignedBusId,
            idToken: token
          })
        });

        if (response.ok) {
          const result = await response.json();
          console.log('📋 Trip check result:', result);

          if (result.hasActiveTrip && result.tripData) {
            console.log('🔄 Found active trip on page load:', result.tripData);
            console.log('🔄 Trip ID:', result.tripData.tripId);

            // Set trip state
            setTripActiveWithDebug(true, 'trip recovery - found active trip');
            setActiveTripId(result.tripData.tripId);
            setGeolocationEnabled(true); // Enable geolocation for recovered trip

            // Parse routeGeometry if it's a JSON string
            if (result.tripData.routeGeometry && typeof result.tripData.routeGeometry === 'string') {
              try {
                result.tripData.routeGeometry = JSON.parse(result.tripData.routeGeometry);
              } catch (parseError) {
                console.warn('⚠️ Failed to parse routeGeometry:', parseError);
              }
            }
            setTripData(result.tripData);
            console.log('✅ Trip state recovered successfully');
          } else {
            console.log('ℹ️ No active trip found on page load');
            console.log('ℹ️ Result:', result);
            console.log('ℹ️ Setting trip state to inactive');
            setTripActiveWithDebug(false, 'trip recovery - no active trip found');
            setActiveTripId(null);
            setTripData(null);
            setGeolocationEnabled(false); // Ensure geolocation is disabled
            console.log('✅ Trip state set to inactive');
          }
        } else {
          const errorText = await response.text();
          console.error('❌ Failed to check active trip:', response.status, errorText);
        }
      } catch (error) {
        console.error('Error checking active trip:', error);
      }
    };

    if (driverData && currentUser) {
      // Add a small delay to ensure this runs after other effects
      const timer = setTimeout(() => {
        console.log('🔄 [DELAYED] Running trip recovery check...');
        checkActiveTrip();
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [driverData, currentUser]);

  // Start trip function
  const startTrip = async () => {
    if (!currentUser) {
      console.error('Cannot start trip: User not authenticated');
      return;
    }

    if (!driverData?.assignedBusId) {
      console.error('Cannot start trip: No bus assigned to driver');
      setSwapError('No bus assigned to your account. Please contact administrator.');
      return;
    }

    if (!driverData?.assignedRouteId) {
      console.error('Cannot start trip: No route assigned to driver');
      setSwapError('Your account is not linked to a route. Please contact administrator.');
      return;
    }

    console.log('🚀 Starting trip with busId:', driverData.assignedBusId, 'routeId:', driverData.assignedRouteId);

    setStartingTrip(true);
    setSwapError(null);
    try {
      const token = await currentUser.getIdToken();

      // Call NEW start-journey-v2 API endpoint with coordinate snapping
      const response = await fetch('/api/driver/start-journey-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          idToken: token,
          busId: driverData.assignedBusId,
          routeId: driverData.assignedRouteId
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setTripActiveWithDebug(true, 'start trip - trip started successfully');
        setActiveTripId(result.tripId);
        setGeolocationEnabled(true); // Enable geolocation when trip starts
        console.log('✅ Trip started successfully:', result.tripId);
        console.log('📊 Trip result data:', result);
        console.log(`📊 Snap success rate: ${result.snapSuccessRate || 'N/A'}%`);
        console.log(`🗺️ Route source: ${result.routeGeometrySource || 'N/A'}`);

        // Notify all students about the trip start
        try {
          const notifyResponse = await fetch('/api/driver/notify-students', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              idToken: token,
              busId: driverData.assignedBusId,
              routeId: driverData.assignedRouteId,
              tripId: result.tripId
            })
          });

          const notifyResult = await notifyResponse.json();
          if (notifyResponse.ok) {
            console.log(`📱 Notified ${notifyResult.notifiedCount} students about trip start`);
          } else {
            console.warn('⚠️ Failed to notify students:', notifyResult.error);
          }
        } catch (notifyError) {
          console.warn('⚠️ Error notifying students:', notifyError);
        }
      } else {
        console.error('❌ Failed to start trip:', result.error);
        setSwapError(result.error || 'Failed to start trip. Please try again.');
      }
    } catch (error) {
      console.error('❌ Error starting trip:', error);
      setSwapError('Network error. Please check your connection and try again.');
    } finally {
      setStartingTrip(false);
    }
  };

  // End trip function
  const endTrip = async () => {
    if (!currentUser || !driverData?.assignedBusId || !driverData?.assignedRouteId) return;

    setStoppingTrip(true);
    try {
      const token = await currentUser.getIdToken();

      const response = await fetch('/api/driver/end-journey-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          idToken: token,
          busId: driverData.assignedBusId,
          routeId: driverData.assignedRouteId,
          tripId: activeTripId // Include tripId if available for V2 precision
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setTripActiveWithDebug(false, 'end trip - trip ended successfully');
        setActiveTripId(null);
        setTripData(null);
        setGeolocationEnabled(false); // Disable geolocation when trip ends
        console.log('✅ Trip ended successfully - map cleared');
        previousLocationRef.current = null;
        lastUpdateRef.current = 0;

        // Clean up trip data
        try {
          const cleanupResponse = await fetch('/api/trip/cleanup', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              idToken: token,
              busId: driverData.assignedBusId,
              routeId: driverData.assignedRouteId,
              tripId: activeTripId
            })
          });

          const cleanupResult = await cleanupResponse.json();
          if (cleanupResponse.ok) {
            console.log('🧹 Trip data cleaned up successfully:', cleanupResult.message);
          } else {
            console.warn('⚠️ Trip cleanup failed:', cleanupResult.error);
          }
        } catch (cleanupError) {
          console.warn('⚠️ Error during trip cleanup:', cleanupError);
        }
      } else {
        console.error('❌ Failed to end trip:', result.error);
      }
    } catch (error) {
      console.error('❌ Error ending trip:', error);
    } finally {
      setStoppingTrip(false);
    }
  };

  // Note: Location tracking cleanup is handled automatically by useGeolocation hook

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!driverData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Driver Data Not Found</CardTitle>
            <CardDescription>
              Please contact support if you believe this is an error.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background pt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
          {/* Premium Header Section with Gradient */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-600 p-1 animate-fade-in">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-600 opacity-50 blur-3xl" />
            <div className="relative bg-background/95 backdrop-blur-xl rounded-3xl p-8 md:p-10">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg animate-float">
                      <Bus className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">Route Tracking</h1>
                      <p className="text-muted-foreground text-sm md:text-base mt-1">Manage your bus route and student boarding</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  {tripActive ? (
                    <Button
                      onClick={endTrip}
                      disabled={stoppingTrip}
                      size="lg"
                      className="group cursor-pointer px-8 py-6 text-base font-semibold bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
                    >
                      {stoppingTrip ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                          Processing Trip End Request...
                        </>
                      ) : (
                        <>
                          <Square className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform" />
                          End Trip
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={startTrip}
                      disabled={startingTrip || !driverData?.assignedBusId || busData?.status === 'Inactive'}
                      size="lg"
                      className={`group cursor-pointer px-8 py-6 text-base font-semibold transition-all duration-300 transform ${busData?.status === 'Inactive'
                        ? 'bg-gray-600 text-gray-300 border-gray-500 cursor-not-allowed opacity-70'
                        : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl hover:scale-105'
                        }`}
                    >
                      {startingTrip ? (
                        <>
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                          Processing Trip Start Request...
                        </>
                      ) : (
                        <>
                          <Play className="mr-3 h-5 w-5 group-hover:scale-110 transition-transform" />
                          {busData?.status === 'Inactive' ? 'Bus Inactive' : 'Start Trip'}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Error Message Display */}
        {swapError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{swapError}</span>
          </div>
        )}

        {/* Driver and Bus Info - Enhanced Premium Layout */}
        <div className="max-w-6xl mx-auto mt-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Driver Information Card */}
            <Card className="group relative overflow-hidden bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 border-gray-100 dark:border-gray-800 shadow-lg hover:shadow-xl transition-all duration-300 hover:shadow-blue-500/20 hover:shadow-2xl hover:scale-[1.02] hover:-translate-y-1">
              <CardHeader className="bg-gradient-to-r from-gray-50 to-blue-50 dark:from-gray-800 dark:to-blue-900/20 pb-4">
                <CardTitle className="flex items-center gap-3 text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 group-hover:bg-blue-200 dark:group-hover:bg-blue-800/50 transition-colors">
                    <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  Driver Information
                </CardTitle>
                <CardDescription className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  Your profile and assignment details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 group-hover:bg-blue-200 dark:group-hover:bg-blue-800/50 transition-colors">
                    <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p className="font-semibold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{driverData.fullName || "Unknown Driver"}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl group-hover:bg-green-50 dark:group-hover:bg-green-900/20 transition-colors">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30 group-hover:bg-green-200 dark:group-hover:bg-green-800/50 transition-colors">
                    <Bus className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Assigned Bus</p>
                    <p className="font-semibold text-foreground group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">{driverData.assignedBusId || "Not Assigned"}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl group-hover:bg-purple-50 dark:group-hover:bg-purple-900/20 transition-colors">
                  <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 group-hover:bg-purple-200 dark:group-hover:bg-purple-800/50 transition-colors">
                    <MapPin className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Assigned Route</p>
                    <p className="font-semibold text-foreground group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">{driverData.assignedRouteId || "Not Assigned"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bus Information Card */}
            <Card className="group relative overflow-hidden bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 border-gray-100 dark:border-gray-800 shadow-lg hover:shadow-xl transition-all duration-300 hover:shadow-orange-500/20 hover:shadow-2xl hover:scale-[1.02] hover:-translate-y-1">
              <CardHeader className="bg-gradient-to-r from-gray-50 to-orange-50 dark:from-gray-800 dark:to-orange-900/20 pb-4">
                <CardTitle className="flex items-center gap-3 text-foreground group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                  <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30 group-hover:bg-orange-200 dark:group-hover:bg-orange-800/50 transition-colors">
                    <Bus className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  Bus Information
                </CardTitle>
                <CardDescription className="group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                  Details of your assigned bus
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {busData ? (
                  <>
                    <div className="flex items-center space-x-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl group-hover:bg-orange-50 dark:group-hover:bg-orange-900/20 transition-colors">
                      <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30 group-hover:bg-orange-200 dark:group-hover:bg-orange-800/50 transition-colors">
                        <Bus className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Bus Number</p>
                        <p className="font-semibold text-foreground group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">{busData.busNumber || "N/A"}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl group-hover:bg-yellow-50 dark:group-hover:bg-yellow-900/20 transition-colors">
                      <div className="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 group-hover:bg-yellow-200 dark:group-hover:bg-yellow-800/50 transition-colors">
                        <Users className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Current Passengers</p>
                        <p className="font-semibold text-foreground group-hover:text-yellow-600 dark:group-hover:text-yellow-400 transition-colors">{busData.currentPassengerCount || 0} passengers</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl group-hover:bg-red-50 dark:group-hover:bg-red-900/20 transition-colors">
                      <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30 group-hover:bg-red-200 dark:group-hover:bg-red-800/50 transition-colors">
                        <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Status</p>
                        <Badge className={`group-hover:scale-105 transition-transform ${busData.status === 'active'
                          ? 'bg-green-500 dark:bg-green-400 dark:bg-green-400 hover:bg-green-600 text-white'
                          : 'bg-gray-500 hover:bg-gray-600 text-white'
                          }`}>
                          {busData.status || "Unknown"}
                        </Badge>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <div className="inline-flex p-4 bg-muted rounded-full mb-3">
                      <Bus className="h-8 w-8 text-gray-400 dark:text-gray-600" />
                    </div>
                    <p className="text-muted-foreground">No bus assigned</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Trip Status Card */}
            <Card className="group relative overflow-hidden bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 border-gray-100 dark:border-gray-800 shadow-lg hover:shadow-xl transition-all duration-300 hover:shadow-green-500/20 hover:shadow-2xl hover:scale-[1.02] hover:-translate-y-1">
              <CardHeader className="bg-gradient-to-r from-gray-50 to-green-50 dark:from-gray-800 dark:to-green-900/20 pb-4">
                <CardTitle className="flex items-center gap-3 text-foreground group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30 group-hover:bg-green-200 dark:group-hover:bg-green-800/50 transition-colors">
                    <Activity className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  Trip Status
                </CardTitle>
                <CardDescription className="group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
                  Current trip information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl group-hover:bg-green-50 dark:group-hover:bg-green-900/20 transition-colors">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30 group-hover:bg-green-200 dark:group-hover:bg-green-800/50 transition-colors">
                    <Activity className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge className={`group-hover:scale-105 transition-transform ${tripActive
                      ? 'bg-green-500 dark:bg-green-400 dark:bg-green-400 hover:bg-green-600 text-white'
                      : 'bg-gray-500 hover:bg-gray-600 text-white'
                      }`}>
                      {tripActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center space-x-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl group-hover:bg-blue-50 dark:group-hover:bg-blue-900/20 transition-colors">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 group-hover:bg-blue-200 dark:group-hover:bg-blue-800/50 transition-colors">
                    <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Duration</p>
                    <p className="font-semibold text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {tripActive && tripData?.startTime
                        ? `${Math.floor((Date.now() - tripData.startTime.toMillis()) / 60000)} min`
                        : "N/A"
                      }
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl group-hover:bg-purple-50 dark:group-hover:bg-purple-900/20 transition-colors">
                  <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 group-hover:bg-purple-200 dark:group-hover:bg-purple-800/50 transition-colors">
                    <MapPin className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Route</p>
                    <p className="font-semibold text-foreground group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                      {routeData?.routeName || driverData.assignedRouteId || "N/A"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Live Map - DYNAMIC & ASSAM-RESTRICTED */}
        {driverData?.assignedRouteId && (
          <div className="max-w-6xl mx-auto mt-12">
            <Card className="group relative overflow-hidden bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 border-gray-100 dark:border-gray-800 shadow-lg hover:shadow-xl transition-all duration-300 hover:shadow-indigo-500/20 hover:shadow-2xl hover:scale-[1.01] hover:-translate-y-1">
              <CardHeader className="bg-gradient-to-r from-gray-50 to-indigo-50 dark:from-gray-800 dark:to-indigo-900/20 pb-4">
                <CardTitle className="flex items-center gap-3 text-foreground group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 group-hover:bg-indigo-200 dark:group-hover:bg-indigo-800/50 transition-colors">
                    <MapPin className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  Live Tracking
                </CardTitle>
                <CardDescription className="group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  {tripActive
                    ? (tripData?.routeFallback
                      ? '⚠️ Using approximate routing - follow actual roads'
                      : '✅ Route tracking active')
                    : 'Start your journey to see the map'
                  }
                </CardDescription>
                {tripActive && tripData?.routeFallback && (
                  <div className="mt-3 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl">
                    <div className="flex items-start space-x-3">
                      <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-orange-800 dark:text-orange-200">
                        <p className="font-semibold">Map Display Notice</p>
                        <p className="mt-1">
                          Some stops couldn't be matched to exact road positions. The route shown on the map
                          uses approximate connections. Please follow actual roads and your usual route -
                          the GPS tracking will work correctly.
                        </p>
                        {tripData.snapSuccessRate !== undefined && (
                          <p className="mt-2 text-xs">
                            Route accuracy: {tripData.snapSuccessRate.toFixed(0)}% of stops precisely located
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-6">
                <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-lg relative z-10" style={{ zIndex: 1 }}>
                  <DynamicAssamRestrictedMap restrictToGuwahati={true} style={{ height: '500px', zIndex: 1 }}>
                    {/* Driver's Current Location (Bus Location) - Real-time GPS */}
                    {tripActive && position && position.lat && position.lng && (
                      <Marker
                        position={[position.lat, position.lng]}
                        icon={MapIcons.bus}
                      >
                        <Popup>
                          <div className="text-sm">
                            <div className="font-bold">🚌 Bus {busData?.busNumber} (Your Location)</div>
                            <div>Speed: {position.speed?.toFixed(1) || 0} km/h</div>
                            <div className="text-xs text-gray-600">
                              {new Date(position.timestamp).toLocaleTimeString()}
                            </div>
                            {position.accuracy && (
                              <div className="text-xs text-gray-500">
                                Accuracy: ±{position.accuracy.toFixed(0)}m
                              </div>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                    )}

                    {/* Dynamic Student Waiting Flags - Real-time GPS locations */}
                    {waitingFlags.map((flag) => (
                      <Marker
                        key={flag.id}
                        position={[(flag as any).lat || 0, (flag as any).lng || 0]}
                        icon={flag.status === 'acknowledged' ? MapIcons.waitingFlagAcknowledged : MapIcons.waitingFlag}
                      >
                        <Popup>
                          <div className="text-sm">
                            <div className="font-bold">🚩 Student Waiting</div>
                            <div>{flag.studentName}</div>
                            <div className="text-xs text-gray-600">📍 Real-time GPS location</div>
                            <div className="text-xs">Status: <span className="font-semibold">{flag.status}</span></div>
                            <div className="text-xs text-gray-500">
                              {flag.createdAt ? new Date(flag.createdAt).toLocaleTimeString() : 'Unknown time'}
                            </div>
                            {flag.status === 'raised' && (
                              <div className="mt-2 flex gap-1">
                                <Button
                                  size="sm"
                                  onClick={async () => {
                                    if (currentUser) {
                                      const token = await currentUser.getIdToken();
                                      await acknowledgeFlag(flag.id, token);
                                    }
                                  }}
                                  className="text-xs"
                                >
                                  Acknowledge
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    if (currentUser) {
                                      const token = await currentUser.getIdToken();
                                      await markAsBoarded(flag.id, token, 'boarded');
                                    }
                                  }}
                                  className="text-xs"
                                >
                                  Boarded
                                </Button>
                              </div>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </DynamicAssamRestrictedMap>
                </div>

                {/* Status Info */}
                {tripActive && tripData && (
                  <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-xs text-muted-foreground space-y-1">
                    <div>Route Source: {tripData.routeGeometrySource}</div>
                    <div>Snap Rate: {tripData.snapSuccessRate?.toFixed(1)}%</div>
                    {tripData.routeFallback && (
                      <div className="text-orange-600 dark:text-orange-400">
                        ⚠️ Using fallback routing - some stops may not be on roads
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Location Status - Improved Layout */}
        <div className="max-w-6xl mx-auto mt-12">
          <Card className="group relative overflow-hidden bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 border-gray-100 dark:border-gray-800 shadow-lg hover:shadow-xl transition-all duration-300 hover:shadow-cyan-500/20 hover:shadow-2xl hover:scale-[1.01] hover:-translate-y-1">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-cyan-50 dark:from-gray-800 dark:to-cyan-900/20 pb-4">
              <CardTitle className="flex items-center gap-3 text-foreground group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 group-hover:bg-cyan-200 dark:group-hover:bg-cyan-800/50 transition-colors">
                  <MapPin className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                Location Status
              </CardTitle>
              <CardDescription className="group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                Your current location and trip status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl group-hover:bg-cyan-50 dark:group-hover:bg-cyan-900/20 transition-colors">
                  <h3 className="font-medium mb-3 text-foreground group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">Current Location</h3>
                  {position ? (
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Latitude:</span>
                        <span className="text-sm font-medium text-foreground">{position.lat.toFixed(6)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Longitude:</span>
                        <span className="text-sm font-medium text-foreground">{position.lng.toFixed(6)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Accuracy:</span>
                        <span className="text-sm font-medium text-foreground">{position.accuracy.toFixed(2)} meters</span>
                      </div>
                      {position.speed && (
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Speed:</span>
                          <span className="text-sm font-medium text-foreground">{position.speed.toFixed(1)} km/h</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      {tripActive ? "Waiting for GPS..." : "Start trip to enable location tracking"}
                    </p>
                  )}
                  {locationError && (
                    <p className="text-red-500 dark:text-red-400 text-sm mt-2">{locationError.userFriendlyMessage}</p>
                  )}
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl group-hover:bg-green-50 dark:group-hover:bg-green-900/20 transition-colors">
                  <h3 className="font-medium mb-3 text-foreground group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">Trip Status</h3>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${tripActive ? 'bg-green-500 dark:bg-green-400 dark:bg-green-400' : 'bg-gray-300'}`}></div>
                      <span className="text-sm font-medium text-foreground">{tripActive ? "Trip Active" : "Trip Inactive"}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      {tripActive
                        ? "Location updates are being sent every 3-5 seconds"
                        : "Start trip to begin real-time location tracking"}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bottom Spacing for Footer */}
        <div className="h-20"></div>

        {/* Location Permission Modal */}
        <LocationPermissionModal
          isOpen={showLocationModal}
          onClose={() => setShowLocationModal(false)}
          onRetry={retryTracking}
          errorMessage={locationError?.userFriendlyMessage}
        />
      </div>
    </ErrorBoundary>
  );
}
