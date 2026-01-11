"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Square,
  CheckCircle,
  MapPin,
  Bus,
  User
} from "lucide-react";
import { getDriverById, getBusById, getRouteById } from "@/lib/dataService";
import BusMap from "@/components/EnhancedBusMap";

// Default map center for Guwahati (Panikhaiti / ADTU campus)
const DEFAULT_CENTER: [number, number] = [
  parseFloat(process.env.NEXT_PUBLIC_DEFAULT_MAP_CENTER_LAT || "26.1440"),
  parseFloat(process.env.NEXT_PUBLIC_DEFAULT_MAP_CENTER_LNG || "91.7360")
];

export default function DriverMap() {
  const { currentUser, userData } = useAuth();
  const router = useRouter();

  const [driverData, setDriverData] = useState<any>(null);
  const [busData, setBusData] = useState<any>(null);
  const [routeData, setRouteData] = useState<any>(null);
  const [tripActive, setTripActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [startingTrip, setStartingTrip] = useState(false);
  const [stoppingTrip, setStoppingTrip] = useState(false);
  const [locationInterval, setLocationInterval] = useState<NodeJS.Timeout | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [routePolyline, setRoutePolyline] = useState<[number, number][]>([]);

  // Get route ID
  const routeId = driverData?.assignedRouteId || busData?.routeId;

  // Fetch driver data and related information
  useEffect(() => {
    const fetchData = async () => {
      if (!currentUser?.uid) {
        setLoading(false);
        return;
      }

      try {
        // Fetch driver data
        const driver = await getDriverById(currentUser.uid);
        if (driver) {
          setDriverData(driver);

          // Fetch bus data if assigned
          if (driver.assignedBusId) {
            const bus = await getBusById(driver.assignedBusId);
            if (bus) {
              setBusData(bus);
            }
          }

          // Fetch route data if assigned
          if (driver.assignedRouteId) {
            const route = await getRouteById(driver.assignedRouteId);
            if (route) {
              setRouteData(route);

              // Set map center to first stop if available
              if (route.stops && route.stops.length > 0) {
                setMapCenter([route.stops[0].lat, route.stops[0].lng]);
              }

              // Create route polyline if we have stops
              if (route.stops && route.stops.length >= 2) {
                const polyline = route.stops.map((stop: any) => [stop.lat, stop.lng] as [number, number]);
                setRoutePolyline(polyline);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser]);

  // Redirect if user is not a driver
  useEffect(() => {
    if (userData && userData.role !== "driver") {
      router.push(`/${userData.role}`);
    }
  }, [userData, router]);

  // Get driver's current location
  const getCurrentLocation = useCallback(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPosition(pos);
          setLocationError(null);
        },
        (error) => {
          setLocationError(`Unable to get location: ${error.message}`);
        }
      );
    } else {
      setLocationError("Geolocation is not supported by this browser.");
    }
  }, []);

  // Start trip function
  const startTrip = async () => {
    if (!currentUser || !driverData?.assignedBusId) return;

    setStartingTrip(true);
    try {
      // Get Firebase ID token
      const token = await currentUser.getIdToken();

      // Call start-journey API endpoint
      const response = await fetch('/api/driver/start-journey-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          idToken: token,
          busId: driverData.assignedBusId,
          routeId: driverData.assignedRouteId || routeId
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setTripActive(true);
        // Start sending location updates
        startLocationUpdates();
      } else {
        console.error('Failed to start trip:', result.error);
      }
    } catch (error) {
      console.error('Error starting trip:', error);
    } finally {
      setStartingTrip(false);
    }
  };

  // End trip function
  const endTrip = async () => {
    if (!currentUser || !driverData?.assignedBusId) return;

    setStoppingTrip(true);
    try {
      // Get Firebase ID token
      const token = await currentUser.getIdToken();

      // Call end-journey API endpoint
      const response = await fetch('/api/driver/end-journey-v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          idToken: token,
          busId: driverData.assignedBusId
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setTripActive(false);
        // Stop sending location updates
        stopLocationUpdates();
      } else {
        console.error('Failed to end trip:', result.error);
      }
    } catch (error) {
      console.error('Error ending trip:', error);
    } finally {
      setStoppingTrip(false);
    }
  };

  // Start sending location updates
  const startLocationUpdates = useCallback(() => {
    // Get initial location
    getCurrentLocation();

    // Set up interval to send location updates
    const interval = setInterval(() => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            setPosition(pos);
            setLocationError(null);

            // Send location update to backend API
            if (driverData?.assignedBusId && currentUser?.uid) {
              try {
                // Get Firebase ID token
                const token = await currentUser.getIdToken();

                // Call backend API endpoint for location updates
                const response = await fetch('/api/driver/location', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                  },
                  body: JSON.stringify({
                    busId: driverData.assignedBusId,
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    speed: pos.coords.speed || 0,
                    heading: pos.coords.heading || 0,
                    accuracy: pos.coords.accuracy || 0
                  }),
                });

                const result = await response.json();

                if (!response.ok) {
                  console.error('Failed to send location update to backend:', result.error);
                }
              } catch (error) {
                console.error('Error sending location update:', error);
              }
            }
          },
          (error) => {
            setLocationError(`Unable to get location: ${error.message}`);
          }
        );
      }
    }, 5000); // Update every 5 seconds

    setLocationInterval(interval);
  }, [currentUser, driverData?.assignedBusId, getCurrentLocation]);

  // Stop sending location updates
  const stopLocationUpdates = useCallback(() => {
    if (locationInterval) {
      clearInterval(locationInterval);
      setLocationInterval(null);
    }
  }, [locationInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (locationInterval) {
        clearInterval(locationInterval);
      }
    };
  }, [locationInterval]);

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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold dark:text-white">Route Tracking</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Manage your bus route and student boarding
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {tripActive ? (
            <Button onClick={endTrip} variant="destructive" disabled={stoppingTrip}>
              {stoppingTrip ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Ending Trip...
                </>
              ) : (
                <>
                  <Square className="mr-2 h-4 w-4" />
                  End Trip
                </>
              )}
            </Button>
          ) : (
            <Button onClick={startTrip} variant="default" disabled={startingTrip || !driverData?.assignedBusId}>
              {startingTrip ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Starting Trip...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Start Trip
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Driver and Bus Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Driver Information</CardTitle>
            <CardDescription>
              Your profile and assignment details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center space-x-2">
              <div className="bg-blue-100 p-2 rounded-full">
                <User className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{driverData.fullName || "Unknown Driver"}</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <div className="bg-green-100 p-2 rounded-full">
                <Bus className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Assigned Bus</p>
                <p className="font-medium">{driverData.assignedBusId || "Not Assigned"}</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <div className="bg-purple-100 p-2 rounded-full">
                <MapPin className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Assigned Route</p>
                <p className="font-medium">{driverData.assignedRouteId || "Not Assigned"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bus Information</CardTitle>
            <CardDescription>
              Details of your assigned bus
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {busData ? (
              <>
                <div className="flex items-center space-x-2">
                  <div className="bg-orange-100 p-2 rounded-full">
                    <Bus className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Bus Number</p>
                    <p className="font-medium">{busData.busNumber || "N/A"}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="bg-yellow-100 p-2 rounded-full">
                    <User className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Current Passengers</p>
                    <p className="font-medium">{busData.currentPassengerCount || 0} passengers</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="bg-red-100 p-2 rounded-full">
                    <MapPin className="h-5 w-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <Badge variant={busData.status === 'enroute' ? 'default' : 'secondary'}>
                      {busData.status || "Unknown"}
                    </Badge>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">No bus assigned</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Live Map */}
      {routeId && (
        <Card>
          <CardHeader>
            <CardTitle>Live Tracking</CardTitle>
            <CardDescription>
              Real-time location of your bus and student waiting flags
            </CardDescription>
          </CardHeader>
          <CardContent>
            {routeId && (
              <BusMap
                routeId={routeId}
                role="driver"
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Location Status */}
      <Card>
        <CardHeader>
          <CardTitle>Location Status</CardTitle>
          <CardDescription>
            Your current location and trip status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium mb-2">Current Location</h3>
              {position ? (
                <div className="space-y-1">
                  <p>Latitude: {position.coords.latitude.toFixed(6)}</p>
                  <p>Longitude: {position.coords.longitude.toFixed(6)}</p>
                  <p>Accuracy: {position.coords.accuracy?.toFixed(2) || "N/A"} meters</p>
                </div>
              ) : (
                <p>Location not available</p>
              )}
              {locationError && (
                <p className="text-red-500">{locationError}</p>
              )}
              <Button
                onClick={getCurrentLocation}
                variant="outline"
                size="sm"
                className="mt-2"
              >
                Refresh Location
              </Button>
            </div>

            <div>
              <h3 className="font-medium mb-2">Trip Status</h3>
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${tripActive ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                <span>{tripActive ? "Trip Active" : "Trip Inactive"}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {tripActive
                  ? "Location updates are being sent every 5 seconds"
                  : "Start trip to begin sending location updates"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
