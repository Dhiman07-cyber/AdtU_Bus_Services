"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bus, MapPin, Clock, Users, Flag, PlayCircle, StopCircle, AlertCircle, Navigation, CheckCircle, Activity, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import { getDriverById, getBusById, getRouteById } from "@/lib/dataService";
import { useToast } from "@/contexts/toast-context";
import { PremiumPageLoader } from "@/components/LoadingSpinner";
import {
  checkDeviceSession,
  registerDeviceSession,
  heartbeatDeviceSession,
  releaseDeviceSession,
  getOrCreateDeviceId
} from "@/lib/session-device-service";

// Dynamically import components to avoid SSR issues
const BrowserCompatibilityBanner = dynamic(() => import('@/components/BrowserCompatibilityBanner'), {
  ssr: false,
});
const PWAInstallPrompt = dynamic(() => import('@/components/PWAInstallPrompt'), {
  ssr: false,
});
const NotificationPermissionBanner = dynamic(() => import('@/components/NotificationPermissionBanner'), {
  ssr: false,
});

// Dynamically import Uber-like driver map
const UberLikeDriverMap = dynamic(() => import('@/components/UberLikeDriverMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl animate-pulse" />
});

// Dynamically import BusPassScannerModal
const BusPassScannerModal = dynamic(() => import('@/components/BusPassScannerModal'), {
  ssr: false
});


interface WaitingFlag {
  id: string;
  student_uid: string;
  student_name: string;
  student_profile_photo?: string | null; // Cloudinary profile photo URL
  bus_id: string;
  stop_lat?: number;  // Supabase uses stop_lat/stop_lng
  stop_lng?: number;
  lat?: number;  // Keep for backward compatibility
  lng?: number;
  stop_name?: string;
  message?: string;
  status: 'waiting' | 'acknowledged' | 'boarded' | 'raised' | 'picked_up';
  created_at: string;
  queue_number?: number; // Assigned queue number (1, 2, 3, etc.)
  distance?: number; // Distance from bus in km
}


