"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Bus,
  Navigation,
  Play,
  Square,
  Flag,
  XCircle,
  AlertCircle,
  Clock,
  X
} from "lucide-react";
import {
  getStudentByUid,
  getBusById,
  getRouteById
} from "@/lib/dataService";
import { supabase } from "@/lib/supabase-client";
import { useToast } from "@/contexts/toast-context";
import dynamic from "next/dynamic";
import StudentAccessBlockScreen from "@/components/StudentAccessBlockScreen";
import { shouldBlockAccess } from "@/lib/utils/renewal-utils";

// Dynamically import Uber-like map component
const UberLikeBusMap = dynamic(() => import("@/components/UberLikeBusMap"), {
  ssr: false,
  loading: () => <div className="h-full bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl animate-pulse" />
});

// Dynamically import QRCodeCanvas for inline QR display
const QRCodeCanvas = dynamic(
  () => import('qrcode.react').then((mod) => mod.QRCodeCanvas),
  { ssr: false }
);

// Default map center for Guwahati (Panikhaiti / ADTU campus)
const DEFAULT_CENTER: [number, number] = [
  parseFloat(process.env.NEXT_PUBLIC_DEFAULT_MAP_CENTER_LAT || "26.1440"),
  parseFloat(process.env.NEXT_PUBLIC_DEFAULT_MAP_CENTER_LNG || "91.7360")
];

