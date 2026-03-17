"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Bus, MapPin, Clock, Flag, PlayCircle, StopCircle, AlertCircle,
    Navigation, Activity, ExternalLink, Locate, Wifi, WifiOff,
    Eye, EyeOff, Users, CheckCircle, Loader2
} from "lucide-react";
import { supabase } from "@/lib/supabase-client";
import { getDriverById, getBusById, getRouteById } from "@/lib/dataService";
import { useToast } from "@/contexts/toast-context";
import {
    checkDeviceSession,
    registerDeviceSession,
    releaseDeviceSession,
} from "@/lib/session-device-service";

const GoogleMapView = dynamic(() => import("@/components/GoogleMapView"), {
    ssr: false,
    loading: () => (
        <div className="h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-2xl animate-pulse flex items-center justify-center">
            <span className="text-sm text-gray-500 font-medium">Loading map...</span>
        </div>
    ),
});



const GMAP_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
const DEFAULT_CENTER = {
    lat: parseFloat(process.env.NEXT_PUBLIC_DEFAULT_MAP_CENTER_LAT || "26.1440"),
    lng: parseFloat(process.env.NEXT_PUBLIC_DEFAULT_MAP_CENTER_LNG || "91.7360"),
};

// ─── Helpers ────────────────────────────────────────────────
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── SVG Markers ────────────────────────────────────────────
const DRIVER_MARKER_SVG = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg width="52" height="52" viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg">
    <circle cx="26" cy="26" r="24" fill="#7C3AED" stroke="white" stroke-width="3"/>
    <text x="26" y="33" font-size="24" fill="white" text-anchor="middle">🚌</text>
  </svg>`
)}`;

const STUDENT_MARKER_SVG = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="18" fill="#F97316" stroke="white" stroke-width="3"/>
    <text x="20" y="26" font-size="18" fill="white" text-anchor="middle">🚩</text>
  </svg>`
)}`;