export default function DriverLiveTrackingPage() {
  const { currentUser, userData, loading: authLoading } = useAuth();
  const router = useRouter();
  const { addToast } = useToast();

  // Core data
  const [driverData, setDriverData] = useState<any>(null);
  const [busData, setBusData] = useState<any>(null);
  const [routeData, setRouteData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Trip state
  const [tripActive, setTripActive] = useState(false);
  const [tripId, setTripId] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [speed, setSpeed] = useState(0);
  const [accuracy, setAccuracy] = useState(0);

  // Waiting flags
  const [waitingFlags, setWaitingFlags] = useState<WaitingFlag[]>([]);

  // Refs
  const locationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const locationChannelRef = useRef<any>(null); // Persistent channel for location broadcasting
  const watchIdRef = useRef<number | null>(null);
  const broadcastCountRef = useRef<number>(0); // For write optimization
  const manuallyEndedTripRef = useRef<boolean>(false); // Track if trip was manually ended
  const wakeLockRef = useRef<any>(null); // Screen wake lock to prevent screen from turning off

  // Map center
  const [mapCenter, setMapCenter] = useState<[number, number]>([0, 0]); // Default center
  const [hasActiveSwapRequest, setHasActiveSwapRequest] = useState(false);
  const [swapPeriodInfo, setSwapPeriodInfo] = useState<{
    startTime: Date | null;
    endTime: Date | null;
  } | null>(null);
  // Track whether current user is sender (requester) or receiver (candidate) of the swap
  const [swapRole, setSwapRole] = useState<'sender' | 'receiver' | null>(null);
  // Track swap type: 'assignment' (to reserved driver) or 'exchange' (true swap between two assigned drivers)
  const [swapType, setSwapType] = useState<'assignment' | 'exchange' | null>(null);

  const [swapRequestLoading, setSwapRequestLoading] = useState(true);

  // Map Full Screen State
  const [isFullScreenMap, setIsFullScreenMap] = useState(false);

  // Scanner Modal State
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  // Track if location channel is subscribed and ready

  // Device Session Management (Multi-device conflict detection)
  const [deviceConflict, setDeviceConflict] = useState<{
    hasConflict: boolean;
    otherDeviceId?: string;
    sessionAge?: number;
  }>({ hasConflict: false });
  const deviceSessionHeartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const currentDeviceId = useRef<string>('');
  const [isChannelReady, setIsChannelReady] = useState(false);

  // Multi-driver lock state - blocks UI when another driver is operating the bus
  const [busLockedByOther, setBusLockedByOther] = useState(false);
  const [lockInfo, setLockInfo] = useState<{
    lockedByDriver?: string;
    tripId?: string;
    since?: string;
  } | null>(null);
  const lastValidLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  // WAIT REQUEST STATE
  const [activeWaitRequest, setActiveWaitRequest] = useState<{
    studentId: string;
    studentName: string;
    stopName: string;
    timestamp: number;
  } | null>(null);
  const [waitRequestTimer, setWaitRequestTimer] = useState(10);
  const [sendingResponse, setSendingResponse] = useState(false);

  // Helper to handle wait request response
  const handleRespondToWaitRequest = async (response: 'accepted' | 'rejected') => {
    if (!activeWaitRequest || !currentUser) return;

    setSendingResponse(true);
    try {
      const idToken = await currentUser.getIdToken();

      await fetch('/api/driver/respond-wait', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          idToken,
          studentId: activeWaitRequest.studentId,
          response,
          busId: busData?.busId
        })
      });

      // Clear request
      setActiveWaitRequest(null);
      setWaitRequestTimer(10);

      if (response === 'accepted') {
        addToast(`Accepted wait request for ${activeWaitRequest.studentName}`, "success");
      } else {
        addToast("Rejected wait request", "info");
      }
    } catch (error) {
      console.error("Error responding to wait request:", error);
      addToast("Failed to send response", "error");
    } finally {
      setSendingResponse(false);
    }
  };

  // Subscribe to wait requests
  useEffect(() => {
    if (!busData?.busId) return;

    console.log("👂 Subscribing to wait requests for bus:", busData.busId);

    const channelName = `driver_wait_request_${busData.busId}`;
    const channel = supabase.channel(channelName);

    channel
      .on('broadcast', { event: 'wait_request' }, (payload) => {
        console.log("📣 Received wait request:", payload);
        const { studentId, studentName, stopName, timestamp } = payload.payload;

        // Show request
        setActiveWaitRequest({
          studentId,
          studentName,
          stopName,
          timestamp
        });
        setWaitRequestTimer(10); // Reset timer to 10s

        // Play notification sound if available
        try {
          const audio = new Audio('/sounds/notification.mp3');
          audio.play().catch(e => console.log('Audio play failed', e));
        } catch (e) {
          // Ignore audio errors
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [busData?.busId]);

  // Handle countdown
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (activeWaitRequest && waitRequestTimer > 0) {
      interval = setInterval(() => {
        setWaitRequestTimer(prev => prev - 1);
      }, 1000);
    } else if (activeWaitRequest && waitRequestTimer === 0) {
      // Auto-reject on timeout
      console.log("⏱️ Wait request timed out - Auto rejecting");
      handleRespondToWaitRequest('rejected');
    }

    return () => clearInterval(interval);
  }, [activeWaitRequest, waitRequestTimer]);

  // Start location tracking with better error handling and fallback
  const startLocationTracking = useCallback(() => {
    if (!navigator.geolocation) {
      addToast("Geolocation not supported by your browser", "error");
      return;
    }

    // Detect if on desktop/laptop for development fallback
    const isDesktop = !(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));

    if (isDesktop) {
      console.log("💻 Desktop detected - will use best available location");
      addToast("Desktop mode: Click 'Allow' when browser asks for location permission.", "info");
      // Continue with GPS attempt - browsers can still provide network-based location
    } else {
      addToast("Acquiring GPS location... Please allow location access.", "info");
    }

    console.log("🌍 Starting GPS tracking...");

    // Try with lower accuracy first if high accuracy fails
    const tryLowerAccuracy = () => {
      console.log("🔄 Trying with lower accuracy settings...");

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, speed: gpsSpeed, accuracy: gpsAccuracy } = position.coords;

          setCurrentLocation({ lat: latitude, lng: longitude, accuracy: gpsAccuracy });
          setSpeed(gpsSpeed || 0);
          setAccuracy(gpsAccuracy);
          setMapCenter([latitude, longitude]);

          console.log("✅ Location obtained (lower accuracy):", { gpsAccuracy });
          addToast("GPS tracking started (using network location)", "warning");

          // Start watching with lower accuracy
          watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
              const { latitude, longitude, speed: gpsSpeed, accuracy: gpsAccuracy } = position.coords;

              setCurrentLocation({ lat: latitude, lng: longitude, accuracy: gpsAccuracy });
              setSpeed(gpsSpeed || 0);
              setAccuracy(gpsAccuracy);
              setMapCenter([latitude, longitude]);

              console.log("📍 Location update:", { latitude, longitude, gpsSpeed, gpsAccuracy });
            },
            (error) => {
              console.warn("⚠️ Watch error (lower accuracy):", error.code, error.message);
            },
            {
              enableHighAccuracy: false,
              maximumAge: 0, // Always get fresh location
              timeout: 15000, // Increased timeout for better accuracy
            }
          );
        },
        (error) => {
          console.log("💡 Network location unavailable - using default location");

          // Use default location as last resort (ADTU Campus)
          const defaultLat = 26.1445;
          const defaultLng = 91.7362;
          setCurrentLocation({ lat: defaultLat, lng: defaultLng, accuracy: 500 });
          setMapCenter([defaultLat, defaultLng]);
          setAccuracy(500);
          addToast("⚠️ Location access denied or unavailable. Using campus default. You can still start the trip.", "warning");
        },
        {
          enableHighAccuracy: false,
          timeout: 60000,
          maximumAge: 10000,
        }
      );
    };

    // First try with high accuracy
    navigator.geolocation.getCurrentPosition(
      (initialPosition) => {
        const { latitude, longitude, speed: gpsSpeed, accuracy: gpsAccuracy } = initialPosition.coords;

        // Set initial location
        setCurrentLocation({ lat: latitude, lng: longitude, accuracy: gpsAccuracy });
        setSpeed(gpsSpeed || 0);
        setAccuracy(gpsAccuracy);
        setMapCenter([latitude, longitude]);

        console.log("✅ Initial location obtained (high accuracy):", { gpsAccuracy });
        addToast("GPS tracking started", "success");

        // Now start continuous tracking
        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            const { latitude, longitude, speed: gpsSpeed, accuracy: gpsAccuracy } = position.coords;

            setCurrentLocation({ lat: latitude, lng: longitude, accuracy: gpsAccuracy });
            setSpeed(gpsSpeed || 0);
            setAccuracy(gpsAccuracy);
            setMapCenter([latitude, longitude]);

            console.log("📍 Location update:", { latitude, longitude, gpsSpeed, gpsAccuracy });
          },
          (error) => {
            console.error("❌ Geolocation watch error:", { code: error.code, message: error.message });

            // Handle specific errors
            if (error.code === 1) { // PERMISSION_DENIED
              addToast("Location permission denied. Please allow location access.", "error");
            }
            else if (error.code === 2 || error.code === 3) { // POSITION_UNAVAILABLE or TIMEOUT
              console.log("⚠️ High accuracy watch failed, switching to lower accuracy...");

              // Clear the failing watch
              if (watchIdRef.current !== null) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
              }

              // Try fallback
              tryLowerAccuracy();

              // Notify user if it's a persistent issue (optional, maybe skip to avoid spam)
              // addToast("GPS signal weak, switching to network location...", "warning");
            } else {
              addToast("GPS tracking error: " + error.message, "warning");
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 0, // Always get fresh, accurate location
          }
        );
      },
      (error) => {
        console.warn("⚠️ High accuracy geolocation unavailable:", error.code, error.message);

        if (error.code === error.PERMISSION_DENIED) {
          // Permission denied - show clear instructions
          addToast("Location permission denied. Please enable location access in your browser.", "error");
        } else if (error.code === error.POSITION_UNAVAILABLE || error.code === error.TIMEOUT) {
          // Position unavailable or timeout - try lower accuracy fallback
          console.log(" Trying network-based location...");
          addToast("GPS unavailable, trying network location...", "warning");
          tryLowerAccuracy();
        } else {
          // Use default location (ADTU Campus)
          console.log(" GPS unavailable, using default location");
          const defaultLat = 26.1445;
          const defaultLng = 91.7362;
          setCurrentLocation({ lat: defaultLat, lng: defaultLng, accuracy: 500 });
          setMapCenter([defaultLat, defaultLng]);
          setAccuracy(500);
          addToast(" GPS timeout. Using default location. Trip can still be started.", "warning");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0, // Don't use cached location for initial request
      }
    );
  }, [addToast]);


  // Stop location tracking
  const stopLocationTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      console.log("🛑 GPS tracking stopped");
    }

    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
      console.log("🛑 Location broadcast stopped");
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopLocationTracking();
    };
  }, [stopLocationTracking]);


  // NOTE: Cache clearing removed for production - caching is now enabled

  // Check for active (ACCEPTED) swap requests - only blocks BEFORE the swap period starts
  useEffect(() => {
    const checkActiveSwapRequests = async () => {
      if (!currentUser) {
        setSwapRequestLoading(false);
        return;
      }

      try {
        const idToken = await currentUser.getIdToken();

        // Check for ACCEPTED outgoing swaps (driver initiated a swap that was accepted)
        const outgoingResponse = await fetch(
          `/api/driver-swap/requests?type=outgoing&status=accepted`,
          {
            headers: { Authorization: `Bearer ${idToken}` }
          }
        );

        // Also check for ACCEPTED incoming swaps (driver accepted someone else's swap request)
        const incomingResponse = await fetch(
          `/api/driver-swap/requests?type=incoming&status=accepted`,
          {
            headers: { Authorization: `Bearer ${idToken}` }
          }
        );

        let hasActiveSwap = false;
        let swapPeriodStarted = false;
        let pendingSwapPeriod: { startTime: Date; endTime: Date } | null = null;
        let detectedSwapRole: 'sender' | 'receiver' | null = null;
        let detectedSwapType: 'assignment' | 'exchange' | null = null;
        const now = new Date();

        if (outgoingResponse.ok) {
          const outgoingData = await outgoingResponse.json();
          if (outgoingData.requests && outgoingData.requests.length > 0) {
            console.log('📋 Active outgoing swaps (accepted):', outgoingData.requests.length);

            // Check if any swap period has started
            for (const swap of outgoingData.requests) {
              const startTime = swap.timePeriod?.startTime ? new Date(swap.timePeriod.startTime) : null;
              const endTime = swap.timePeriod?.endTime ? new Date(swap.timePeriod.endTime) : null;

              // If we're within the swap period, driver should be allowed to use live tracking
              // (they've swapped out, so they're currently "off duty" for their original bus)
              if (startTime && endTime && now >= startTime && now <= endTime) {
                swapPeriodStarted = true;
                console.log('✅ Outgoing swap period is ACTIVE - swap requester is off-duty');
              } else if (startTime && endTime && now < startTime) {
                // Store swap period info for display
                pendingSwapPeriod = { startTime, endTime };
                // Current user is the SENDER (requester who initiated the swap)
                detectedSwapRole = 'sender';
                // Determine swap type: exchange if there's a secondary bus, otherwise assignment
                detectedSwapType = swap.secondaryBusId ? 'exchange' : 'assignment';
                console.log('📤 User is SENDER of this swap, type:', detectedSwapType);
              }
            }

            // Only block if swap period hasn't started yet
            if (!swapPeriodStarted) {
              hasActiveSwap = true;
            }
          }
        }

        if (incomingResponse.ok) {
          const incomingData = await incomingResponse.json();
          if (incomingData.requests && incomingData.requests.length > 0) {
            console.log('📋 Active incoming swaps (accepted):', incomingData.requests.length);

            // Check if any swap period has started
            for (const swap of incomingData.requests) {
              const startTime = swap.timePeriod?.startTime ? new Date(swap.timePeriod.startTime) : null;
              const endTime = swap.timePeriod?.endTime ? new Date(swap.timePeriod.endTime) : null;

              // If we're within the swap period, the acceptor should be allowed to drive
              if (startTime && endTime && now >= startTime && now <= endTime) {
                swapPeriodStarted = true;
                console.log('✅ Incoming swap period is ACTIVE - acceptor can drive the swapped bus');
              } else if (startTime && endTime && now < startTime) {
                // Store swap period info for display
                pendingSwapPeriod = { startTime, endTime };
                // Current user is the RECEIVER (candidate who accepted the swap)
                detectedSwapRole = 'receiver';
                // Determine swap type: exchange if there's a secondary bus, otherwise assignment
                detectedSwapType = swap.secondaryBusId ? 'exchange' : 'assignment';
                console.log('📥 User is RECEIVER of this swap, type:', detectedSwapType);
              }
            }

            // Only block if swap period hasn't started yet
            if (!swapPeriodStarted) {
              hasActiveSwap = true;
            }
          }
        }

        // If swap period has started, don't block access - driver has temporary assignment
        if (swapPeriodStarted) {
          hasActiveSwap = false;
          setSwapPeriodInfo(null);
          setSwapRole(null);
          setSwapType(null);
          console.log('🚌 Swap period in progress - allowing live tracking access');
        } else if (hasActiveSwap && pendingSwapPeriod) {
          // Store the swap period info for display
          setSwapPeriodInfo(pendingSwapPeriod);
          setSwapRole(detectedSwapRole);
          setSwapType(detectedSwapType);
          console.log('⏳ Swap period not started yet - showing time info, role:', detectedSwapRole, 'type:', detectedSwapType);
        }

        setHasActiveSwapRequest(hasActiveSwap);
        console.log('🔄 Has active swap blocking access:', hasActiveSwap, '| Swap period started:', swapPeriodStarted, '| Role:', detectedSwapRole);
      } catch (error) {
        console.error('Error checking swap requests:', error);
      } finally {
        setSwapRequestLoading(false);
      }
    };

    checkActiveSwapRequests();
  }, [currentUser]);

  // Fetch driver, bus, and route data
  useEffect(() => {
    const fetchData = async () => {
      // Wait for auth to load before checking
      if (authLoading) {
        console.log("⏳ Waiting for auth to load...");
        return; // Still loading, don't redirect yet
      }

      // Now check if user is authenticated and is a driver
      if (!currentUser?.uid || userData?.role !== "driver") {
        console.log("🚫 Not authenticated or not a driver after loading, redirecting to login");

        // Save current URL for redirect after login
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('returnUrl', window.location.pathname);
        }
        router.push("/login");
        return;
      }

      try {
        const driver = await getDriverById(currentUser.uid);
        if (!driver) {
          addToast("Driver profile not found", "error");
          router.push("/driver");
          return;
        }

        setDriverData(driver);

        if (driver.assignedBusId || driver.busId) {
          const busId = driver.assignedBusId || driver.busId;
          if (busId) {
            const bus = await getBusById(busId);
            if (bus) {
              if (bus.status === 'Inactive') {
                addToast("Your assigned bus is currently Inactive. You cannot start a trip.", "error");
                router.push("/driver");
                return;
              }
              setBusData(bus);

              // Get route data
              if (driver.assignedRouteId || driver.routeId) {
                const routeId = driver.assignedRouteId || driver.routeId;
                if (routeId) {
                  const route = await getRouteById(routeId);
                  if (route) {
                    setRouteData(route);
                  }
                }
              }
            }
          }
        }

        setLoading(false);
      } catch (error) {
        console.error("Error fetching data:", error);
        addToast("Failed to load driver data", "error");
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser, userData, router, addToast]);

  // Screen Wake Lock API for Driver
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
          console.log('💡 Screen Wake Lock active (Driver)');

          wakeLock.addEventListener('release', () => {
            console.log('💡 Screen Wake Lock released (Driver)');
          });
        }
      } catch (err: any) {
        if (err.name !== 'NotAllowedError') {
          console.error(`❌ Wake Lock error: ${err.name}, ${err.message}`);
        }
      }
    };

    if (tripActive) {
      requestWakeLock();
    }

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && tripActive) {
        await requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) {
        wakeLock.release().catch(e => console.error('Wake Lock release error', e));
        wakeLock = null;
      }
    };
  }, [tripActive]);

  // Check for active trip when busData is available
  useEffect(() => {
    if (!currentUser || !busData) return;

    const checkActiveTrip = async () => {
      if (!currentUser?.uid || !busData?.busId) {
        console.log("⚠️ Cannot check active trip - missing user or bus data");
        return;
      }

      // CRITICAL: Don't override state if trip was manually ended
      if (manuallyEndedTripRef.current) {
        console.log("🛑 Skipping active trip check - trip was manually ended");
        return;
      }

      try {
        console.log("🔍 Checking for active trip...");
        const idToken = await currentUser.getIdToken();
        const response = await fetch("/api/driver/check-active-trip", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            idToken,
            busId: busData.busId,
          }),
        });

        if (!response.ok) {
          console.error("❌ Check active trip API error:", response.status, response.statusText);
          // Only reset state if currently active (avoid unnecessary re-renders)
          if (tripActive) {
            setTripActive(false);
            setTripId(null);
            stopLocationTracking();
          }
          return;
        }

        const result = await response.json();
        console.log("📊 Active trip check result:", result);

        // =====================================================
        // MULTI-DRIVER LOCK CHECK
        // If bus is locked by another driver, block this driver
        // =====================================================
        if (result.busLockedByOther) {
          console.log("🔒 Bus is locked by another driver!", result.lockInfo);
          setBusLockedByOther(true);
          setLockInfo(result.lockInfo || null);
          // Don't set tripActive for this driver - they shouldn't operate
          if (tripActive) {
            setTripActive(false);
            setTripId(null);
            stopLocationTracking();
          }
          return; // Don't continue with trip check
        } else {
          // Clear lock state if previously locked
          if (busLockedByOther) {
            console.log("🔓 Bus lock released, driver can now operate");
            setBusLockedByOther(false);
            setLockInfo(null);
          }
        }

        if (result.hasActiveTrip) {
          // Only update if state changed
          if (!tripActive || tripId !== result.tripData?.tripId) {
            setTripActive(true);
            setTripId(result.tripData?.tripId || null);
            console.log("✅ Active trip found/updated:", result.tripData);

            // CRITICAL: Start location tracking to restore marker on page refresh
            // This ensures the bus marker is rendered immediately when an active trip is detected
            if (!currentLocation) {
              console.log("📍 Starting location tracking to restore marker...");
              startLocationTracking();
            }
          }
        } else {
          // Server says no active trip - only update if currently active
          if (tripActive) {
            setTripActive(false);
            setTripId(null);
            stopLocationTracking(); // Stop GPS when trip is inactive
            console.log("ℹ️ No active trip found - state reset");
          }
        }
      } catch (error: any) {
        console.error("❌ Error checking active trip:", error);

        // Only reset state if it's NOT a network error (we want to keep state during network issues)
        if (!error?.message?.includes('Failed to fetch') && !error?.message?.includes('NetworkError')) {
          // Reset state on non-network errors
          setTripActive(false);
          setTripId(null);
        } else {
          console.warn("⚠️ Network error checking active trip - keeping current state");
        }
      }
    };

    // Run the check immediately
    checkActiveTrip();

    // Also set up periodic checks every 10 seconds to catch any state changes
    const interval = setInterval(checkActiveTrip, 10000);

    return () => clearInterval(interval);
  }, [currentUser, busData, tripActive, tripId, currentLocation, startLocationTracking]); // Dependencies for checking state changes

  // ==========================================
  // DEVICE SESSION MANAGEMENT (Multi-Device Conflict Detection)
  // ==========================================
  // This prevents location sharing confusion when the same driver account
  // is accessed from multiple devices simultaneously.
  // Track tripActive in a ref for cleanup access without triggering re-renders
  const tripActiveRef = useRef(tripActive);
  useEffect(() => {
    tripActiveRef.current = tripActive;
  }, [tripActive]);

  // Check for existing sessions when page loads
  useEffect(() => {
    if (!currentUser?.uid) return;

    // Initialize device ID on mount
    currentDeviceId.current = getOrCreateDeviceId();
    console.log('📱 Current device ID:', currentDeviceId.current.substring(0, 8) + '...');

    const checkExistingSession = async () => {
      // Don't check if we already have an active trip locally (prevent self-conflict)
      if (tripActiveRef.current) return;

      const sessionCheck = await checkDeviceSession(currentUser.uid, 'driver_location_share');
      console.log('🔍 Device session check:', sessionCheck);

      if (sessionCheck.hasActiveSession && !sessionCheck.isCurrentDevice) {
        // Another device is actively sharing location
        setDeviceConflict({
          hasConflict: true,
          otherDeviceId: sessionCheck.otherDeviceId,
          sessionAge: sessionCheck.sessionAge
        });
        console.warn('⚠️ Another device is currently sharing location for this account');
      } else {
        setDeviceConflict({ hasConflict: false });
      }
    };

    checkExistingSession();

    // Cleanup on unmount
    return () => {
      // If this device was broadcasting, release the session
      // Use ref here to get latest value without re-running effect
      if (tripActiveRef.current) {
        console.log('🧹 Releasing device session on unmount...');
        releaseDeviceSession(currentUser.uid, 'driver_location_share');
      }
      if (deviceSessionHeartbeatRef.current) {
        clearInterval(deviceSessionHeartbeatRef.current);
        deviceSessionHeartbeatRef.current = null;
      }
    };
  }, [currentUser?.uid]); // Removed tripActive dependency to prevent re-runs on trip start/end

  // Start/Stop device session heartbeat when trip is active
  useEffect(() => {
    if (!currentUser?.uid) return;

    if (tripActive) {
      // Register this device as the active broadcaster
      registerDeviceSession(currentUser.uid, 'driver_location_share')
        .then((result) => {
          if (result.success) {
            console.log('✅ Device session registered for location sharing');
            setDeviceConflict({ hasConflict: false });
          }
        });

      // Start heartbeat every 1 minute to keep session alive
      deviceSessionHeartbeatRef.current = setInterval(async () => {
        const success = await heartbeatDeviceSession(currentUser.uid, 'driver_location_share');
        if (!success) {
          console.warn('⚠️ Device session heartbeat failed');
        }
      }, 60000);
    } else {
      // Trip ended - release session
      if (deviceSessionHeartbeatRef.current) {
        clearInterval(deviceSessionHeartbeatRef.current);
        deviceSessionHeartbeatRef.current = null;
      }
      releaseDeviceSession(currentUser.uid, 'driver_location_share');
    }

    return () => {
      if (deviceSessionHeartbeatRef.current) {
        clearInterval(deviceSessionHeartbeatRef.current);
        deviceSessionHeartbeatRef.current = null;
      }
    };
  }, [currentUser?.uid, tripActive]);

  // Function to take over location sharing from another device
  const handleTakeOverSession = async () => {
    if (!currentUser?.uid) return;

    console.log('🔄 Taking over location sharing from another device...');

    // Force register this device (will override the other device's session)
    const result = await registerDeviceSession(currentUser.uid, 'driver_location_share');
    if (result.success) {
      setDeviceConflict({ hasConflict: false });
      addToast('Location sharing transferred to this device', 'success');
      console.log('✅ Successfully took over location sharing');
    } else {
      addToast('Failed to take over session: ' + result.error, 'error');
    }
  };

  // Dynamic centering when location changes during active trip
  useEffect(() => {
    if (!tripActive || !currentLocation) return;

    // Update map center when location changes during active trip
    setMapCenter([0, 0]); // Default center
  }, [tripActive, currentLocation]);

  // Store addToast in ref to avoid recreating channel on every render
  const addToastRef = useRef(addToast);
  useEffect(() => {
    addToastRef.current = addToast;
  }, [addToast]);

  // Subscribe to waiting flags channel when trip is active
  useEffect(() => {
    if (!tripActive || !busData?.busId) return;

    console.log("🔄 Subscribing to waiting flags for bus:", busData.busId);

    let channelReady = false;

    // Subscribe to real-time updates FIRST
    const channel = supabase
      .channel(`waiting_flags_${busData.busId}`, {
        config: {
          broadcast: { self: false }
        }
      })
      .on("broadcast", { event: "waiting_flag_created" }, (payload) => {
        console.log("🚩 New waiting flag received:", payload);
        const flagData = payload.payload;

        // Add to state if not already present
        setWaitingFlags((prev) => {
          const exists = prev.some(f => f.id === flagData.id);
          if (exists) {
            console.log("⚠️ Flag already exists, skipping");
            return prev;
          }
          console.log("✅ Adding new flag to state");
          return [...prev, flagData];
        });

        // Show toast notification using ref
        addToastRef.current(
          `${flagData.student_name || 'A student'} is waiting for pickup`,
          "info"
        );
      })
      .on("broadcast", { event: "waiting_flag_removed" }, (payload) => {
        console.log("🚩 Waiting flag removed:", payload);
        setWaitingFlags((prev) =>
          prev.filter((flag) => flag.id !== payload.payload.flagId)
        );
      })
      // Add postgres_changes as backup for faster flag detection
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "waiting_flags",
        filter: `bus_id=eq.${busData.busId}`
      }, (payload) => {
        console.log("🚩 New waiting flag (postgres_changes INSERT):", payload);
        const newFlag = payload.new as any;

        // Only add if status is raised or waiting
        if (newFlag.status === 'raised' || newFlag.status === 'waiting') {
          setWaitingFlags((prev) => {
            const exists = prev.some(f => f.id === newFlag.id);
            if (exists) {
              console.log("⚠️ Flag already exists (from broadcast), skipping");
              return prev;
            }
            console.log("✅ Adding new flag from postgres_changes");
            return [...prev, newFlag];
          });

          // Show toast notification
          addToastRef.current(
            `${newFlag.student_name || 'A student'} is waiting for pickup`,
            "info"
          );
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "waiting_flags",
        filter: `bus_id=eq.${busData.busId}`
      }, (payload) => {
        console.log("🚩 Waiting flag updated (postgres_changes UPDATE):", payload);
        const updatedFlag = payload.new as any;

        // If status changed to cancelled or picked_up, remove from list
        if (updatedFlag.status === 'cancelled' || updatedFlag.status === 'picked_up' || updatedFlag.status === 'boarded') {
          setWaitingFlags((prev) => prev.filter((flag) => flag.id !== updatedFlag.id));
        } else {
          // Update the flag in state
          setWaitingFlags((prev) =>
            prev.map((flag) =>
              flag.id === updatedFlag.id ? { ...flag, ...updatedFlag } : flag
            )
          );
        }
      })
      .subscribe(async (status, error) => {
        console.log("📡 Waiting flags channel status:", status);
        if (status === 'SUBSCRIBED') {
          console.log("✅ Waiting flags channel subscribed successfully");
          channelReady = true;

          // Load initial flags AFTER subscription is ready
          try {
            const { data, error } = await supabase
              .from("waiting_flags")
              .select("*")
              .eq("bus_id", busData.busId)
              .in("status", ["raised", "waiting", "acknowledged"]);

            if (!error && data) {
              setWaitingFlags(data);
              console.log("📍 Loaded initial waiting flags:", data.length, "flags");
            } else if (error) {
              console.warn("⚠️ Error loading waiting flags:", error.message);
              // Graceful degradation - flags just won't show but app continues
            }
          } catch (err: any) {
            console.warn("⚠️ Error loading waiting flags:", err?.message);
          }
        } else if (status === 'CHANNEL_ERROR') {
          console.warn("⚠️ Waiting flags channel error:", error || "Unknown channel error");
          // Don't crash - just log the error and continue
          console.warn("⚠️ Waiting flags feature may not work - check Supabase permissions");
        } else if (status === 'TIMED_OUT') {
          console.warn("⏱️ Waiting flags channel subscription timed out");
        }
      });

    return () => {
      console.log("🧹 Cleaning up waiting flags channel");
      supabase.removeChannel(channel);
    };
  }, [busData?.busId, tripActive]); // Don't include addToast - use ref instead

  // Screen Wake Lock - Keep screen on during active trip
  useEffect(() => {
    const requestWakeLock = async () => {
      // Don't request if document is hidden (will fail with NotAllowedError)
      if (document.hidden) return;

      try {
        if ('wakeLock' in navigator && tripActive) {
          const wakeLock = await (navigator as any).wakeLock.request('screen');
          wakeLockRef.current = wakeLock;
          console.log('🔒 Screen wake lock acquired - screen will stay on');

          // Listen for wake lock release
          wakeLock.addEventListener('release', () => {
            // Only log, re-acquisition handled by visibilitychange listener
            console.log('🔓 Screen wake lock released');
          });
        }
      } catch (err: any) {
        // Suppress known error when page is not visible or user denied
        if (err.name !== 'NotAllowedError') {
          console.error('❌ Failed to acquire wake lock:', err);
        }
      }
    };

    // Re-acquire lock when page becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && tripActive) {
        // Only request if we don't have it (though requestWakeLock handles that mostly, it's safer to check ref if possible, 
        // but the ref might be stale or not updated if release happened externally. 
        // Simplest is to just call requestWakeLock which can be robust.)
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
          console.log('🔓 Screen wake lock released on trip end');
        } catch (err) {
          console.error('❌ Error releasing wake lock:', err);
        }
      }
    };

    if (tripActive) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [tripActive]);

  // ==========================================
  // AUTO-DISMISS WAITING FLAGS WHEN DRIVER REACHES STUDENT
  // ==========================================
  // When the driver's distance to a waiting student is less than 50 meters,
  // automatically mark the flag as 'picked_up' to clear it from both UIs
  useEffect(() => {
    if (!tripActive || !currentLocation || waitingFlags.length === 0) return;

    // Calculate distance between driver and each waiting student
    const checkProximity = async () => {
      for (const flag of waitingFlags) {
        const studentLat = flag.stop_lat || flag.lat;
        const studentLng = flag.stop_lng || flag.lng;

        if (!studentLat || !studentLng) continue;

        // Haversine formula to calculate distance
        const R = 6371000; // Earth's radius in meters
        const dLat = (studentLat - currentLocation.lat) * Math.PI / 180;
        const dLon = (studentLng - currentLocation.lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
          Math.cos(currentLocation.lat * Math.PI / 180) *
          Math.cos(studentLat * Math.PI / 180) *
          Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c; // Distance in meters

        // If within 50 meters, auto-dismiss the flag
        if (distance <= 50) {
          console.log(`🎯 Driver reached student ${flag.student_name} (${distance.toFixed(0)}m) - auto-dismissing flag`);

          try {
            // Update flag status to 'picked_up' in Supabase
            const { error } = await supabase
              .from('waiting_flags')
              .update({ status: 'picked_up' })
              .eq('id', flag.id);

            if (!error) {
              // Remove from local state
              setWaitingFlags(prev => prev.filter(f => f.id !== flag.id));

              // Broadcast removal to student
              const channel = supabase.channel(`student_${flag.student_uid}`);
              await channel.subscribe();
              await channel.send({
                type: 'broadcast',
                event: 'flag_acknowledged',
                payload: { flagId: flag.id, status: 'picked_up', message: 'Driver has arrived!' }
              });
              await supabase.removeChannel(channel);

              addToast(`🎉 Reached ${flag.student_name}!`, 'success');
              console.log(`✅ Auto-dismissed flag for ${flag.student_name}`);
            } else {
              console.error('❌ Failed to auto-dismiss flag:', error);
            }
          } catch (err) {
            console.error('❌ Error auto-dismissing flag:', err);
          }
        }
      }
    };

    checkProximity();
  }, [tripActive, currentLocation, waitingFlags]);


  // Manage persistent location channel for better performance
  useEffect(() => {
    if (!tripActive || !busData?.busId) return;

    console.log("📡 Setting up persistent location channel for bus:", busData.busId);

    // Reset ready state when setting up new channel
    setIsChannelReady(false);

    // Create channel with appropriate config
    const channel = supabase.channel(`bus_location_${busData.busId}`, {
      config: {
        broadcast: { self: true, ack: false }
      }
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log("✅ Location channel subscribed");
        locationChannelRef.current = channel;
        setIsChannelReady(true);
      } else if (status === 'CHANNEL_ERROR') {
        console.warn("⚠️ Location channel error - will retry");
        addToast("Connection to server failed. Sync may be interrupted.", "warning");
        locationChannelRef.current = null;
        setIsChannelReady(false);
      }
    });

    return () => {
      console.log("🧹 Cleaning up location channel");
      locationChannelRef.current = null;
      setIsChannelReady(false);
      supabase.removeChannel(channel);
    };
  }, [tripActive, busData?.busId]);

  // Broadcast location to Supabase
  useEffect(() => {
    if (!tripActive || !currentLocation || !busData || !routeData || !isChannelReady) return;

    console.log("🚀 Starting location broadcasting for active trip");

    // Broadcast immediately
    broadcastLocation();

    // Then broadcast every 2 seconds for smoother real-time tracking
    locationIntervalRef.current = setInterval(broadcastLocation, 2000);

    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
        locationIntervalRef.current = null;
        console.log("🛑 Location broadcasting stopped");
      }
    };
  }, [tripActive, currentLocation, busData, routeData, isChannelReady]);

  const broadcastLocation = async () => {
    if (!currentLocation || !busData || !routeData) return;

    try {
      const idToken = await currentUser?.getIdToken();

      // Increment broadcast counter
      broadcastCountRef.current += 1;

      // OPTIMIZATION: Save to database only every 15th time (30 seconds)
      // But broadcast real-time EVERY time (2 seconds)
      // This reduces DB writes by 15x while keeping real-time updates!
      const shouldSaveToDatabase = broadcastCountRef.current % 15 === 0;

      // Always broadcast to students via Supabase Realtime (real-time updates)
      try {
        // Use persistent channel if available
        if (locationChannelRef.current) {
          await locationChannelRef.current.send({
            type: "broadcast",
            event: "bus_location_update",
            payload: {
              busId: busData.busId,
              driverUid: currentUser?.uid,
              lat: currentLocation.lat,
              lng: currentLocation.lng,
              accuracy: accuracy,
              speed: speed || 0,
              heading: 0,
              timestamp: new Date().toISOString(),
            },
          });
          console.log(`📡 Real-time broadcast sent (${shouldSaveToDatabase ? 'with DB save' : 'broadcast only'})`);
        } else {
          // This branch should ideally not be reached if isChannelReady is used correctly,
          // but we keep it silent to avoid warnings during initialization.
          // console.warn("⚠️ Location channel not ready yet");
        }
      } catch (broadcastError) {
        console.warn("⚠️ Realtime broadcast failed:", broadcastError);
      }

      // Save to database only every 30 seconds (for history/recovery)
      if (shouldSaveToDatabase) {
        try {
          const response = await fetch("/api/location/update", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              idToken,
              busId: busData.busId,
              routeId: routeData.routeId,
              lat: currentLocation.lat,
              lng: currentLocation.lng,
              accuracy: accuracy,
              speed: speed,
              heading: 0,
              timestamp: Date.now(),
              tripId: tripId,
            }),
          });

          if (response.ok) {
            console.log("💾 Location saved to database (every 30s)");
          } else {
            console.warn("⚠️ Database save failed:", response.status);
          }
        } catch (error) {
          console.error("❌ Error saving to database:", error);
          // Non-critical - real-time broadcast still works
        }
      }
    } catch (error) {
      console.error("❌ Error in broadcastLocation:", error);
    }
  };

  // Distance-based auto-pickup: Remove waiting students when bus gets close (within ~50 meters)
  // NEW BEHAVIOR: Markers and cards stay visible until distance closes to zero, regardless of acknowledgment
  const PICKUP_THRESHOLD_KM = 0.05; // 50 meters threshold for auto-pickup

  useEffect(() => {
    if (!tripActive || !currentLocation || waitingFlags.length === 0) return;

    // Calculate distances and check for pickups
    const flagsToRemove: string[] = [];

    waitingFlags.forEach((flag) => {
      // Support both stop_lat/lng and legacy lat/lng
      const targetLat = flag.stop_lat || flag.lat;
      const targetLng = flag.stop_lng || flag.lng;

      if (!targetLat || !targetLng) return;

      // NEW: Remove status check - pickup happens for ANY status when distance closes to zero
      // This ensures marker stays visible until bus reaches the student

      // Haversine formula for distance calculation
      const R = 6371; // Radius of earth in km
      const dLat = (targetLat - currentLocation.lat) * Math.PI / 180;
      const dLon = (targetLng - currentLocation.lng) * Math.PI / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(currentLocation.lat * Math.PI / 180) * Math.cos(targetLat * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c; // Distance in km

      console.log(`📍 Distance to ${flag.student_name}: ${(distance * 1000).toFixed(0)}m (status: ${flag.status})`);

      if (distance < PICKUP_THRESHOLD_KM) {
        console.log(`✅ Auto-pickup triggered for ${flag.student_name} (${(distance * 1000).toFixed(0)}m away)`);
        flagsToRemove.push(flag.id);
      }
    });

    // Remove flags for picked up students
    if (flagsToRemove.length > 0) {
      // Call API to mark as boarded/picked_up
      flagsToRemove.forEach(async (flagId) => {
        try {
          const idToken = await currentUser?.getIdToken();
          await fetch("/api/driver/mark-boarded", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              idToken,
              flagId,
            }),
          });
        } catch (error) {
          console.error("Error auto-marking student as boarded:", error);
        }
      });

      // Update local state
      setWaitingFlags((prev) => prev.filter((flag) => !flagsToRemove.includes(flag.id)));

      if (flagsToRemove.length === 1) {
        addToast("🚌 Student picked up!", "success");
      } else {
        addToast(`🚌 ${flagsToRemove.length} students picked up!`, "success");
      }
    }
  }, [tripActive, currentLocation, waitingFlags, currentUser, addToast]);

  // Start trip
  const handleStartTrip = async () => {
    if (!busData || !routeData || !currentUser) return;

    if (busData.status === 'Inactive') {
      addToast("Cannot start trip: Bus is Inactive", "error");
      router.push("/driver");
      return;
    }

    try {
      setLoading(true);

      // ========================================
      // DEVICE SESSION CHECK (Multi-Device Protection)
      // ========================================
      // Check if another device is currently sharing location
      const sessionCheck = await checkDeviceSession(currentUser.uid, 'driver_location_share');
      if (sessionCheck.hasActiveSession && !sessionCheck.isCurrentDevice) {
        // Another device is active - show conflict UI
        setDeviceConflict({
          hasConflict: true,
          otherDeviceId: sessionCheck.otherDeviceId,
          sessionAge: sessionCheck.sessionAge
        });
        setLoading(false);
        addToast('Another device is currently sharing location. Take over or go back.', 'warning');
        return;
      }

      // Register this device as the active broadcaster
      const regResult = await registerDeviceSession(currentUser.uid, 'driver_location_share');
      if (!regResult.success) {
        console.error('Failed to register device session:', regResult.error);
        // Continue anyway - location sharing is critical
      }

      // Reset the manually ended flag (allow active trip checks again)
      manuallyEndedTripRef.current = false;

      // CRITICAL FIX: Set default location BEFORE starting trip to prevent map from appearing broken
      // Use default campus location if no GPS yet
      const defaultLat = 26.1445;
      const defaultLng = 91.7362;
      const initialLocation = currentLocation || {
        lat: defaultLat,
        lng: defaultLng,
        accuracy: 500
      };

      // Set the location immediately if we don't have one yet (prevents map from appearing empty)
      if (!currentLocation) {
        console.log("📍 Setting default location before trip start to prevent empty map");
        setCurrentLocation(initialLocation);
        setMapCenter([initialLocation.lat, initialLocation.lng]);
        setAccuracy(initialLocation.accuracy);
      }

      console.log("🚀 Starting trip with location:", initialLocation);

      // Start location tracking (async - will update with real GPS when ready)
      // GPS will update location when ready
      startLocationTracking();

      const idToken = await currentUser.getIdToken();
      let response;
      try {
        response = await fetch("/api/driver/start-journey-v2", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            idToken,
            busId: busData.busId,
            routeId: routeData.routeId,
          }),
        });
      } catch (networkError) {
        throw new Error("Network error starting trip. Please check your connection.");
      }

      if (!response.ok) {
        // Try to parse error message if possible, otherwise use status text
        let errorMessage;
        let errorCode;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message;
          errorCode = errorData.errorCode;
        } catch (e) {
          errorMessage = `Server error (${response.status}: ${response.statusText})`;
        }

        // Handle 409 conflict - bus is locked by another driver
        if (response.status === 409 || errorCode === 'LOCKED_BY_OTHER') {
          console.log("🔒 Bus is locked by another driver - cannot start trip");
          setBusLockedByOther(true);
          stopLocationTracking();
          addToast("This bus is currently being operated by another driver.", "error");
          return; // Exit early - blocking UI will be shown
        }

        throw new Error(errorMessage || "Failed to start trip");
      }

      // Safe JSON parsing
      const result = await response.json();

      setTripActive(true);
      setTripId(result.tripId);
      addToast("Trip started successfully! 🚀", "success");

      // Re-check active trip to ensure state is synchronized
      setTimeout(async () => {
        try {
          const recheckIdToken = await currentUser.getIdToken();
          const recheckResponse = await fetch("/api/driver/check-active-trip", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${recheckIdToken}`,
            },
            body: JSON.stringify({
              idToken: recheckIdToken,
              busId: busData.busId,
            }),
          });

          const recheckResult = await recheckResponse.json();
          console.log("🔄 Trip state recheck:", recheckResult);

          if (recheckResult.hasActiveTrip) {
            setTripActive(true);
            setTripId(recheckResult.tripData?.tripId || result.tripId);
            console.log("✅ Trip state synchronized");
          }
        } catch (recheckError) {
          console.error("❌ Error rechecking trip state:", recheckError);
        }
      }, 1000); // Wait 1 second for trip to be fully created

      // Broadcast trip started event to all students
      try {
        const broadcastChannel = supabase.channel(`trip_notifications_${busData.busId}`);
        await broadcastChannel.send({
          type: "broadcast",
          event: "trip_started",
          payload: {
            busId: busData.busId,
            routeId: routeData.routeId,
            tripId: result.tripId,
            routeName: routeData.routeName,
            timestamp: Date.now(),
          },
        });
        console.log("📢 Trip started broadcast sent to students");
      } catch (broadcastError) {
        console.warn("⚠️ Failed to broadcast trip start:", broadcastError);
      }

      // Notify students via FCM
      await fetch("/api/driver/notify-students", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          idToken,
          busId: busData.busId,
          routeId: routeData.routeId,
          tripId: result.tripId,
        }),
      });

      console.log("✅ Trip started:", result);
    } catch (error: any) {
      console.error("❌ Error starting trip:", error);
      addToast("Failed to start trip: " + error.message, "error");
      stopLocationTracking();
    } finally {
      setLoading(false);
    }
  };

  // End trip
  const handleEndTrip = async () => {
    if (!busData || !routeData || !currentUser) {
      addToast("Missing required data to end trip", "error");
      return;
    }

    try {
      setLoading(true);
      stopLocationTracking();

      const idToken = await currentUser.getIdToken();
      console.log("🏁 Ending trip with data:", {
        busId: busData.busId,
        routeId: routeData.routeId,
        driverUid: currentUser.uid
      });

      // Add timeout to prevent infinite loading
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      try {
        const response = await fetch("/api/driver/end-journey-v2", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            idToken,
            busId: busData.busId,
            routeId: routeData.routeId,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        let result;
        try {
          const text = await response.text();
          result = text ? JSON.parse(text) : {};
        } catch (e) {
          console.warn("Failed to parse response as JSON", e);
          result = {};
        }

        if (!response.ok) {
          console.error("❌ End trip API failed:", result.error);
          throw new Error(result.error || result.message || `Failed to end trip (${response.status})`);
        }

        // Response is OK
        console.log("✅ End trip API returned success");

        // CRITICAL: Set flag to prevent checkActiveTrip from overriding
        manuallyEndedTripRef.current = true;

        // IMPORTANT: Set states immediately
        setTripActive(false);
        setTripId(null);
        setCurrentLocation(null);
        setWaitingFlags([]);
        setMapCenter([26.1445, 91.7362]);

        // Auto-exit fullscreen when trip ends
        setIsFullScreenMap(false);

        addToast("Trip ended successfully! 🏁", "success");

        // Clear the bus marker
        console.log("🗺️ Clearing map markers and resetting view");

        // Broadcast trip ended event
        const channel = supabase.channel(`bus_location_${busData.busId}`);
        await channel.send({
          type: "broadcast",
          event: "trip_ended",
          payload: { busId: busData.busId, timestamp: Date.now() },
        });
        await supabase.removeChannel(channel);

        console.log("✅ Trip ended - map cleared and broadcast sent");

        // Ensure UI updates by forcing a small delay if needed or just letting React handle it

      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error("Request timed out. Please try again.");
        }
        throw fetchError;
      }

      console.log("✅ Trip ended successfully. Ready for next trip.");

    } catch (error: any) {
      console.error("❌ Error ending trip:", error);
      addToast("Failed to end trip: " + error.message, "error");

      // Even on error, if it was a timeout/network issue, we might want to force stop locally
      // to render the UI usable again. But safer to let user retry.
    } finally {
      // Small delay to ensure state updates propagate before removing loading screen
      setTimeout(() => setLoading(false), 500);
    }
  };

  // Acknowledge waiting flag - updates status but keeps flag visible until pickup
  const handleAcknowledgeFlag = async (flagId: string) => {
    try {
      const idToken = await currentUser?.getIdToken();
      const response = await fetch("/api/driver/ack-flag", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          idToken,
          flagId,
        }),
      });

      if (response.ok) {
        // Update status to acknowledged but DON'T remove from list
        // Flag will be removed when distance closes to near zero
        setWaitingFlags((prev) =>
          prev.map((flag) =>
            flag.id === flagId
              ? { ...flag, status: 'acknowledged' as const }
              : flag
          )
        );
        addToast("Flag acknowledged - student location tracked until pickup", "success");
      }
    } catch (error) {
      console.error("Error acknowledging flag:", error);
    }
  };


  if (loading || swapRequestLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#020817]">
        <PremiumPageLoader
          message="Initiating Real-time Tracking..."
          subMessage="Connecting to GPS and route services..."
        />
      </div>
    );
  }

  // Show message if driver has active (accepted) swap
  if (hasActiveSwapRequest) {
    const formatDateTime = (date: Date | null) => {
      if (!date) return 'N/A';
      return date.toLocaleString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    };

    const formatTimeOnly = (date: Date | null) => {
      if (!date) return 'N/A';
      return date.toLocaleString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    };

    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${swapRole === 'sender' && swapType === 'assignment'
        ? 'bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:from-gray-950 dark:via-green-950/30 dark:to-emerald-950/20'
        : 'bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-gray-950 dark:via-amber-950/30 dark:to-orange-950/20'
        }`}>
        <Card className="max-w-lg w-full border-0 shadow-2xl bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-3xl overflow-hidden">
          {/* Header with gradient - different colors based on role */}
          <div className={`relative p-6 pb-8 ${swapRole === 'sender' && swapType === 'assignment'
            ? 'bg-gradient-to-r from-green-500 via-emerald-500 to-green-600'
            : 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600'
            }`}>
            <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10" />
            <div className="relative flex flex-col items-center text-center">
              {/* Icon */}
              <div className="mb-4 p-4 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 shadow-lg">
                {swapRole === 'sender' && swapType === 'assignment' ? (
                  <CheckCircle className="w-10 h-10 text-white" />
                ) : (
                  <Clock className="w-10 h-10 text-white" />
                )}
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                {swapRole === 'sender' && swapType === 'assignment'
                  ? 'Swap Request Active'
                  : swapType === 'exchange'
                    ? 'Bus Exchange Scheduled'
                    : 'Swap Scheduled'}
              </h1>
              <p className={`text-sm mt-1 font-medium ${swapRole === 'sender' && swapType === 'assignment' ? 'text-green-100' : 'text-amber-100'
                }`}>
                {swapRole === 'sender' && swapType === 'assignment'
                  ? 'Your swap request has been accepted'
                  : swapType === 'exchange'
                    ? 'Waiting for exchange period to begin'
                    : 'Waiting for swap period to begin'}
              </p>
            </div>
          </div>

          <CardContent className="p-6 -mt-4">
            {/* Main Info Card */}
            <div className={`rounded-2xl p-5 border shadow-sm ${swapRole === 'sender' && swapType === 'assignment'
              ? 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-gray-800 dark:to-green-900/20 border-green-200 dark:border-green-800/50'
              : 'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-gray-800 dark:to-amber-900/20 border-amber-200 dark:border-amber-800/50'
              }`}>
              <div className="text-center mb-4">
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  {swapRole === 'sender' && swapType === 'assignment' ? (
                    <>
                      Your swap request has been <span className="font-bold text-green-600 dark:text-green-400">accepted</span>!
                      Another driver will temporarily cover your duty.
                    </>
                  ) : swapType === 'exchange' ? (
                    <>
                      You have a <span className="font-bold text-amber-600 dark:text-amber-400">bus exchange</span> scheduled.
                      Both drivers will swap buses once the exchange period begins.
                    </>
                  ) : (
                    <>
                      You have an <span className="font-bold text-amber-600 dark:text-amber-400">accepted swap</span> that hasn't started yet.
                    </>
                  )}
                </p>
              </div>

              {/* Swap Period Times */}
              {swapPeriodInfo && (
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-green-200 dark:border-green-800/50 text-center shadow-sm">
                    <div className="flex items-center justify-center gap-1.5 mb-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">
                        {swapRole === 'sender' && swapType === 'assignment' ? 'Off-Duty From' : 'Access From'}
                      </span>
                    </div>
                    <p className="text-lg font-bold text-green-600 dark:text-green-400">
                      {formatTimeOnly(swapPeriodInfo.startTime)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {swapPeriodInfo.startTime?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-red-200 dark:border-red-800/50 text-center shadow-sm">
                    <div className="flex items-center justify-center gap-1.5 mb-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full" />
                      <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold">
                        {swapRole === 'sender' && swapType === 'assignment' ? 'Off-Duty Until' : 'Access Until'}
                      </span>
                    </div>
                    <p className="text-lg font-bold text-red-600 dark:text-red-400">
                      {formatTimeOnly(swapPeriodInfo.endTime)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {swapPeriodInfo.endTime?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Info Message - Different based on role */}
            <div className={`mt-4 p-4 rounded-xl border ${swapRole === 'sender' && swapType === 'assignment'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50'
              : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/50'
              }`}>
              <div className="flex gap-3">
                <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${swapRole === 'sender' && swapType === 'assignment' ? 'text-green-500' : 'text-blue-500'
                  }`} />
                <div className={`text-sm ${swapRole === 'sender' && swapType === 'assignment'
                  ? 'text-green-700 dark:text-green-300'
                  : 'text-blue-700 dark:text-blue-300'
                  }`}>
                  <p className="font-medium">
                    {swapRole === 'sender' && swapType === 'assignment'
                      ? 'Duty Coverage'
                      : swapType === 'exchange'
                        ? 'Bus Exchange Info'
                        : 'Live Tracking Access'}
                  </p>
                  <p className={`mt-1 ${swapRole === 'sender' && swapType === 'assignment'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-blue-600 dark:text-blue-400'
                    }`}>
                    {swapRole === 'sender' && swapType === 'assignment' ? (
                      <>
                        The replacement driver will operate your bus during this period.
                        You'll be notified when the swap period ends.
                      </>
                    ) : swapType === 'exchange' ? (
                      <>
                        You and the other driver will exchange buses at <strong>{swapPeriodInfo ? formatTimeOnly(swapPeriodInfo.startTime) : 'the scheduled time'}</strong>.
                        You can then start driving your temporary bus.
                      </>
                    ) : (
                      <>
                        You can start the trip and share your live location once the swap period begins at <strong>{swapPeriodInfo ? formatTimeOnly(swapPeriodInfo.startTime) : 'the scheduled time'}</strong>.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <div className="mt-6">
              <Button
                onClick={() => router.push('/driver/swap-request')}
                className={`w-full h-12 font-bold rounded-xl shadow-lg transition-all active:scale-[0.98] ${swapRole === 'sender' && swapType === 'assignment'
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-green-500/20'
                  : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-amber-500/20'
                  } text-white`}
              >
                View Swap Details
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // =====================================================
  // MULTI-DRIVER LOCK BLOCKING UI
  // Show blocking message if bus is locked by another driver
  // =====================================================
  if (busLockedByOther) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-amber-50 dark:from-gray-950 dark:via-red-950/30 dark:to-orange-950/20 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full border-0 shadow-2xl bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-3xl overflow-hidden pt-0">
          {/* Header with gradient */}
          <div className="relative p-6 pb-8 bg-gradient-to-r from-red-500 via-orange-500 to-amber-500">
            <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10" />
            <div className="relative flex flex-col items-center text-center">
              {/* Icon */}
              <div className="mb-4 p-4 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30 shadow-lg">
                <AlertCircle className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Bus Currently In Use
              </h1>
              <p className="text-sm mt-1 font-medium text-red-100">
                Another driver is operating this bus
              </p>
            </div>
          </div>

          <CardContent className="p-6 -mt-4">
            {/* Main Info Card */}
            <div className="rounded-2xl p-5 border shadow-sm bg-gradient-to-br from-red-50 to-orange-50 dark:from-gray-800 dark:to-red-900/20 border-red-200 dark:border-red-800/50">
              <div className="text-center mb-4">
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  This bus is currently being operated by another driver assigned to the same bus.
                  Please wait until they complete their trip.
                </p>
              </div>

              <div className="flex items-center justify-center gap-4 py-4 border-t border-red-200 dark:border-red-800/50">
                <div className="text-center">
                  <Bus className="w-12 h-12 mx-auto text-red-500 mb-2" />
                  <p className="text-lg font-bold text-red-600 dark:text-red-400">
                    {busData?.busNumber || busData?.busId || 'Bus'}
                  </p>
                  <p className="text-xs text-gray-500">Currently Active</p>
                </div>
              </div>

              {lockInfo?.since && (
                <div className="text-center mt-4 p-3 bg-red-100 dark:bg-red-900/30 rounded-xl">
                  <p className="text-xs text-red-600 dark:text-red-400">
                    Trip started at: {new Date(lockInfo.since).toLocaleString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                      day: 'numeric',
                      month: 'short'
                    })}
                  </p>
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800/50">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                    Auto-Refresh Enabled
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    This page will automatically check every 10 seconds. Once the other driver ends their trip,
                    you&apos;ll be able to start yours.
                  </p>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <div className="mt-6">
              <Button
                onClick={() => router.push('/driver')}
                variant="outline"
                className="w-full h-12 font-bold rounded-xl border-2 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Go Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show warning if another device is actively sharing location
  if (deviceConflict.hasConflict && tripActive) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 dark:from-gray-950 dark:via-amber-950 dark:to-red-950 flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full border-0 shadow-2xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl">
          <CardHeader className="text-center space-y-4 pb-6">
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-400 to-orange-600 rounded-full blur-2xl opacity-30 animate-pulse"></div>
                <div className="relative p-6 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full shadow-xl">
                  <AlertCircle className="w-16 h-16 text-white" />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                Multi-Device Conflict Detected
              </CardTitle>
              <p className="text-lg text-muted-foreground">
                Location is being shared from another device
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-6 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-2xl border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-amber-100 dark:bg-amber-900/40 rounded-xl">
                  <Bus className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="font-semibold text-foreground">Another Device is Active</h3>
                  <p className="text-sm text-muted-foreground">
                    Your account is currently sharing live location from <strong className="text-amber-600 dark:text-amber-400">another device</strong>.
                    To prevent sending conflicting location data to students, only one device can broadcast at a time.
                  </p>
                  {deviceConflict.sessionAge && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Session age: {Math.round((deviceConflict.sessionAge || 0) / 1000)}s ago
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center">
                You can either go back to the dashboard, or take over location sharing on this device (the other device will stop broadcasting).
              </p>

              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleTakeOverSession}
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
                >
                  <Activity className="w-4 h-4 mr-2" />
                  Take Over on This Device
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/driver')}
                  className="w-full"
                >
                  Go Back to Dashboard
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show message if no bus/route assigned (Reserved driver)
  if (!busData || !routeData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-gray-950 dark:via-emerald-950 dark:to-teal-950 flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full border-0 shadow-2xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl">
          <CardHeader className="text-center space-y-4 pb-6">
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-600 rounded-full blur-2xl opacity-30 animate-pulse"></div>
                <div className="relative p-6 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full shadow-xl">
                  <svg
                    className="w-16 h-16 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                    />
                  </svg>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                Reserved Driver
              </CardTitle>
              <p className="text-lg text-muted-foreground">
                You're available for assignment
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl border border-green-200 dark:border-green-800">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-green-100 dark:bg-green-900/40 rounded-xl">
                  <AlertCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="space-y-2 flex-1">
                  <h3 className="font-semibold text-foreground">No Active Bus Assignment</h3>
                  <p className="text-sm text-muted-foreground">
                    You are currently a <strong className="text-green-600 dark:text-green-400">Reserved Driver</strong> and not assigned to any bus route.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-semibold text-foreground flex items-center gap-2">
                <span className="p-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </span>
                How to Get Assigned
              </h4>
              <div className="space-y-3 pl-9">
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-blue-500 flex-shrink-0"></div>
                  <p className="text-sm text-muted-foreground">
                    <strong>Accept a Swap Request:</strong> Another driver can request to swap their bus duty with you
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-blue-500 flex-shrink-0"></div>
                  <p className="text-sm text-muted-foreground">
                    <strong>View Incoming Requests:</strong> Check your swap requests page for pending assignments
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-blue-500 flex-shrink-0"></div>
                  <p className="text-sm text-muted-foreground">
                    <strong>Start Driving:</strong> Once assigned, you can start tracking trips on this page
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => router.push('/driver/swap-request')}
                className="flex-1 h-12 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl transition-all duration-300 text-base font-semibold"
              >
                <span className="mr-2">📥</span>
                View Incoming Requests
              </Button>
              <Button
                onClick={() => router.push('/driver')}
                variant="outline"
                className="flex-1 h-12 border-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-300"
              >
                Back to Dashboard
              </Button>
            </div>

            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-center text-muted-foreground">
                Need help? Contact your supervisor or administrator
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-background pb-24 md:pb-6">
      {/* WAIT REQUEST OVERLAY */}
      {activeWaitRequest && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
          <Card className="max-w-md w-full border-0 shadow-2xl bg-white dark:bg-gray-900 rounded-3xl overflow-hidden relative">
            {sendingResponse && (
              <div className="absolute inset-0 bg-white/50 dark:bg-black/50 z-10 flex items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
              </div>
            )}

            <div className="relative p-6 pb-8 bg-gradient-to-r from-purple-600 to-blue-600">
              <div className="absolute inset-0 bg-[url('/noise.png')] opacity-20" />

              {/* Animated Timer Ring */}
              <div className="absolute top-4 right-4 w-12 h-12 rounded-full border-4 border-white/30 flex items-center justify-center">
                <span className="text-xl font-bold text-white">{waitRequestTimer}</span>
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  <circle
                    className="text-white"
                    strokeWidth="4"
                    strokeDasharray={100}
                    strokeDashoffset={100 - (waitRequestTimer / 10) * 100}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r="20" cx="24" cy="24"
                  />
                </svg>
              </div>

              <div className="relative z-10 mt-4">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-lg mb-4 mx-auto animate-bounce">
                  <img
                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${activeWaitRequest.studentName}`}
                    alt={activeWaitRequest.studentName}
                    className="w-12 h-12 rounded-full"
                  />
                </div>
                <h2 className="text-2xl font-bold text-center text-white mb-1">
                  {activeWaitRequest.studentName}
                </h2>
                <p className="text-blue-100 text-center text-sm font-medium uppercase tracking-wide">
                  Missed Bus • <span className="text-white font-bold">{activeWaitRequest.stopName}</span>
                </p>
                <p className="text-white/80 text-center text-xs mt-2">
                  Bus is nearby! Waiting for you to accept...
                </p>
              </div>
            </div>

            <CardContent className="p-6 pt-8 -mt-6 bg-white dark:bg-gray-900 rounded-t-3xl relative z-0">
              <p className="text-center text-gray-600 dark:text-gray-400 mb-6 font-medium">
                Has stopped near {activeWaitRequest.stopName}. Can you wait 2 minutes?
              </p>

              <div className="grid grid-cols-2 gap-4">
                <Button
                  onClick={() => handleRespondToWaitRequest('rejected')}
                  variant="outline"
                  className="h-14 rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 font-bold text-lg"
                >
                  Reject
                </Button>
                <Button
                  onClick={() => handleRespondToWaitRequest('accepted')}
                  className="h-14 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold text-lg shadow-lg shadow-green-500/30"
                >
                  Accept
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-8">
        {/* Enhanced Live Location Sharing Card */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-600 p-1 animate-fade-in">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-600 opacity-50 blur-3xl" />
          <div className="relative bg-background/95 backdrop-blur-xl rounded-3xl p-6 md:p-8 lg:p-10">
            {/* Desktop Layout */}
            <div className="hidden md:flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg animate-float">
                  <Bus className="h-5 w-5 md:h-6 md:w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">Live Location Sharing</h1>
                  <p className="text-muted-foreground text-sm md:text-base mt-1">Share your bus location in real-time</p>
                </div>
              </div>
              <Badge className={`px-4 py-2 text-sm md:text-lg font-semibold ${tripActive
                ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white'
                : 'bg-gradient-to-r from-gray-500 to-gray-600 text-white'
                }`}>
                {tripActive ? "Trip Active" : "Trip Inactive"}
              </Badge>
            </div>

            {/* Mobile Layout - Enhanced Premium Design */}
            <div className="md:hidden space-y-6">
              {/* Header Section */}
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg animate-float">
                  <Bus className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">Live Location Sharing</h1>
                  <p className="text-muted-foreground text-sm mt-1">Share your bus location in real-time</p>
                </div>
              </div>

              {/* Status Section - Left for Mobile */}
              <div className="flex justify-start">
                <Badge className={`px-6 py-3 text-base font-semibold rounded-full shadow-lg ${tripActive
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white'
                  : 'bg-gradient-to-r from-gray-500 to-gray-600 text-white'
                  }`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${tripActive ? 'bg-green-300 animate-pulse' : 'bg-gray-300'}`}></div>
                    {tripActive ? "Trip Active" : "Trip Inactive"}
                  </div>
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Trip Status Card - Enhanced Premium Design */}
        <Card className="group relative overflow-hidden p-0 gap-0 bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 border-gray-100 dark:border-gray-800 shadow-lg hover:shadow-xl transition-all duration-300">
          <CardHeader className="bg-gradient-to-r from-blue-100/60 to-indigo-100/60 dark:from-blue-900/40 dark:to-indigo-900/40 px-6 py-4">
            <CardTitle className="flex items-center gap-3 text-foreground group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 group-hover:bg-blue-200 dark:group-hover:bg-blue-800/50 transition-colors">
                <Navigation className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              Trip Control
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {/* Enhanced Bus Info Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              {/* Bus Number Card */}
              <div className="group/item bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 rounded-xl p-3 md:p-4 border border-blue-200/50 dark:border-blue-700/30 hover:shadow-md transition-all duration-300">
                <div className="flex items-center gap-2 mb-1 md:mb-2">
                  <div className="p-1.5 rounded-lg bg-blue-500/10">
                    <Bus className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <p className="text-[10px] md:text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide truncate">Bus Number</p>
                </div>
                <p className="text-xs md:text-sm font-bold text-gray-900 dark:text-white">{busData.busNumber}</p>
              </div>

              {/* Route Card */}
              <div className="group/item bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-800/10 rounded-xl p-3 md:p-4 border border-purple-200/50 dark:border-purple-700/30 hover:shadow-md transition-all duration-300">
                <div className="flex items-center gap-2 mb-1 md:mb-2">
                  <div className="p-1.5 rounded-lg bg-purple-500/10">
                    <MapPin className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <p className="text-[10px] md:text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide truncate">Route</p>
                </div>
                <p className="text-xs md:text-sm font-bold text-gray-900 dark:text-white">{routeData.routeName}</p>
              </div>

              {/* Speed Card */}
              <div className="group/item bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-900/20 dark:to-green-800/10 rounded-xl p-3 md:p-4 border border-green-200/50 dark:border-green-700/30 hover:shadow-md transition-all duration-300">
                <div className="flex items-center gap-2 mb-1 md:mb-2">
                  <div className="p-1.5 rounded-lg bg-green-500/10">
                    <Activity className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                  </div>
                  <p className="text-[10px] md:text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide truncate">Speed</p>
                </div>
                <p className="text-xs md:text-sm font-bold text-gray-900 dark:text-white">{(speed * 3.6).toFixed(1)} km/h</p>
              </div>

              {/* GPS Accuracy Card */}
              <div className="group/item bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-900/20 dark:to-orange-800/10 rounded-xl p-3 md:p-4 border border-orange-200/50 dark:border-orange-700/30 hover:shadow-md transition-all duration-300">
                <div className="flex items-center gap-2 mb-1 md:mb-2">
                  <div className="p-1.5 rounded-lg bg-orange-500/10">
                    <Navigation className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <p className="text-[10px] md:text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wide truncate">GPS Accuracy</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className={`text-xs md:text-sm font-bold ${accuracy > 100 ? 'text-red-600 dark:text-red-400' : accuracy > 50 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`}>
                    {accuracy.toFixed(1)}m
                  </p>
                  <span className={`inline-block w-2 h-2 rounded-full ${tripActive ? 'animate-pulse' : ''} ${accuracy <= 20 ? 'bg-green-500 dark:bg-green-400' :
                    accuracy <= 50 ? 'bg-blue-500 dark:bg-blue-400' :
                      accuracy <= 100 ? 'bg-yellow-500 dark:bg-yellow-400' : 'bg-red-500 dark:bg-red-400'
                    }`} title={
                      accuracy <= 20 ? 'Excellent GPS signal' :
                        accuracy <= 50 ? 'Good GPS signal' :
                          accuracy <= 100 ? 'Fair GPS signal' :
                            'Poor GPS signal'
                    } />
                </div>
              </div>
            </div>

            {/* Enhanced Trip Controls */}
            <div className="flex gap-4">
              {!tripActive ? (
                <Button
                  onClick={handleStartTrip}
                  disabled={loading}
                  className="group relative flex-1 bg-gradient-to-r from-green-500 via-emerald-500 to-green-600 hover:from-green-600 hover:via-emerald-600 hover:to-green-700 text-white font-bold py-6 text-lg shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] rounded-xl overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative flex items-center justify-center gap-3">
                    <div className="p-1 rounded-full bg-white/20 group-hover:bg-white/30 transition-colors duration-300">
                      <PlayCircle className="h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                    </div>
                    <span className="tracking-wide">Start Trip</span>
                  </div>
                </Button>
              ) : (
                <Button
                  onClick={handleEndTrip}
                  disabled={loading}
                  className="group relative flex-1 bg-gradient-to-r from-red-500 via-red-600 to-red-700 hover:from-red-600 hover:via-red-700 hover:to-red-800 text-white font-bold py-6 text-lg shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-[1.02] rounded-xl overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative flex items-center justify-center gap-3">
                    <div className="p-1 rounded-full bg-white/20 group-hover:bg-white/30 transition-colors duration-300">
                      <StopCircle className="h-5 w-5 group-hover:scale-110 transition-transform duration-300" />
                    </div>
                    <span className="tracking-wide">End Trip</span>
                  </div>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Waiting Flags */}
        {waitingFlags.length > 0 && (
          <div className="space-y-2 animate-slide-up">
            <h3 className="text-sm font-semibold text-muted-foreground ml-1 flex items-center gap-2">
              <Flag className="h-4 w-4 text-orange-500" />
              Waiting Students ({waitingFlags.length})
            </h3>
            {waitingFlags
              .map((flag) => {
                // Support both new and legacy coordinate fields
                const targetLat = flag.stop_lat || flag.lat;
                const targetLng = flag.stop_lng || flag.lng;

                // Calculate distance if driver location is available
                if (currentLocation && currentLocation.lat && currentLocation.lng && targetLat && targetLng) {
                  // Haversine formula for distance calculation
                  const R = 6371; // Radius of earth in km
                  const dLat = (targetLat - currentLocation.lat) * Math.PI / 180;
                  const dLon = (targetLng - currentLocation.lng) * Math.PI / 180;
                  const a =
                    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(currentLocation.lat * Math.PI / 180) * Math.cos(targetLat * Math.PI / 180) *
                    Math.sin(dLon / 2) * Math.sin(dLon / 2);
                  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                  const distance = R * c; // Distance in km
                  return { ...flag, distance };
                }
                return { ...flag, distance: undefined };
              })
              .sort((a, b) => (a.distance || 999) - (b.distance || 999)) // Sort by distance
              .map((flag) => (
                <div key={flag.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-xl border border-orange-100 dark:border-orange-900/50 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center text-orange-600 dark:text-orange-400 font-bold text-xs ring-2 ring-white dark:ring-gray-800">
                      {flag.student_name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{flag.student_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{flag.distance ? `${(flag.distance * 1000).toFixed(0)}m away` : 'Waiting'}</span>
                        <span>•</span>
                        <span>{flag.stop_name || "Custom Stop"}</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAcknowledgeFlag(flag.id)}
                    className="h-8 text-xs bg-orange-50 text-orange-700 hover:bg-orange-100 hover:text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:hover:bg-orange-900/40 dark:border-orange-800"
                  >
                    Acknowledge
                  </Button>
                </div>
              ))}
          </div>
        )}

        {/* Uber-like Full Screen Map */}
        <div className={`transition-all duration-300 shadow-2xl overflow-hidden ${isFullScreenMap
          ? "fixed inset-0 z-[10000] h-[100dvh] w-screen rounded-none"
          : "h-[450px] md:h-[calc(100vh-20rem)] md:min-h-[600px] rounded-3xl"
          } ${isScannerOpen ? 'blur-sm opacity-50 pointer-events-none' : ''}`}>
          <UberLikeDriverMap
            driverLocation={currentLocation}
            waitingStudents={waitingFlags.map(flag => {
              // Support both new and legacy coordinate fields
              const targetLat = flag.stop_lat || flag.lat;
              const targetLng = flag.stop_lng || flag.lng;

              // Calculate distance for sorting and display
              let distance = undefined;
              if (currentLocation && targetLat && targetLng) {
                const R = 6371; // Radius of earth in km
                const dLat = (targetLat - currentLocation.lat) * Math.PI / 180;
                const dLon = (targetLng - currentLocation.lng) * Math.PI / 180;
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(currentLocation.lat * Math.PI / 180) * Math.cos(targetLat * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                distance = R * c;
              }

              return {
                ...flag,
                distance,
                stop_lat: targetLat,
                stop_lng: targetLng,
                accuracy: 50, // Default accuracy for student markers
                stop_name: flag.stop_name || undefined,
                status: flag.status as 'waiting' | 'acknowledged' | 'boarded' | 'raised'
              };
            })
              .filter(f => f.stop_lat && f.stop_lng)
              .sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999))}
            tripActive={tripActive}
            busNumber={busData?.busNumber}
            routeName={routeData?.routeName}
            speed={speed}
            accuracy={accuracy}
            onQrScan={() => setIsScannerOpen(true)}
            onAcknowledgeStudent={handleAcknowledgeFlag}
            onMarkBoarded={async (studentId) => {
              // Mark student as boarded
              try {
                const idToken = await currentUser?.getIdToken();
                const response = await fetch("/api/driver/mark-boarded", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${idToken}`,
                  },
                  body: JSON.stringify({
                    idToken,
                    flagId: studentId,
                  }),
                });

                if (response.ok) {
                  setWaitingFlags((prev) => prev.filter((flag) => flag.id !== studentId));
                  addToast("Student marked as boarded", "success");
                }
              } catch (error) {
                console.error("Error marking student as boarded:", error);
                addToast("Failed to mark student as boarded", "error");
              }
            }}
            isFullScreen={isFullScreenMap}
            onToggleFullScreen={() => setIsFullScreenMap(!isFullScreenMap)}
            showStatsOnMobile={isFullScreenMap}
            primaryActionLabel={tripActive ? "End Trip" : "Start Trip"}
            primaryActionColor={tripActive ? "red" : "green"}
            onPrimaryAction={tripActive ? handleEndTrip : handleStartTrip}
          />
        </div>
      </div>

      {/* Browser Compatibility Banner */}
      <BrowserCompatibilityBanner />

      {/* PWA Install Prompt */}
      <PWAInstallPrompt />

      {/* Notification Permission Banner */}
      <NotificationPermissionBanner />

      {/* Fullscreen overlay to cover navbar when scanner is open */}
      {isScannerOpen && isFullScreenMap && (
        <div className="fixed inset-0 z-[10001] bg-black/60 backdrop-blur-sm pointer-events-none" />
      )}

      <BusPassScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={(result) => {
          // Toast removed as per request
        }}
      />
    </div>
  );
}