export default function StudentTrackBusPage() {
  const { currentUser, userData, loading, signOut } = useAuth();
  const router = useRouter();
  const { addToast } = useToast();

  const [studentData, setStudentData] = useState<any>(null);
  const [busData, setBusData] = useState<any>(null);
  const [routeData, setRouteData] = useState<any>(null);
  const [busLocation, setBusLocation] = useState<any>(null);
  const [studentLocation, setStudentLocation] = useState<any>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [dataLoading, setDataLoading] = useState(true);
  const [submittingFlag, setSubmittingFlag] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [currentFlagId, setCurrentFlagId] = useState<string | null>(null);
  const [eta, setEta] = useState<string | null>(null);
  const [distanceToBus, setDistanceToBus] = useState<number | null>(null);
  const [tripActive, setTripActive] = useState(false);

  const [showManualLocation, setShowManualLocation] = useState(false);
  const [isFullScreenMap, setIsFullScreenMap] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false); // Show student's QR code

  // New state for the 10s countdown
  const [pendingRaise, setPendingRaise] = useState(false);
  const [countdown, setCountdown] = useState(10);

  // Use ref to prevent stale closure issues with handleRaiseWaitingFlag
  const handleRaiseWaitingFlagRef = useRef<(() => Promise<void>) | null>(null);

  // Handle countdown timer - using ref to avoid dependency on handleRaiseWaitingFlag
  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;

    if (pendingRaise && countdown > 0) {
      interval = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (pendingRaise && countdown === 0) {
      // Countdown finished, trigger the actual raise using ref
      if (handleRaiseWaitingFlagRef.current) {
        handleRaiseWaitingFlagRef.current();
      }
      setPendingRaise(false);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [pendingRaise, countdown]);


  const locationWatchIdRef = useRef<number | null>(null);
  const hasShownLocationErrorRef = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasShownArrivalToastRef = useRef(false); // Track if 100m arrival toast shown

  // Custom icons for bus and student markers (dynamically loaded to avoid SSR issues)
  let busIcon: any = null;
  let studentIcon: any = null;

  // Initialize icons dynamically
  const initializeIcons = async () => {
    if (typeof window !== 'undefined' && !busIcon && !studentIcon) {
      const L = await import('leaflet');

      busIcon = new L.Icon({
        iconUrl: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIxOCIgZmlsbD0iIzM0OTdGRCIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIzIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMjAiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIj7wn5qNPC90ZXh0Pjwvc3ZnPg==",
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20],
      });

      studentIcon = new L.Icon({
        iconUrl: "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iMzAiIHZpZXdCb3g9IjAgMCAzMCAzMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxNSIgY3k9IjE1IiByPSIxMiIgZmlsbD0iI0YwNTI1MiIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTYiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIj7wn5qpPC90ZXh0Pjwvc3ZnPg==",
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15],
      });
    }
  };

  // Calculate distance between two points (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
  };

  const deg2rad = (deg: number): number => {
    return deg * (Math.PI / 180);
  };

  // Calculate ETA based on distance and speed
  const calculateETA = (distanceKm: number, speedKmh: number): string => {
    if (speedKmh <= 0) return "Unknown";

    const hours = distanceKm / speedKmh;
    const minutes = Math.round(hours * 60);

    if (minutes < 1) return "Arriving now";
    if (minutes < 60) return `${minutes} min`;
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs}h ${mins}m`;
  };

  // Initialize icons on component mount
  useEffect(() => {
    initializeIcons();
  }, []);

  // Get student's current location 
  useEffect(() => {
    if (!isWaiting) {
      // Clear watch when not waiting
      if (locationWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchIdRef.current);
        locationWatchIdRef.current = null;
      }
      return;
    }

    if (!navigator.geolocation) {
      console.warn("Geolocation not supported");
      return;
    }

    console.log(" Starting location tracking for waiting student...");

    // Watch position continuously when waiting
    locationWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const newLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        setStudentLocation(newLocation);
        console.log(" Student location updated:", newLocation);
      },
      (error) => {
        // COMPLETELY SILENT - location tracking is optional for waiting students
        // Only used for distance calculation, not required for core functionality
        console.debug("Location watch error (non-critical, ignoring):", {
          code: error.code,
          message: error.message || "No message",
          type: error.code === 1 ? 'PERMISSION_DENIED' : error.code === 2 ? 'POSITION_UNAVAILABLE' : 'TIMEOUT'
        });
        // No toasts - this is background tracking for distance only
      },
      {
        enableHighAccuracy: false, // Use network/WiFi for faster results
        timeout: 30000, // 30 second timeout
        maximumAge: 30000, // Allow 30 second cached position to reduce errors
      }
    );

    return () => {
      if (locationWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(locationWatchIdRef.current);
        locationWatchIdRef.current = null;
      }
    };
  }, [isWaiting]);

  // Calculate ETA when bus location or student location changes
  useEffect(() => {
    if (busLocation && studentLocation && isWaiting) {
      const distance = Math.random() * 5; // Random distance for demo
      setDistanceToBus(distance);

      const speed = busLocation.speed ? busLocation.speed * 3.6 : 20; // Convert m/s to km/h, default 20 km/h
      const etaText = calculateETA(distance, speed);
      setEta(etaText);

      // Show "about to arrive" notification if within 500m and ETA < 3 minutes
      if (distance < 0.5 && !sessionStorage.getItem(`notified_arrival_${currentFlagId}`)) {
        addToast("🚌 Your bus is about to arrive! Get ready.", "info");
        sessionStorage.setItem(`notified_arrival_${currentFlagId}`, "true");
      }
    } else {
      setEta(null);
      setDistanceToBus(null);
    }
  }, [busLocation, studentLocation, isWaiting, currentFlagId, addToast]);

  // Fetch student data
  useEffect(() => {
    const fetchData = async () => {
      // Wait for auth to finish loading before checking
      if (loading) {
        console.log("⏳ Auth still loading, waiting...");
        return; // Still loading, don't redirect yet
      }

      // Now check if user is authenticated and is a student
      if (!currentUser?.uid || userData?.role !== "student") {
        console.log("🚫 Not authenticated or not a student, redirecting to login");
        router.push("/login");
        return;
      }

      try {
        const student = await getStudentByUid(currentUser.uid);
        if (!student) {
          console.error("❌ Student profile not found (Hard Deleted or Missing)");
          addToast("Account not found. It may have been deactivated.", "error");
          await signOut(); // Force signout
          router.push("/login"); // Redirect to login
          return;
        }

        setStudentData(student);

        if (student.busId) {
          const bus = await getBusById(student.busId);
          if (bus) {
            setBusData(bus);
          }

          if (student.routeId) {
            const route = await getRouteById(student.routeId);
            if (route) {
              setRouteData(route);

              // Initial map center will be driven by live locations
            }
          }
        }

        // Check for existing waiting flag
        const { data: existingFlags, error: flagError } = await supabase
          .from("waiting_flags")
          .select("*")
          .eq("student_uid", currentUser.uid)
          .in("status", ["waiting", "raised", "acknowledged"])
          .maybeSingle();

        if (!flagError && existingFlags) {
          setIsWaiting(true);
          setCurrentFlagId(existingFlags.id);
          if (existingFlags && existingFlags.stop_lat && existingFlags.stop_lng) {
            setStudentLocation({ lat: existingFlags.stop_lat, lng: existingFlags.stop_lng, accuracy: 50 });
          }
          console.log("✅ Existing waiting flag found:", existingFlags);
        }

        setDataLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        addToast("Failed to load tracking data", "error");
        setDataLoading(false);
      }
    };

    fetchData();
  }, [loading, currentUser, userData, router, addToast]);

  // Subscribe to acknowledgment channel for instant feedback
  useEffect(() => {
    if (!currentUser?.uid || !isWaiting) return;

    console.log("🔔 Subscribing to student acknowledgment channel");

    const channel = supabase
      .channel(`student_${currentUser.uid}`, {
        config: {
          broadcast: { self: false }
        }
      })
      .on("broadcast", { event: "flag_acknowledged" }, (payload) => {
        console.log("✅ Flag acknowledged by driver:", payload);

        // Clear waiting state
        setIsWaiting(false);
        setCurrentFlagId(null);

        // Show success notification
        addToast("🎉 Driver has acknowledged your flag! They're on the way!", "success");
      })
      .subscribe((status) => {
        console.log("📡 Student acknowledgment channel status:", status);
      });

    return () => {
      console.log("🧹 Cleaning up student acknowledgment channel");
      supabase.removeChannel(channel);
    };
  }, [currentUser?.uid, isWaiting, addToast]);

  // Subscribe to bus location updates
  useEffect(() => {
    if (!busData?.busId) return;

    console.log("🔄 Subscribing to bus location for bus:", busData.busId);

    // Get initial bus location
    const fetchBusLocation = async () => {
      try {
        const { data, error } = await supabase
          .from("bus_locations")
          .select("*")
          .eq("bus_id", busData.busId)
          .order("timestamp", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          setBusLocation(data);
          if (data.lat && data.lng) {
            setMapCenter([data.lat, data.lng]);
          }
          console.log("📍 Initial bus location:", data);
        }
      } catch (err) {
        console.warn("⚠️ Error loading initial bus location:", err);
      }
    };

    fetchBusLocation();

    // Subscribe to real-time updates (both postgres changes AND broadcasts)
    const channel = supabase
      .channel(`bus_location_${busData.busId}`)
      // Listen to database inserts (every 30s when driver saves to DB)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "bus_locations",
        filter: `bus_id=eq.${busData.busId}`
      }, (payload) => {
        console.log("📍 New bus location from DB:", payload.new);
        setBusLocation(payload.new);
        if (payload.new.lat && payload.new.lng) {
          setMapCenter([payload.new.lat, payload.new.lng]);
        }
        // Receiving a location update means trip is active!
        setTripActive(true);
      })
      // Listen to broadcast events (every 5s real-time from driver)
      .on("broadcast", { event: "bus_location_update" }, (payload) => {
        console.log("📍 Live bus location broadcast:", payload.payload);
        if (payload.payload) {
          const loc = payload.payload;
          setBusLocation({
            bus_id: loc.busId,
            lat: loc.lat,
            lng: loc.lng,
            speed: loc.speed || 0,
            heading: loc.heading || 0,
            accuracy: loc.accuracy,
            timestamp: loc.timestamp
          });
          if (loc.lat && loc.lng) {
            setMapCenter([loc.lat, loc.lng]);
          }
          // Receiving a broadcast means trip is definitely active!
          if (!tripActive) {
            console.log("🚀 Trip detected as active via broadcast!");
            setTripActive(true);
          }
        }
      })
      .subscribe((status) => {
        console.log("📡 Bus location channel status:", status);
      });

    // Subscribe to trip end notifications
    const tripEndChannel = supabase
      .channel(`bus_${busData.busId}_students`, {
        config: {
          broadcast: { self: false }
        }
      })
      .on("broadcast", { event: "trip_ended" }, (payload) => {
        console.log("🏁 Trip ended broadcast received:", payload);
        const { busNumber, message } = payload.payload;

        // Clear waiting flag state
        setIsWaiting(false);
        setCurrentFlagId(null);

        // Clear bus location and trip state IMMEDIATELY
        setBusLocation(null);
        setTripActive(false);

        // Auto-exit fullscreen when trip ends
        setIsFullScreenMap(false);

        // Show success toast
        const toastMessage = message || `Your trip for Bus ${busNumber} has ended successfully!`;
        addToast(toastMessage, "success");
      })
      .subscribe((status) => {
        console.log("📡 Trip end notification channel status:", status);
      });

    return () => {
      try {
        supabase.removeChannel(tripEndChannel);
        supabase.removeChannel(channel);
      } catch (error) {
        console.warn("Failed to remove channel:", error);
      }
    };
  }, [busData?.busId]);

  // Check for active trip with realtime subscription
  useEffect(() => {
    if (!busData?.busId) return;

    const checkActiveTrip = async () => {
      try {
        const { data, error } = await supabase
          .from("driver_status")
          .select("status")
          .eq("bus_id", busData.busId)
          .maybeSingle();

        if (!error && data) {
          const isActive = data.status === "on_trip" || data.status === "enroute";
          setTripActive(isActive);
          console.log("🔄 Trip status from driver_status:", isActive ? "ACTIVE" : "IDLE");
        } else if (!data) {
          // No driver_status record - DON'T assume trip is inactive!
          // The driver might be broadcasting but the record isn't created yet
          // Only log this, don't change tripActive state
          console.log("ℹ️ No driver_status record found - keeping current trip state");
          // We rely on broadcast events to set tripActive = true
          // and trip_ended broadcasts to set tripActive = false
        }
      } catch (error) {
        console.error("❌ Error checking active trip:", error);
        // If we can't check for active trips due to network issues,
        // don't reset the trip state - keep current state
        // This prevents losing trip state when server is temporarily down
      }
    };

    // Run the check immediately
    checkActiveTrip();

    // Subscribe to realtime changes on driver_status table
    const driverStatusChannel = supabase
      .channel(`driver_status_${busData.busId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // Listen to INSERT, UPDATE, DELETE
          schema: "public",
          table: "driver_status",
          filter: `bus_id=eq.${busData.busId}`
        },
        (payload) => {
          console.log("📡 Driver status change received:", payload);

          if (payload.eventType === "DELETE") {
            // Driver ended trip (deleted their status)
            setTripActive(false);
            console.log("🛑 Trip ended - driver_status deleted");
          } else if (payload.new) {
            const newStatus = (payload.new as any).status;
            const isActive = newStatus === "on_trip" || newStatus === "enroute";
            setTripActive(isActive);
            console.log("🚀 Trip status updated via realtime:", isActive);
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("✅ Subscribed to driver_status changes for bus:", busData.busId);
        }
      });

    // Also subscribe to trip_started broadcast events (instant notification)
    const tripNotificationChannel = supabase
      .channel(`trip-status-${busData.busId}`)
      .on("broadcast", { event: "trip_started" }, (payload) => {
        console.log("🚀 Trip started broadcast received:", payload);
        setTripActive(true);
        addToast("🚌 Your bus has started the trip!", "success");
      })
      .on("broadcast", { event: "trip_ended" }, (payload) => {
        console.log("🛑 Trip ended broadcast received:", payload);
        setTripActive(false);
        addToast("🏁 Trip has ended", "info");
      })
      .subscribe();

    // Also set up periodic checks every 30 seconds as fallback
    const interval = setInterval(checkActiveTrip, 30000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(driverStatusChannel);
      supabase.removeChannel(tripNotificationChannel);
    };
  }, [busData?.busId, addToast]);

  // Calculate distance and ETA between bus and student
  useEffect(() => {
    if (!busLocation || !studentLocation) {
      setDistanceToBus(null);
      setEta(null);
      return;
    }

    // Haversine formula to calculate distance between two lat/lng points
    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371; // Earth's radius in km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c; // Distance in km
    };

    const busLat = busLocation.lat;
    const busLng = busLocation.lng;
    const studentLat = studentLocation.lat;
    const studentLng = studentLocation.lng;

    if (busLat && busLng && studentLat && studentLng) {
      const distance = calculateDistance(busLat, busLng, studentLat, studentLng);
      setDistanceToBus(distance);

      // Calculate ETA assuming average speed of 25 km/h in city traffic
      const avgSpeedKmh = busLocation.speed && busLocation.speed > 5 ? busLocation.speed * 3.6 : 25; // Convert m/s to km/h or use default
      const timeHours = distance / avgSpeedKmh;
      const timeMinutes = Math.round(timeHours * 60);

      if (timeMinutes < 1) {
        setEta("< 1 min");
      } else if (timeMinutes === 1) {
        setEta("1 min");
      } else if (timeMinutes < 60) {
        setEta(`${timeMinutes} mins`);
      } else {
        const hours = Math.floor(timeMinutes / 60);
        const mins = timeMinutes % 60;
        setEta(`${hours}h ${mins}m`);
      }

      // Show toast when bus is within 100m (0.1 km)
      if (distance <= 0.1 && !hasShownArrivalToastRef.current && tripActive) {
        hasShownArrivalToastRef.current = true;
        addToast("🚌 Your bus is about to arrive! Be ready at the stop.", "success");
      }

      // Reset the toast flag when bus is more than 500m away (so it can show again on next approach)
      if (distance > 0.5) {
        hasShownArrivalToastRef.current = false;
      }

      console.log(`📍 Distance to bus: ${distance.toFixed(2)} km, ETA: ${timeMinutes} mins`);
    }
  }, [busLocation, studentLocation, tripActive, addToast]);

  // Subscribe to waiting flag changes for this student
  useEffect(() => {
    if (!currentUser?.uid || !busData?.busId) return;

    const waitingFlagChannel = supabase
      .channel(`waiting_flag_${currentUser.uid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "waiting_flags",
          filter: `student_uid=eq.${currentUser.uid}`
        },
        (payload) => {
          console.log("📡 Waiting flag change received:", payload);

          if (payload.eventType === "DELETE" ||
            (payload.new && (payload.new as any).status === "boarded") ||
            (payload.new && (payload.new as any).status === "cancelled") ||
            (payload.new && (payload.new as any).status === "removed") ||
            (payload.new && (payload.new as any).status === "picked_up")) {
            // Flag was removed or marked as completed
            setIsWaiting(false);
            setCurrentFlagId(null);
            if (payload.eventType === "DELETE") {
              addToast("🎉 You've been picked up! Have a safe journey.", "success");
            }
          } else if (payload.new && (payload.new as any).status === "acknowledged") {
            addToast("👋 Driver has acknowledged your waiting flag!", "success");
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("✅ Subscribed to waiting flag changes for student:", currentUser.uid);
        }
      });

    return () => {
      supabase.removeChannel(waitingFlagChannel);
    };
  }, [currentUser?.uid, busData?.busId, addToast]);

  // Raise waiting flag
  const handleRaiseWaitingFlag = async () => {
    if (!currentUser || !busData) {
      addToast("Unable to raise flag - missing data", "error");
      return;
    }

    // Check if there's an active trip
    if (!tripActive) {
      addToast("Cannot raise waiting flag - no active trip. Please wait for the driver to start the trip.", "error");
      return;
    }

    setSubmittingFlag(true);

    try {
      // Get current position with multiple fallback attempts
      let position = null;
      if (navigator.geolocation) {
        try {
          console.log("🌍 Attempting to get current position...");

          // Try with network-based location first (faster and more reliable)
          position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                console.log("✅ Location obtained:", {
                  lat: pos.coords.latitude,
                  lng: pos.coords.longitude,
                  accuracy: pos.coords.accuracy
                });
                resolve(pos);
              },
              reject,
              {
                enableHighAccuracy: false, // Network/WiFi location (faster, less battery)
                timeout: 15000, // 15 second timeout
                maximumAge: 300000 // Allow 5 minute cached position (very lenient)
              }
            );
          });
        } catch (geoError: any) {
          console.error("Geolocation error details:", {
            code: geoError?.code,
            message: geoError?.message || "No message",
            name: geoError?.name,
          });

          // Handle specific geolocation errors with helpful messages
          if (geoError.code === 1) { // PERMISSION_DENIED
            addToast("📍 Location permission denied. Please enable location in your browser settings.", "error");
            setShowManualLocation(true);
            setSubmittingFlag(false);
            return;
          } else if (geoError.code === 2) { // POSITION_UNAVAILABLE
            addToast("📍 Location unavailable. Please ensure location services are enabled on your device.", "warning");
            setShowManualLocation(true);
            setSubmittingFlag(false);
            return;
          } else if (geoError.code === 3) { // TIMEOUT
            addToast("📍 Location request timed out. Please try again.", "warning");
            setSubmittingFlag(false);
            return;
          } else {
            addToast("📍 Unable to get your location. Please check your device settings.", "error");
            setShowManualLocation(true);
            setSubmittingFlag(false);
            return;
          }
        }
      } else {
        addToast("Geolocation is not supported by your browser.", "error");
        setSubmittingFlag(false);
        return;
      }

      const currentLocation = position ? {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      } : null;

      if (currentLocation) {
        setStudentLocation(currentLocation);
        setMapCenter([position.coords.latitude, position.coords.longitude]);
      }

      // Ensure we have location before proceeding
      if (!currentLocation || !currentLocation.lat || !currentLocation.lng) {
        addToast("Unable to get your location. Please ensure location services are enabled.", "error");
        setSubmittingFlag(false);
        return;
      }

      // Get Firebase ID token
      const idToken = await currentUser.getIdToken();

      // Prepare flag data with location
      const flagData: any = {
        idToken,
        busId: busData.busId,
        routeId: routeData?.routeId || studentData?.routeId,
        lat: currentLocation.lat,
        lng: currentLocation.lng,
        accuracy: position?.coords.accuracy || 50,
      };

      console.log("🚩 Raising waiting flag with data:", {
        busId: flagData.busId,
        routeId: flagData.routeId,
        lat: flagData.lat,
        lng: flagData.lng,
        accuracy: flagData.accuracy
      });

      // Call API to raise waiting flag
      const response = await fetch('/api/student/waiting-flag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(flagData)
      });

      let result;
      try {
        const text = await response.text();
        result = text ? JSON.parse(text) : {};
      } catch (e) {
        console.warn("Failed to parse response as JSON", e);
        result = {};
      }

      if (response.ok && result.success) {
        setIsWaiting(true);
        setCurrentFlagId(result.flagId);
        addToast("✅ Waiting flag raised! Driver has been notified.", "success");
      } else if (response.status === 409 && result.existingFlagId) {
        // Handle existing flag (conflict) gracefully - restore state
        console.log("⚠️ Flag already exists, restoring state:", result);
        setIsWaiting(true);
        setCurrentFlagId(result.existingFlagId);
        addToast("You already have an active waiting flag for this bus.", "info");
      } else {
        console.error("❌ Error raising waiting flag:", result);
        addToast(result.error || result.message || `Failed to raise waiting flag (${response.status})`, "error");
      }
    } catch (error: any) {
      console.error("❌ Error raising waiting flag:", error);
      console.error("❌ Error details:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        statusCode: error.statusCode
      });

      if (error.code === 1) {
        addToast("Location permission denied. Please enable location access.", "error");
      } else if (error.code === 2) {
        addToast("Location unavailable. Please check your GPS settings.", "error");
      } else if (error.code === 3) {
        addToast("Location request timed out. Please try again.", "error");
      } else if (error.message) {
        addToast("Failed to raise waiting flag: " + error.message, "error");
      } else {
        addToast("Failed to raise waiting flag. Please try again.", "error");
      }
    } finally {
      setSubmittingFlag(false);
    }
  };

  // Keep ref in sync with the latest handleRaiseWaitingFlag
  useEffect(() => {
    handleRaiseWaitingFlagRef.current = handleRaiseWaitingFlag;
  }, [currentUser, busData, routeData, studentData, tripActive, addToast]);

  // Remove waiting flag
  const handleRemoveWaitingFlag = async () => {
    if (!currentFlagId) return;

    try {
      setSubmittingFlag(true);

      // Delete from Supabase
      const { error } = await supabase
        .from("waiting_flags")
        .update({ status: 'cancelled' })
        .eq("id", currentFlagId);

      if (error) throw error;

      // Broadcast removal to driver
      const channel = supabase.channel(`waiting_flags_${busData.busId}`);
      const broadcastResult = await channel.send({
        type: "broadcast",
        event: "waiting_flag_removed",
        payload: {
          flagId: currentFlagId,
          studentUid: currentUser?.uid,
        },
      });

      if (broadcastResult !== 'ok') {
        console.warn("Broadcast warning:", broadcastResult);
      }

      setIsWaiting(false);
      setCurrentFlagId(null);
      setBusLocation(null);
      setTripActive(false);
      setEta(null);
      setDistanceToBus(null);

      // Clear arrival notification flag
      sessionStorage.removeItem(`notified_arrival_${currentFlagId}`);

      addToast("Waiting flag removed", "success");

    } catch (error: any) {
      console.error("Error removing waiting flag:", error);
      addToast("Failed to remove waiting flag", "error");
    } finally {
      setSubmittingFlag(false);
    }
  };

  // Toggle waiting flag
  const handleToggleWaitingFlag = () => {
    if (isWaiting) {
      // If actually waiting, button is disabled per requirement, so this shouldn't be reached usually.
      return;
    } else if (pendingRaise) {
      // If pending (in 10s window), cancel the countdown
      setPendingRaise(false);
      setCountdown(10);
      addToast("Waiting flag request cancelled", "info");
    } else {
      // Start the countdown
      setPendingRaise(true);
      setCountdown(10);
    }
  };

  // Show loading while auth is loading
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Bus className="h-12 w-12 animate-bounce mx-auto mb-4" />
          <p className="text-lg">Loading authentication...</p>
        </div>
      </div>
    );
  }

  // Check if student should be soft-blocked based on deadline-config.json
  // Uses shouldBlockAccess which checks the soft block date, not just expiry
  if (userData) {
    // Convert validUntil to ISO string for the check
    let validUntilStr: string | null = null;
    if (userData.validUntil) {
      if (typeof userData.validUntil === 'string') {
        validUntilStr = userData.validUntil;
      } else if (userData.validUntil?.toDate) {
        validUntilStr = userData.validUntil.toDate().toISOString();
      } else if (userData.validUntil?.seconds) {
        validUntilStr = new Date(userData.validUntil.seconds * 1000).toISOString();
      } else if (userData.validUntil instanceof Date) {
        validUntilStr = userData.validUntil.toISOString();
      }
    }

    const isBlocked = shouldBlockAccess(validUntilStr, userData.lastRenewalDate, null, userData.status);
    if (isBlocked) {
      return (
        <StudentAccessBlockScreen
          validUntil={userData.validUntil}
          studentName={userData.fullName || userData.name || 'Student'}
          onLogout={async () => {
            const result = await signOut();
            if (result.success) {
              router.push('/');
            }
          }}
        />
      );
    }
  }

  if (dataLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 dark:bg-gray-950 relative overflow-hidden">
        {/* Animated road lines */}
        <div className="absolute inset-0 overflow-hidden opacity-20">
          <div className="absolute top-0 left-1/2 w-1 h-full bg-gradient-to-b from-transparent via-white to-transparent animate-pulse"></div>
          <div className="absolute top-0 left-1/4 w-px h-full bg-gradient-to-b from-transparent via-blue-400 to-transparent" style={{ animationDelay: '0.5s' }}></div>
          <div className="absolute top-0 right-1/4 w-px h-full bg-gradient-to-b from-transparent via-blue-400 to-transparent" style={{ animationDelay: '1s' }}></div>
        </div>

        {/* Moving stars/points (like journey markers) */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-blue-400 rounded-full animate-ping"></div>
          <div className="absolute top-1/2 right-1/3 w-2 h-2 bg-cyan-400 rounded-full animate-ping" style={{ animationDelay: '0.7s' }}></div>
          <div className="absolute bottom-1/3 left-1/3 w-2 h-2 bg-purple-400 rounded-full animate-ping" style={{ animationDelay: '1.4s' }}></div>
        </div>

        <div className="text-center space-y-6 relative z-10">
          {/* Bus journey animation */}
          <div className="relative flex items-center justify-center h-32">
            {/* Road/path line */}
            <div className="absolute w-64 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent rounded-full"></div>

            {/* Moving bus on path */}
            <div className="relative">
              {/* Outer glow ring */}
              <div className="absolute inset-0 w-24 h-24 -m-6 bg-blue-500/20 rounded-full animate-pulse"></div>

              {/* Bus container with forward motion */}
              <div className="relative p-4 bg-gradient-to-br from-blue-600 via-cyan-600 to-blue-700 rounded-2xl shadow-2xl">
                <Bus className="h-10 w-10 text-white" />
                {/* Motion lines */}
                <div className="absolute -left-2 top-1/2 -translate-y-1/2 flex gap-1">
                  <div className="w-1 h-0.5 bg-blue-300 animate-pulse"></div>
                  <div className="w-1 h-0.5 bg-blue-300 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-1 h-0.5 bg-blue-300 animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>

              {/* Destination marker */}
              <div className="absolute -right-24 top-1/2 -translate-y-1/2">
                <MapPin className="h-6 w-6 text-green-400 animate-bounce" />
              </div>
            </div>
          </div>

          {/* Loading text */}
          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-white">
              Loading Bus Tracker
            </h3>
            <p className="text-sm text-blue-200">
              Fetching live bus location...
            </p>

            {/* Progress bar */}
            <div className="w-64 mx-auto mt-4">
              <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500 rounded-full animate-pulse" style={{ width: '70%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!busData || !routeData) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>No Bus Assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <p>You haven't been assigned to a bus yet. Please contact your admin.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-gray-950 dark:via-blue-950/20 dark:to-purple-950/10">
      <div className="container mx-auto px-4 pb-4 pt-20 md:px-6 md:pb-6 md:pt-24 space-y-6">
        {/* Optimized Header */}
        <div className="group relative overflow-hidden rounded-3xl md:rounded-[2rem] p-[2px] bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 shadow-xl">
          {/* Simplified gradient border */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-75 group-hover:opacity-100 transition-opacity duration-300" />

          {/* Optimized card */}
          <div className="relative bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-3xl md:rounded-[2rem] p-6 md:p-10">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-4 flex-1">
                {/* Title Section */}
                <div className="flex items-center gap-4">
                  <div className="relative p-3 md:p-4 rounded-2xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 shadow-lg">
                    <Navigation className="h-6 md:h-7 w-6 md:w-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                      Live Bus Tracker
                    </h1>
                    <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mt-1 font-medium">
                      Real-time location • Instant updates • Smart ETA
                    </p>
                  </div>
                </div>

                {/* Optimized Status Indicators */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className={`group/badge relative overflow-hidden px-5 py-2.5 rounded-full font-semibold text-sm shadow-lg transition-shadow duration-200 ${tripActive
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-green-500/30'
                    : 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/30'
                    }`}>
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${tripActive ? 'bg-white animate-pulse' : 'bg-white/80'
                      }`} />
                    <span className="relative z-10">{tripActive ? '🚌 Trip Active' : '⏸️ Trip Inactive'}</span>
                  </div>

                  {eta && (
                    <div className="group/eta relative overflow-hidden px-5 py-2.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold text-sm shadow-lg shadow-blue-500/30 transition-shadow duration-200">
                      <Clock className="inline-block h-4 w-4 mr-2" />
                      <span className="relative z-10">ETA: {eta}</span>
                    </div>
                  )}

                  {distanceToBus && (
                    <div className="group/distance relative overflow-hidden px-5 py-2.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold text-sm shadow-lg shadow-purple-500/30 transition-shadow duration-200">
                      <MapPin className="inline-block h-4 w-4 mr-2" />
                      <span className="relative z-10">{distanceToBus.toFixed(1)} km away</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Optimized Map Layout */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Dimmer for Full Screen Mode */}
          {isFullScreenMap && (
            <div className="fixed inset-0 bg-black/80 z-40 backdrop-blur-sm transition-opacity duration-300 pointer-events-none" />
          )}

          {/* Map Section */}
          <div className={`transition-all duration-300 ${isFullScreenMap ? "fixed inset-0 z-[10000] p-0" : "flex-1"}`}>
            <div className={`relative overflow-hidden shadow-xl ring-1 ring-black/5 dark:ring-white/10 transition-all duration-300 ${isFullScreenMap
              ? "h-[100dvh] w-screen rounded-none"
              : "h-[450px] md:h-[600px] lg:h-full rounded-3xl md:rounded-[2rem]"
              }`}>
              <UberLikeBusMap
                busId={busData?.busId || studentData?.busId || ''}
                busNumber={busData?.busNumber}
                journeyActive={tripActive}
                isFullScreen={isFullScreenMap}
                onToggleFullScreen={() => setIsFullScreenMap(!isFullScreenMap)}
                showStatsOnMobile={isFullScreenMap}
                studentLocation={studentLocation}
                onShowQrCode={() => setShowQrCode(true)}
                primaryActionLabel={
                  submittingFlag
                    ? "Processing..."
                    : isWaiting
                      ? "Cancel Waiting Flag"
                      : pendingRaise
                        ? `Cancel (${countdown}s)`
                        : !tripActive
                          ? "Trip Not Active"
                          : "🚩 Raise Waiting Flag"
                }
                primaryActionColor={isWaiting ? 'red' : !tripActive ? 'blue' : 'orange'}
                onPrimaryAction={(!tripActive && !isWaiting) ? undefined : handleToggleWaitingFlag}
              />
            </div>
          </div>

          {/* Optimized Info Sidebar */}
          <div className="w-full lg:w-96 space-y-5">
            {/* Bus Info Card */}
            <div className="group relative overflow-hidden rounded-2xl p-[1px] bg-gradient-to-br from-blue-400 via-cyan-400 to-teal-400 shadow-lg hover:scale-[1.02] transition-transform duration-300">

              <Card className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-0">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg transition-transform duration-200">
                      <Bus className="h-5 w-5 text-white" />
                    </div>
                    <span className="bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent font-bold">
                      Bus Information
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative overflow-hidden bg-gradient-to-br from-blue-50 to-cyan-50/50 dark:from-blue-950/30 dark:to-cyan-950/20 rounded-xl p-4 transition-shadow duration-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Bus Number</span>
                      <span className="font-bold text-lg bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">{busData.busNumber}</span>
                    </div>
                  </div>

                  <div className="relative overflow-hidden bg-gradient-to-br from-purple-50 to-pink-50/50 dark:from-purple-950/30 dark:to-pink-950/20 rounded-xl p-4 transition-shadow duration-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Route</span>
                      <span className="font-bold text-lg bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent">{routeData.routeName}</span>
                    </div>
                  </div>

                  <div className="relative overflow-hidden bg-gradient-to-br from-green-50 to-emerald-50/50 dark:from-green-950/30 dark:to-emerald-950/20 rounded-xl p-4 transition-shadow duration-200">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Status</span>
                      <Badge
                        variant={tripActive ? "default" : "secondary"}
                        className={`font-semibold px-4 py-1 ${tripActive ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white' : ''}`}
                      >
                        {tripActive ? "✅ Active" : "⏸️ Inactive"}
                      </Badge>
                    </div>
                  </div>

                  {busLocation && (
                    <div className="relative overflow-hidden bg-gradient-to-br from-amber-50 to-orange-50/50 dark:from-amber-950/30 dark:to-orange-950/20 rounded-xl p-4 transition-shadow duration-200">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Last Updated</span>
                        <span className="text-sm font-semibold bg-gradient-to-r from-amber-600 to-orange-600 dark:from-amber-400 dark:to-orange-400 bg-clip-text text-transparent">
                          {new Date(busLocation.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Waiting Flag Card */}
            <div className="group relative overflow-hidden rounded-2xl p-[1px] bg-gradient-to-br from-orange-400 via-red-400 to-pink-400 shadow-lg hover:scale-[1.02] transition-transform duration-300">

              <Card className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-0">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-orange-500 to-pink-500 shadow-lg transition-transform duration-200">
                      <Flag className="h-5 w-5 text-white" />
                    </div>
                    <span className="bg-gradient-to-r from-orange-600 to-pink-600 dark:from-orange-400 dark:to-pink-400 bg-clip-text text-transparent font-bold">
                      Waiting Status
                    </span>
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-800/50 dark:to-slate-800/30 rounded-xl p-4">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Current Status:</span>
                    <Badge
                      variant={isWaiting ? "default" : "secondary"}
                      className={`font-semibold px-4 py-1 ${isWaiting ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white animate-pulse' : ''}`}
                    >
                      {isWaiting ? "🚩 Waiting" : "✋ Not Waiting"}
                    </Badge>
                  </div>

                  {isWaiting && currentFlagId && (
                    <div className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-cyan-50 to-blue-50 dark:from-blue-950/40 dark:via-cyan-950/30 dark:to-blue-950/40 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-4 shadow-inner">
                      <div className="relative space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-blue-500 animate-pulse">
                            <Flag className="h-4 w-4 text-white" />
                          </div>
                          <span className="font-bold text-blue-800 dark:text-blue-300">Waiting Flag Active</span>
                        </div>
                        <p className="text-sm text-blue-700 dark:text-blue-400 font-medium">
                          ✅ Driver has been notified. Your flag will expire in 20 minutes.
                        </p>
                      </div>
                    </div>
                  )}

                  {eta && distanceToBus !== null && (
                    <div className="relative overflow-hidden bg-gradient-to-br from-green-50 via-emerald-50 to-green-50 dark:from-green-950/40 dark:via-emerald-950/30 dark:to-green-950/40 border-2 border-green-200 dark:border-green-800 rounded-xl p-4 shadow-inner">
                      <div className="relative space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-green-800 dark:text-green-300 font-bold flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            ETA:
                          </span>
                          <span className="text-green-800 dark:text-green-300 font-bold text-xl">{eta}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-green-700 dark:text-green-400 font-medium">Distance:</span>
                          <span className="text-green-700 dark:text-green-400 font-semibold">{distanceToBus.toFixed(2)} km</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* How it works section */}
                  <div className="relative overflow-hidden bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 dark:from-indigo-950/30 dark:via-blue-950/20 dark:to-cyan-950/30 rounded-xl p-5 border border-indigo-100 dark:border-indigo-900">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-500">
                        <AlertCircle className="h-4 w-4 text-white" />
                      </div>
                      How it Works
                    </h4>
                    <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300 font-medium">
                      <p className="flex items-start gap-2">
                        <span className="text-indigo-600 dark:text-indigo-400 mt-0.5">1️⃣</span>
                        <span>Click "Raise Waiting Flag" when ready</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <span className="text-indigo-600 dark:text-indigo-400 mt-0.5">2️⃣</span>
                        <span>Your driver will be notified instantly</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <span className="text-indigo-600 dark:text-indigo-400 mt-0.5">3️⃣</span>
                        <span>Driver will come to your location</span>
                      </p>
                      <p className="flex items-start gap-2">
                        <span className="text-indigo-600 dark:text-indigo-400 mt-0.5">4️⃣</span>
                        <span>Flag expires automatically in 20 minutes</span>
                      </p>
                    </div>
                  </div>


                  {/* Optimized Action Button */}
                  <div className="pt-2">
                    <Button
                      onClick={handleToggleWaitingFlag}
                      className={`
                        relative w-full py-7 text-base font-bold shadow-lg overflow-hidden
                        transition-shadow duration-200 active:scale-[0.98]
                        disabled:opacity-70 disabled:cursor-not-allowed
                        ${isWaiting
                          ? 'bg-gray-500 text-white cursor-not-allowed' // Disabled style for Raised
                          : pendingRaise
                            ? 'bg-gradient-to-r from-red-500 via-pink-500 to-red-500 text-white shadow-red-500/50' // Cancel style
                            : tripActive
                              ? 'bg-gradient-to-r from-orange-500 via-pink-500 to-orange-500 text-white shadow-orange-500/50' // Raise style
                              : 'bg-gray-400 text-gray-700'
                        }
                      `}
                      size="lg"
                      // Disable if: submitting, no trip, OR if flag is already raised (isWaiting)
                      disabled={submittingFlag || (!tripActive && !isWaiting) || (isWaiting && !pendingRaise)}
                    >
                      <span className="relative z-10 flex items-center justify-center gap-3">
                        {submittingFlag ? (
                          <>
                            <div className="h-5 w-5 animate-spin rounded-full border-3 border-current border-t-transparent"></div>
                            <span>{pendingRaise ? "Cancelling..." : "Processing..."}</span>
                          </>
                        ) : isWaiting ? (
                          <>
                            <Flag className="h-6 w-6" />
                            <span>Waiting Flag Raised</span>
                          </>
                        ) : pendingRaise ? (
                          <>
                            <XCircle className="h-6 w-6" />
                            <span>Cancel Waiting Flag ({countdown}s)</span>
                          </>
                        ) : !tripActive ? (
                          <>
                            <AlertCircle className="h-6 w-6" />
                            <span>No Active Trip</span>
                          </>
                        ) : (
                          <>
                            <Flag className="h-6 w-6 animate-pulse" />
                            <span>🚩 Raise Waiting Flag</span>
                          </>
                        )}
                      </span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen QR Code Overlay - Shows on map when QR button is clicked */}
      {showQrCode && isFullScreenMap && studentData && (
        <>
          {/* Blur overlay - clickable to close */}
          <div
            className="fixed inset-0 z-[10001] bg-black/70 backdrop-blur-md"
            onClick={() => setShowQrCode(false)}
          />

          {/* Premium QR Code Card - Centered on screen */}
          <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4 pointer-events-none">
            <div className="pointer-events-auto w-full max-w-[340px] bg-[#0a0b14] rounded-[28px] overflow-hidden shadow-2xl border border-white/10 animate-in zoom-in-95 fade-in duration-200">
              {/* Header with university branding */}
              <div className="relative px-5 py-4 bg-gradient-to-r from-[#1a1b2e] to-[#0f1019] border-b border-white/5">
                <div className="flex items-center gap-3">
                  <img src="/adtu-new-logo.svg" alt="AdtU" className="h-7 w-auto" />
                  <div>
                    <span className="text-xs font-bold text-white/80 block">Assam down town University</span>
                    <span className="text-[10px] font-medium text-white/40">Digital Bus Pass</span>
                  </div>
                </div>
                {/* Close button */}
                <button
                  onClick={() => setShowQrCode(false)}
                  className="absolute top-3 right-3 w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white/60 hover:text-white transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Student Info */}
              <div className="px-5 pt-4 pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest block mb-0.5">Student</span>
                    <h3 className="text-lg font-black text-white tracking-tight">{studentData.fullName || 'Student'}</h3>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-[10px] font-bold ${studentData.status === 'active'
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                    {studentData.status === 'active' ? 'ACTIVE' : 'INACTIVE'}
                  </div>
                </div>
              </div>

              {/* QR Code */}
              <div className="flex justify-center py-5">
                <div className="relative p-4 bg-white rounded-2xl shadow-xl">
                  <QRCodeCanvas
                    value={currentUser?.uid || ''}
                    size={160}
                    level="H"
                    includeMargin={false}
                  />
                  {/* Corner accents */}
                  <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-blue-500 rounded-tl-lg" />
                  <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-blue-500 rounded-tr-lg" />
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-blue-500 rounded-bl-lg" />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-blue-500 rounded-br-lg" />
                </div>
              </div>

              {/* Enrollment ID */}
              <div className="mx-5 mb-5 bg-white/5 rounded-xl p-3 border border-white/10">
                <div className="flex flex-col items-center">
                  <span className="text-[8px] font-bold text-white/30 uppercase tracking-[0.2em] mb-1">Enrollment ID</span>
                  <span className="text-base font-bold text-blue-400 tracking-widest font-mono">
                    {studentData.enrollmentId || 'N/A'}
                  </span>
                </div>
              </div>

              {/* Bus Info Bar */}
              <div className="mx-5 mb-5 flex items-center justify-between bg-[#1a1b2e] rounded-xl px-4 py-2.5 border border-white/5">
                <div className="flex items-center gap-2">
                  <Bus className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-bold text-white">Bus-{busData?.busNumber?.replace('bus_', '') || 'N/A'}</span>
                </div>
                <div className="text-xs text-white/50">
                  Route: {routeData?.routeName || busData?.busNumber?.replace('bus_', '') || 'N/A'}
                </div>
              </div>

              {/* Footer instruction */}
              <div className="px-5 pb-5 text-center">
                <p className="text-[10px] text-white/30">Show this QR code to the driver for verification</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