// ═══════════════════════════════════════════════════════════
export default function DriverGMapPage() {
    const { currentUser, userData, loading: authLoading, signOut } = useAuth();
    const router = useRouter();
    const { addToast } = useToast();

    // ─── Core State ───────────────────────────────────────────
    const [driverData, setDriverData] = useState<any>(null);
    const [busData, setBusData] = useState<any>(null);
    const [routeData, setRouteData] = useState<any>(null);
    const [dataLoading, setDataLoading] = useState(true);
    const [tripActive, setTripActive] = useState(false);
    const [tripId, setTripId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // ─── Location ─────────────────────────────────────────────
    const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
    const [speed, setSpeed] = useState(0);
    const [accuracy, setAccuracy] = useState(0);
    const watchIdRef = useRef<number | null>(null);

    // ─── Map ──────────────────────────────────────────────────
    const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [followDriver, setFollowDriver] = useState(true);

    // ─── Waiting Students ─────────────────────────────────────
    const [waitingFlags, setWaitingFlags] = useState<any[]>([]);

    // ─── Broadcasting ─────────────────────────────────────────
    const broadcastIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const broadcastCountRef = useRef(0);
    const channelRef = useRef<any>(null);
    const manuallyEndedRef = useRef(false);

    // ─── Multi-device ─────────────────────────────────────────
    const [busLockedByOther, setBusLockedByOther] = useState(false);
    const [deviceConflict, setDeviceConflict] = useState<{ hasConflict: boolean; otherDeviceId?: string; sessionAge?: number }>({ hasConflict: false });

    // ─── Auth Guard ───────────────────────────────────────────
    useEffect(() => {
        if (authLoading) return;
        if (!currentUser?.uid || userData?.role !== "driver") router.push("/login");
    }, [authLoading, currentUser, userData, router]);

    // ─── Fetch Data ───────────────────────────────────────────
    useEffect(() => {
        if (authLoading || !currentUser?.uid || userData?.role !== "driver") return;
        const fetchData = async () => {
            try {
                const driver = await getDriverById(currentUser.uid);
                if (!driver) { addToast("Driver account not found", "error"); router.push("/login"); return; }
                setDriverData(driver);
                if (driver.assignedBusId || driver.busId) {
                    const bus = await getBusById(driver.assignedBusId || driver.busId);
                    if (bus) setBusData(bus);
                }
                if (driver.assignedRouteId || driver.routeId) {
                    const route = await getRouteById(driver.assignedRouteId || driver.routeId);
                    if (route) setRouteData(route);
                }
            } catch (err) {
                console.error("Fetch error:", err);
                addToast("Failed to load driver data", "error");
            } finally {
                setDataLoading(false);
            }
        };
        fetchData();
    }, [authLoading, currentUser, userData, router, addToast, signOut]);

    // ─── Check active trip on load ────────────────────────────
    useEffect(() => {
        if (!currentUser || !busData?.busId) return;
        const check = async () => {
            try {
                const idToken = await currentUser.getIdToken();
                const res = await fetch("/api/driver/check-active-trip", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                    body: JSON.stringify({ idToken, busId: busData.busId }),
                });
                const data = await res.json();
                if (data.hasActiveTrip && !manuallyEndedRef.current) {
                    setTripActive(true);
                    setTripId(data.tripData?.tripId || null);
                    startLocationTracking();
                    startBroadcasting();
                }
            } catch { }
        };
        check();
    }, [currentUser, busData?.busId]);

    // ─── GPS Tracking ─────────────────────────────────────────
    const startLocationTracking = useCallback(() => {
        if (watchIdRef.current !== null || !navigator.geolocation) return;
        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy || 0 };
                setCurrentLocation(loc);
                setSpeed(pos.coords.speed || 0);
                setAccuracy(pos.coords.accuracy || 0);
                if (followDriver) setMapCenter({ lat: loc.lat, lng: loc.lng });
            },
            (err) => console.error("GPS error:", err),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    }, [followDriver]);

    const stopLocationTracking = useCallback(() => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
    }, []);

    // ─── Location Broadcasting ────────────────────────────────
    const startBroadcasting = useCallback(() => {
        if (broadcastIntervalRef.current || !busData?.busId) return;

        // Create persistent channel
        if (!channelRef.current) {
            channelRef.current = supabase.channel(`bus_location_${busData.busId}`, {
                config: { broadcast: { self: false } },
            });
            channelRef.current.subscribe();
        }

        broadcastIntervalRef.current = setInterval(async () => {
            if (!currentLocation || !busData || !currentUser) return;
            broadcastCountRef.current += 1;
            const shouldSaveDB = broadcastCountRef.current % 15 === 0;

            // Always broadcast realtime
            try {
                await channelRef.current?.send({
                    type: "broadcast",
                    event: "bus_location_update",
                    payload: {
                        busId: busData.busId,
                        driverUid: currentUser.uid,
                        lat: currentLocation.lat,
                        lng: currentLocation.lng,
                        accuracy: accuracy,
                        speed: speed || 0,
                        heading: 0,
                        ts: new Date().toISOString(),
                    },
                });
            } catch (e) { console.warn("Broadcast error:", e); }

            // Save to DB periodically
            if (shouldSaveDB) {
                try {
                    const idToken = await currentUser.getIdToken();
                    await fetch("/api/location/update", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                        body: JSON.stringify({
                            idToken, busId: busData.busId, routeId: routeData?.routeId,
                            lat: currentLocation.lat, lng: currentLocation.lng,
                            accuracy, speed, heading: 0, timestamp: Date.now(), tripId,
                        }),
                    });
                } catch { }
            }
        }, 2000);
    }, [busData?.busId, currentLocation, currentUser, accuracy, speed, routeData?.routeId, tripId]);

    const stopBroadcasting = useCallback(() => {
        if (broadcastIntervalRef.current) {
            clearInterval(broadcastIntervalRef.current);
            broadcastIntervalRef.current = null;
        }
        broadcastCountRef.current = 0;
    }, []);

    // Restart broadcasting when location updates
    useEffect(() => {
        if (tripActive && currentLocation && !broadcastIntervalRef.current) startBroadcasting();
    }, [tripActive, currentLocation, startBroadcasting]);

    // ─── Waiting Flags Subscription ───────────────────────────
    useEffect(() => {
        if (!busData?.busId || !tripActive) return;
        // Initial fetch
        supabase.from("waiting_flags").select("*").eq("bus_id", busData.busId).in("status", ["waiting", "raised", "acknowledged"])
            .then(({ data }) => { if (data) setWaitingFlags(data); });

        const ch = supabase.channel(`gmap_wf_driver_${busData.busId}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "waiting_flags", filter: `bus_id=eq.${busData.busId}` }, (p) => {
                if (p.eventType === "INSERT" && ["waiting", "raised"].includes((p.new as any).status)) {
                    setWaitingFlags((prev) => {
                        if (prev.find((f) => f.id === (p.new as any).id)) return prev;
                        addToast(`🚩 ${(p.new as any).student_name || "Student"} is waiting!`, "info");
                        return [...prev, p.new as any];
                    });
                } else if (p.eventType === "UPDATE") {
                    const status = (p.new as any).status;
                    if (["boarded", "cancelled", "removed", "picked_up"].includes(status)) {
                        setWaitingFlags((prev) => prev.filter((f) => f.id !== (p.new as any).id));
                    } else {
                        setWaitingFlags((prev) => prev.map((f) => (f.id === (p.new as any).id ? { ...f, ...(p.new as any) } : f)));
                    }
                } else if (p.eventType === "DELETE") {
                    setWaitingFlags((prev) => prev.filter((f) => f.id !== (p.old as any).id));
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(ch); };
    }, [busData?.busId, tripActive, addToast]);

    // ─── Auto-pickup (within 50m) ─────────────────────────────
    useEffect(() => {
        if (!tripActive || !currentLocation || waitingFlags.length === 0) return;
        const toRemove: string[] = [];
        waitingFlags.forEach((f) => {
            const fLat = f.stop_lat || f.lat;
            const fLng = f.stop_lng || f.lng;
            if (!fLat || !fLng) return;
            const dist = haversine(currentLocation.lat, currentLocation.lng, fLat, fLng);
            if (dist < 0.05) toRemove.push(f.id);
        });
        if (toRemove.length > 0) {
            toRemove.forEach(async (flagId) => {
                try {
                    const idToken = await currentUser?.getIdToken();
                    await fetch("/api/driver/mark-boarded", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                        body: JSON.stringify({ idToken, flagId }),
                    });
                } catch { }
            });
            setWaitingFlags((prev) => prev.filter((f) => !toRemove.includes(f.id)));
            addToast(`🚌 ${toRemove.length} student(s) picked up!`, "success");
        }
    }, [tripActive, currentLocation, waitingFlags, currentUser, addToast]);

    // ─── Wake Lock ────────────────────────────────────────────
    useEffect(() => {
        let wl: any = null;
        const req = async () => { try { if ("wakeLock" in navigator) wl = await (navigator as any).wakeLock.request("screen"); } catch { } };
        if (tripActive || isFullScreen) req();
        const vis = async () => { if (document.visibilityState === "visible" && tripActive) await req(); };
        document.addEventListener("visibilitychange", vis);
        return () => { document.removeEventListener("visibilitychange", vis); wl?.release().catch(() => { }); };
    }, [tripActive, isFullScreen]);

    // ─── Cleanup ──────────────────────────────────────────────
    useEffect(() => {
        return () => {
            stopLocationTracking();
            stopBroadcasting();
            if (channelRef.current) supabase.removeChannel(channelRef.current);
        };
    }, [stopLocationTracking, stopBroadcasting]);

    // ─── START TRIP ───────────────────────────────────────────
    const handleStartTrip = async () => {
        if (!busData || !routeData || !currentUser) return;
        if (busData.status === "Inactive") { addToast("Bus is inactive", "error"); return; }

        try {
            setLoading(true);

            // Multi-device check
            const sessionCheck = await checkDeviceSession(currentUser.uid, "driver_location_share");
            if (sessionCheck.hasActiveSession && !sessionCheck.isCurrentDevice) {
                setDeviceConflict({ hasConflict: true, otherDeviceId: sessionCheck.otherDeviceId, sessionAge: sessionCheck.sessionAge });
                setLoading(false);
                addToast("Another device is active. Take over or go back.", "warning");
                return;
            }
            await registerDeviceSession(currentUser.uid, "driver_location_share");

            manuallyEndedRef.current = false;

            // Default location fallback
            if (!currentLocation) {
                setCurrentLocation({ lat: DEFAULT_CENTER.lat, lng: DEFAULT_CENTER.lng, accuracy: 500 });
                setMapCenter(DEFAULT_CENTER);
            }

            startLocationTracking();

            const idToken = await currentUser.getIdToken();
            const response = await fetch("/api/driver/start-journey-v2", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ idToken, busId: busData.busId, routeId: routeData.routeId }),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                if (response.status === 409 || errData.errorCode === "LOCKED_BY_OTHER") {
                    setBusLockedByOther(true);
                    stopLocationTracking();
                    addToast("Bus locked by another driver", "error");
                    return;
                }
                throw new Error(errData.error || "Failed to start trip");
            }

            const result = await response.json();
            setTripActive(true);
            setTripId(result.tripId);
            addToast("Trip started! 🚀", "success");

            startBroadcasting();

            // Broadcast trip_started to students
            try {
                const bc = supabase.channel(`trip_notifications_${busData.busId}`);
                await bc.httpSend('trip_started', {
                    busId: busData.busId, routeId: routeData.routeId, tripId: result.tripId, routeName: routeData.routeName, timestamp: Date.now(),
                });
            } catch { }

            // FCM notifications are sent automatically by start-journey-v2

        } catch (err: any) {
            console.error("Start trip error:", err);
            addToast("Failed to start trip: " + err.message, "error");
            stopLocationTracking();
        } finally {
            setLoading(false);
        }
    };

    // ─── END TRIP ─────────────────────────────────────────────
    const handleEndTrip = async () => {
        if (!busData || !routeData || !currentUser) return;
        try {
            setLoading(true);
            stopLocationTracking();
            stopBroadcasting();

            const idToken = await currentUser.getIdToken();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const response = await fetch("/api/driver/end-journey-v2", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ idToken, busId: busData.busId, routeId: routeData.routeId }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(errText || "Failed to end trip");
            }

            manuallyEndedRef.current = true;
            setTripActive(false);
            setTripId(null);
            setCurrentLocation(null);
            setWaitingFlags([]);
            setMapCenter(DEFAULT_CENTER);
            setIsFullScreen(false);
            addToast("Trip ended! 🏁", "success");

            // Broadcast trip ended
            try {
                const ch = supabase.channel(`bus_location_${busData.busId}`);
                await ch.httpSend('trip_ended', { busId: busData.busId, timestamp: Date.now() });
            } catch { }

            // Release device session
            try { await releaseDeviceSession(currentUser.uid, "driver_location_share"); } catch { }

        } catch (err: any) {
            addToast("Failed to end trip: " + err.message, "error");
        } finally {
            setTimeout(() => setLoading(false), 500);
        }
    };

    // ─── Acknowledge Flag ─────────────────────────────────────
    const handleAckFlag = async (flagId: string) => {
        try {
            const idToken = await currentUser?.getIdToken();
            const res = await fetch("/api/driver/ack-flag", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ idToken, flagId }),
            });
            if (res.ok) {
                setWaitingFlags((prev) => prev.map((f) => (f.id === flagId ? { ...f, status: "acknowledged" } : f)));
                addToast("Flag acknowledged ✓", "success");
            }
        } catch { addToast("Failed to acknowledge", "error"); }
    };

    // ─── Mark Boarded ─────────────────────────────────────────
    const handleMarkBoarded = async (flagId: string) => {
        try {
            const idToken = await currentUser?.getIdToken();
            const res = await fetch("/api/driver/mark-boarded", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({ idToken, flagId }),
            });
            if (res.ok) {
                setWaitingFlags((prev) => prev.filter((f) => f.id !== flagId));
                addToast("Student boarded ✓", "success");
            }
        } catch { addToast("Failed to mark boarded", "error"); }
    };

    // ─── Take Over Session ────────────────────────────────────
    const handleTakeOver = async () => {
        if (!currentUser) return;
        await registerDeviceSession(currentUser.uid, "driver_location_share");
        setDeviceConflict({ hasConflict: false });
        addToast("Session taken over!", "success");
    };

    // ─── Build Map Markers ────────────────────────────────────
    const markers: any[] = [];
    if (currentLocation) {
        markers.push({
            id: "driver",
            lat: currentLocation.lat,
            lng: currentLocation.lng,
            title: `Bus ${busData?.busNumber || ""}`,
            iconUrl: DRIVER_MARKER_SVG,
            iconSize: 52,
            zIndex: 10,
        });
    }
    waitingFlags.forEach((f) => {
        const fLat = f.stop_lat || f.lat;
        const fLng = f.stop_lng || f.lng;
        if (fLat && fLng) {
            markers.push({
                id: `flag_${f.id}`,
                lat: fLat,
                lng: fLng,
                title: f.student_name || "Student",
                iconUrl: STUDENT_MARKER_SVG,
                iconSize: 40,
                zIndex: 5,
            });
        }
    });

    // ═══════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════

    if (authLoading || dataLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900">
                <div className="text-center space-y-6">
                    <div className="relative p-4 bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-600 rounded-2xl shadow-2xl">
                        <Bus className="h-10 w-10 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Loading Driver Panel</h3>
                    <div className="w-64 mx-auto">
                        <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full animate-pulse" style={{ width: "70%" }} />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ─── Bus Locked ───────────────────────────────────────────
    if (busLockedByOther) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-amber-50 dark:from-gray-950 dark:via-red-950/30 dark:to-orange-950/20 flex items-center justify-center p-4">
                <Card className="max-w-lg w-full border-0 shadow-2xl bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl rounded-3xl overflow-hidden pt-0">
                    <div className="p-6 pb-8 bg-gradient-to-r from-red-500 via-orange-500 to-amber-500 text-center">
                        <AlertCircle className="w-12 h-12 text-white mx-auto mb-3" />
                        <h1 className="text-2xl font-bold text-white">Bus In Use</h1>
                        <p className="text-sm text-red-100 mt-1">Another driver is operating this bus</p>
                    </div>
                    <CardContent className="p-6">
                        <p className="text-gray-600 dark:text-gray-400 text-sm text-center mb-6">Wait until they complete their trip.</p>
                        <Button onClick={() => router.push("/driver")} variant="outline" className="w-full h-12 font-bold rounded-xl">Go Back</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ─── Device Conflict ──────────────────────────────────────
    if (deviceConflict.hasConflict && tripActive) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 dark:from-gray-950 dark:via-amber-950 dark:to-red-950 flex items-center justify-center p-4">
                <Card className="max-w-lg w-full border-0 shadow-2xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-3xl">
                    <CardHeader className="text-center pb-4">
                        <div className="p-5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full shadow-xl mx-auto mb-4 w-fit">
                            <AlertCircle className="w-12 h-12 text-white" />
                        </div>
                        <CardTitle className="text-2xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">Multi-Device Conflict</CardTitle>
                        <p className="text-muted-foreground">Location is being shared from another device</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Button onClick={handleTakeOver} className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white">
                            <Activity className="w-4 h-4 mr-2" /> Take Over on This Device
                        </Button>
                        <Button variant="outline" onClick={() => router.push("/driver")} className="w-full">Go Back</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // ─── No Bus Assigned ──────────────────────────────────────
    if (!busData || !routeData) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-gray-950 dark:via-emerald-950 dark:to-teal-950 flex items-center justify-center p-4">
                <Card className="max-w-lg w-full border-0 shadow-2xl">
                    <CardHeader className="text-center">
                        <CardTitle className="text-2xl font-bold">Reserved Driver</CardTitle>
                        <p className="text-muted-foreground">No bus assigned</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Button onClick={() => router.push("/driver/swap-request")} className="w-full bg-gradient-to-r from-green-500 to-emerald-600 text-white">View Incoming Requests</Button>
                        <Button variant="outline" onClick={() => router.push("/driver")} className="w-full">Back to Dashboard</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex-1 bg-background pb-24 md:pb-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 space-y-8">
                {/* ─── Header ──────────────────────────────────────── */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-600 p-1">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-blue-600 to-cyan-600 opacity-50 blur-3xl" />
                    <div className="relative bg-background/95 backdrop-blur-xl rounded-3xl p-6 md:p-8">
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg">
                                    <Bus className="h-6 w-6 text-white" />
                                </div>
                                <div>
                                    <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">Live Location Sharing</h1>
                                    <p className="text-muted-foreground text-sm mt-1 flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white text-[10px] font-bold">GMAP</span>
                                        Google Maps • Driver View
                                    </p>
                                </div>
                            </div>
                            <Badge className={`px-4 py-2 text-sm font-semibold ${tripActive ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white" : "bg-gradient-to-r from-gray-500 to-gray-600 text-white"}`}>
                                <div className={`w-2 h-2 rounded-full mr-2 inline-block ${tripActive ? "bg-green-300 animate-pulse" : "bg-gray-300"}`} />
                                {tripActive ? "Trip Active" : "Trip Inactive"}
                            </Badge>
                        </div>
                    </div>
                </div>

                {/* ─── Trip Control Card ─────────────────────────────── */}
                <Card className="overflow-hidden bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-800 border-gray-100 dark:border-gray-800 shadow-lg">
                    <CardHeader className="bg-gradient-to-r from-blue-100/60 to-indigo-100/60 dark:from-blue-900/40 dark:to-indigo-900/40 px-6 py-4">
                        <CardTitle className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                                <Navigation className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            Trip Control
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                        {/* Info Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-800/10 rounded-xl p-3 border border-blue-200/50 dark:border-blue-700/30">
                                <div className="flex items-center gap-2 mb-1"><Bus className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" /><span className="text-[10px] md:text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase">Bus</span></div>
                                <p className="text-xs md:text-sm font-bold">{busData.busNumber}</p>
                            </div>
                            <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-900/20 dark:to-purple-800/10 rounded-xl p-3 border border-purple-200/50 dark:border-purple-700/30">
                                <div className="flex items-center gap-2 mb-1"><MapPin className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" /><span className="text-[10px] md:text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase">Route</span></div>
                                <p className="text-xs md:text-sm font-bold">{routeData.routeName}</p>
                            </div>
                            <div className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-900/20 dark:to-green-800/10 rounded-xl p-3 border border-green-200/50 dark:border-green-700/30">
                                <div className="flex items-center gap-2 mb-1"><Activity className="h-3.5 w-3.5 text-green-600 dark:text-green-400" /><span className="text-[10px] md:text-xs font-semibold text-green-600 dark:text-green-400 uppercase">Speed</span></div>
                                <p className="text-xs md:text-sm font-bold">{(speed * 3.6).toFixed(1)} km/h</p>
                            </div>
                            <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-900/20 dark:to-orange-800/10 rounded-xl p-3 border border-orange-200/50 dark:border-orange-700/30">
                                <div className="flex items-center gap-2 mb-1"><Navigation className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" /><span className="text-[10px] md:text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase">GPS</span></div>
                                <p className={`text-xs md:text-sm font-bold ${accuracy > 100 ? "text-red-600" : accuracy > 50 ? "text-yellow-600" : "text-green-600"}`}>{accuracy.toFixed(1)}m</p>
                            </div>
                        </div>

                        {/* Trip Buttons */}
                        <div className="flex gap-4">
                            {!tripActive ? (
                                <Button onClick={handleStartTrip} disabled={loading} className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-6 text-lg shadow-xl rounded-xl">
                                    {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <PlayCircle className="h-5 w-5 mr-2" />}
                                    Start Trip
                                </Button>
                            ) : (
                                <Button onClick={handleEndTrip} disabled={loading} className="flex-1 bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white font-bold py-6 text-lg shadow-xl rounded-xl">
                                    {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <StopCircle className="h-5 w-5 mr-2" />}
                                    End Trip
                                </Button>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* ─── Waiting Students ──────────────────────────────── */}
                {waitingFlags.length > 0 && (
                    <div className="space-y-2">
                        <h3 className="text-sm font-semibold text-muted-foreground ml-1 flex items-center gap-2">
                            <Flag className="h-4 w-4 text-orange-500" />
                            Waiting Students ({waitingFlags.length})
                        </h3>
                        {waitingFlags.map((flag) => {
                            const fLat = flag.stop_lat || flag.lat;
                            const fLng = flag.stop_lng || flag.lng;
                            let dist: number | undefined;
                            if (currentLocation && fLat && fLng) dist = haversine(currentLocation.lat, currentLocation.lng, fLat, fLng);
                            return (
                                <div key={flag.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-xl border border-orange-100 dark:border-orange-900/50 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center text-orange-600 font-bold text-xs ring-2 ring-white dark:ring-gray-800">
                                            {(flag.student_name || "S").charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-sm">{flag.student_name || "Student"}</p>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span>{dist ? `${(dist * 1000).toFixed(0)}m away` : "Waiting"}</span>
                                                <span>•</span>
                                                <span>{flag.stop_name || "Custom Stop"}</span>
                                                {flag.status === "acknowledged" && <Badge className="text-[10px] bg-green-500/20 text-green-600 px-1.5 py-0">ACK</Badge>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        {fLat && fLng && (
                                            <Button size="sm" variant="outline" onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${fLat},${fLng}&travelmode=driving`, "_blank")} className="h-8 text-xs">
                                                <ExternalLink className="h-3 w-3 mr-1" /> Nav
                                            </Button>
                                        )}
                                        {flag.status !== "acknowledged" ? (
                                            <Button size="sm" variant="outline" onClick={() => handleAckFlag(flag.id)} className="h-8 text-xs bg-orange-50 text-orange-700 hover:bg-orange-100 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300">
                                                <CheckCircle className="h-3 w-3 mr-1" /> Ack
                                            </Button>
                                        ) : (
                                            <Button size="sm" variant="outline" onClick={() => handleMarkBoarded(flag.id)} className="h-8 text-xs bg-green-50 text-green-700 hover:bg-green-100 border-green-200 dark:bg-green-900/20 dark:text-green-300">
                                                <Users className="h-3 w-3 mr-1" /> Boarded
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ─── Google Map ────────────────────────────────────── */}
                {isFullScreen && <div className="fixed inset-0 bg-black/80 z-40 backdrop-blur-sm pointer-events-none" />}
                <div className={`transition-all duration-300 shadow-2xl overflow-hidden ${isFullScreen ? "fixed inset-0 z-[10000] h-[100dvh] w-screen rounded-none" : "h-[450px] md:h-[calc(100vh-20rem)] md:min-h-[600px] rounded-3xl"}`}>
                    <GoogleMapView
                        apiKey={GMAP_API_KEY}
                        center={mapCenter}
                        zoom={tripActive && currentLocation ? 16 : 14}
                        markers={markers}
                        darkMode={typeof document !== "undefined" && document.documentElement.classList.contains("dark")}
                        className="w-full h-full"
                    />

                    {/* Map Controls */}
                    <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                        <button onClick={() => setIsFullScreen(!isFullScreen)} className="p-2.5 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg hover:scale-105 transition-transform">
                            {isFullScreen ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                        <button onClick={() => { setFollowDriver(!followDriver); if (!followDriver && currentLocation) setMapCenter({ lat: currentLocation.lat, lng: currentLocation.lng }); }} className={`p-2.5 backdrop-blur-sm rounded-xl shadow-lg hover:scale-105 transition-transform ${followDriver ? "bg-blue-500 text-white" : "bg-white/90 dark:bg-gray-800/90"}`}>
                            <Locate className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Live indicator */}
                    <div className="absolute top-4 left-4 z-10">
                        <div className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 backdrop-blur-sm shadow-lg ${tripActive ? "bg-green-500/90 text-white" : "bg-gray-500/90 text-white"}`}>
                            {tripActive ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                            {tripActive ? "Broadcasting" : "Offline"}
                        </div>
                    </div>

                    {/* Fullscreen trip control */}
                    {isFullScreen && (
                        <div className="absolute bottom-6 left-4 right-4 z-10">
                            <Button
                                onClick={tripActive ? handleEndTrip : handleStartTrip}
                                disabled={loading}
                                className={`w-full py-5 font-bold text-base rounded-2xl shadow-xl ${tripActive ? "bg-gradient-to-r from-red-500 to-red-700" : "bg-gradient-to-r from-green-500 to-emerald-600"} text-white`}
                            >
                                {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : tripActive ? <StopCircle className="h-5 w-5 mr-2" /> : <PlayCircle className="h-5 w-5 mr-2" />}
                                {tripActive ? "End Trip" : "Start Trip"}
                            </Button>
                        </div>
                    )}
                </div>
            </div>


        </div>
    );
}
