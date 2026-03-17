"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    MapPin, Bus, Navigation, Flag, XCircle, AlertCircle,
    Clock, X, AlertTriangle, CheckCircle, ExternalLink,
    Locate, Phone, Wifi, WifiOff, Eye, EyeOff, Bell
} from "lucide-react";
import { getStudentByUid, getBusById, getRouteById } from "@/lib/dataService";
import { supabase } from "@/lib/supabase-client";
import { useToast } from "@/contexts/toast-context";
import dynamic from "next/dynamic";
import { useBusLocation } from "@/hooks/useBusLocation";
import { onForegroundMessage } from "@/lib/fcm-service";



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
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatEta(distanceKm: number, speedMps: number): string {
    const speedKmh = speedMps && speedMps > 1 ? speedMps * 3.6 : 25;
    const mins = Math.round((distanceKm / speedKmh) * 60);
    if (mins < 1) return "< 1 min";
    if (mins < 60) return `${mins} min${mins > 1 ? "s" : ""}`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ─── SVG data URIs for Google Maps markers ──────────────────
const BUS_MARKER_SVG = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <circle cx="24" cy="24" r="22" fill="#3B82F6" stroke="white" stroke-width="3"/>
    <text x="24" y="30" font-size="22" fill="white" text-anchor="middle">🚌</text>
  </svg>`
)}`;

const STUDENT_MARKER_SVG = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
    <circle cx="18" cy="18" r="16" fill="#EF4444" stroke="white" stroke-width="3"/>
    <text x="18" y="24" font-size="16" fill="white" text-anchor="middle">📍</text>
  </svg>`
)}`;

// ═══════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════
export default function StudentGMapPage() {
    const { currentUser, userData, loading: authLoading, signOut } = useAuth();
    const router = useRouter();
    const { addToast } = useToast();

    // ─── Core State ───────────────────────────────────────────
    const [studentData, setStudentData] = useState<any>(null);
    const [busData, setBusData] = useState<any>(null);
    const [routeData, setRouteData] = useState<any>(null);
    const [busLocation, setBusLocation] = useState<any>(null);
    const [studentLocation, setStudentLocation] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null);
    const [dataLoading, setDataLoading] = useState(true);
    const [tripActive, setTripActive] = useState(false);

    // ─── ETA / Distance ───────────────────────────────────────
    const [eta, setEta] = useState<string | null>(null);
    const [distanceToBus, setDistanceToBus] = useState<number | null>(null);

    // ─── Waiting Flag ─────────────────────────────────────────
    const [isWaiting, setIsWaiting] = useState(false);
    const [currentFlagId, setCurrentFlagId] = useState<string | null>(null);
    const [submittingFlag, setSubmittingFlag] = useState(false);
    const [pendingRaise, setPendingRaise] = useState(false);
    const [countdown, setCountdown] = useState(5);
    const handleRaiseRef = useRef<(() => Promise<void>) | null>(null);

    // ─── Map State ────────────────────────────────────────────
    const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [followBus, setFollowBus] = useState(true);

    // ─── Proximity Alert ──────────────────────────────────────
    const arrivedRef = useRef(false);
    const proximity500Ref = useRef(false);
    const proximity1kmRef = useRef(false);

    // ─── FCM Arrival Modal ────────────────────────────────────
    const [arrivalModal, setArrivalModal] = useState<{ title: string; body: string } | null>(null);

    // ─── Countdown timer for flag raise ───────────────────────
    useEffect(() => {
        let iv: NodeJS.Timeout | undefined;
        if (pendingRaise && countdown > 0) {
            iv = setInterval(() => setCountdown((p) => p - 1), 1000);
        } else if (pendingRaise && countdown === 0) {
            handleRaiseRef.current?.();
            setPendingRaise(false);
        }
        return () => { if (iv) clearInterval(iv); };
    }, [pendingRaise, countdown]);

    // ─── Auth guard ───────────────────────────────────────────
    useEffect(() => {
        if (authLoading) return;
        if (!currentUser?.uid || userData?.role !== "student") {
            router.push("/login");
        }
    }, [authLoading, currentUser, userData, router]);

    // ─── FCM foreground listener ──────────────────────────────
    // NOTE: When app is in foreground, FCM delivers here instead of service worker.
    // We only update modals, but NO TOASTS — Supabase broadcasts handle the toasts reliably
    // and instantly.
    useEffect(() => {
        const unsub = onForegroundMessage((payload: any) => {
            const data = payload?.data || {};
            if (data.type === "TRIP_STARTED") {
                setTripActive(true);
            }
            if (data.type === "TRIP_ENDED") {
                setTripActive(false);
                setIsWaiting(false);
                setCurrentFlagId(null);
            }
            if (data.type === "BUS_APPROACHING") {
                setArrivalModal({
                    title: "🚌 Bus Approaching!",
                    body: payload?.notification?.body || "Your bus is near your stop!",
                });
            }
        });
        return unsub;
    }, [addToast]);

    // ─── Fetch student/bus/route data ─────────────────────────
    useEffect(() => {
        if (authLoading || !currentUser?.uid || userData?.role !== "student") return;

        const fetchData = async () => {
            try {
                const student = await getStudentByUid(currentUser.uid);
                if (!student) {
                    addToast("Account not found.", "error");
                    await signOut();
                    router.push("/login");
                    return;
                }
                setStudentData(student);

                const promises: Promise<any>[] = [];
                if (student.busId) promises.push(getBusById(student.busId).then((b) => b && setBusData(b)));
                if (student.routeId) promises.push(getRouteById(student.routeId).then((r) => r && setRouteData(r)));

                // Check existing waiting flag
                promises.push(
                    Promise.resolve(
                        supabase
                            .from("waiting_flags")
                            .select("*")
                            .eq("student_uid", currentUser.uid)
                            .in("status", ["waiting", "raised", "acknowledged"])
                            .maybeSingle()
                    ).then(({ data }) => {
                        if (data) {
                            setIsWaiting(true);
                            setCurrentFlagId(data.id);
                            if (data.stop_lat && data.stop_lng) {
                                setStudentLocation({ lat: data.stop_lat, lng: data.stop_lng, accuracy: 50 });
                            }
                        }
                    })
                );

                await Promise.all(promises);
            } catch (err) {
                console.error("Fetch error:", err);
                addToast("Failed to load tracking data", "error");
            } finally {
                setDataLoading(false);
            }
        };

        fetchData();
    }, [authLoading, currentUser, userData, router, addToast, signOut]);

    // ─── useBusLocation hook for realtime ─────────────────────
    const busId = studentData?.busId || studentData?.assignedBusId || "";
    const { currentLocation: hookLocation, interpolatedLocation: hookInterp } = useBusLocation(
        tripActive ? busId : ""
    );

    useEffect(() => {
        if (hookInterp) {
            setBusLocation({ ...hookLocation, lat: hookInterp.lat, lng: hookInterp.lng });
        } else if (hookLocation) {
            setBusLocation(hookLocation);
        }
    }, [hookLocation, hookInterp]);

    // ─── Trip status monitoring ───────────────────────────────
    useEffect(() => {
        if (!busData?.busId) return;

        const checkTrip = async () => {
            try {
                const res = await fetch(`/api/student/trip-status?busId=${encodeURIComponent(busData.busId)}`);
                if (res.ok) {
                    const r = await res.json();
                    if (r.tripActive) setTripActive(true);
                    else if (!busLocation) setTripActive(false);
                }
            } catch { }
        };
        checkTrip();

        // Realtime driver_status
        const ch1 = supabase
            .channel(`gmap_ds_${busData.busId}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "driver_status", filter: `bus_id=eq.${busData.busId}` }, (p) => {
                if (p.eventType === "DELETE") setTripActive(false);
                else if (p.new) {
                    const s = (p.new as any).status;
                    setTripActive(s === "on_trip" || s === "enroute");
                }
            })
            .subscribe();

        // Broadcast events — WebSocket ensures instant, reliable in-app UI toasts
        const ch2 = supabase
            .channel(`gmap_ts_${busData.busId}`)
            .on("broadcast", { event: "trip_started" }, () => { setTripActive(true); addToast("🚌 Trip started!", "success"); })
            .on("broadcast", { event: "trip_ended" }, () => {
                setTripActive(false);
                setIsWaiting(false);
                setCurrentFlagId(null);
                addToast("🏁 Trip ended", "info");
            })
            .subscribe();

        const iv = setInterval(checkTrip, 30000);
        return () => {
            clearInterval(iv);
            supabase.removeChannel(ch1);
            supabase.removeChannel(ch2);
        };
    }, [busData?.busId, addToast]);

    // ─── ETA & Distance ───────────────────────────────────────
    useEffect(() => {
        if (!busLocation?.lat || !studentLocation?.lat) {
            setEta(null);
            setDistanceToBus(null);
            return;
        }
        const dist = haversine(busLocation.lat, busLocation.lng, studentLocation.lat, studentLocation.lng);
        setDistanceToBus(dist);
        setEta(formatEta(dist, busLocation.speed || 0));

        // Proximity alerts
        if (dist <= 0.1 && !arrivedRef.current && tripActive) {
            arrivedRef.current = true;
            addToast("🚌 Your bus is about to arrive! Be ready!", "success");
            setArrivalModal({ title: "🚌 Bus Arriving!", body: "Your bus is within 100m of your location. Please be ready at the stop!" });
        }
        if (dist <= 0.5 && !proximity500Ref.current && tripActive) {
            proximity500Ref.current = true;
            addToast("🚌 Bus is 500m away!", "info");
        }
        if (dist <= 1.0 && !proximity1kmRef.current && tripActive) {
            proximity1kmRef.current = true;
            addToast("🚌 Bus is about 1km away", "info");
        }
        if (dist > 0.5) { arrivedRef.current = false; proximity500Ref.current = false; }
        if (dist > 1.5) proximity1kmRef.current = false;
    }, [busLocation, studentLocation, tripActive, addToast]);

    // ─── Student location watch (when waiting) ────────────────
    const locWatchRef = useRef<number | null>(null);
    useEffect(() => {
        if (!isWaiting && !tripActive) {
            if (locWatchRef.current !== null) {
                navigator.geolocation.clearWatch(locWatchRef.current);
                locWatchRef.current = null;
            }
            return;
        }
        if (!navigator.geolocation) return;
        locWatchRef.current = navigator.geolocation.watchPosition(
            (pos) => setStudentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
            () => { },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
        return () => { if (locWatchRef.current !== null) navigator.geolocation.clearWatch(locWatchRef.current); };
    }, [isWaiting, tripActive]);

    // ─── Get student location once on mount (for ETA without flag) ─
    useEffect(() => {
        if (studentLocation || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (pos) => setStudentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
            () => { },
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
        );
    }, []);

    // ─── Acknowledgment channel ───────────────────────────────
    useEffect(() => {
        if (!currentUser?.uid || !isWaiting) return;
        const ch = supabase
            .channel(`gmap_ack_${currentUser.uid}`)
            .on("broadcast", { event: "flag_acknowledged" }, () => {
                setIsWaiting(false);
                setCurrentFlagId(null);
                addToast("🎉 Driver acknowledged your flag!", "success");
            })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [currentUser?.uid, isWaiting, addToast]);

    // ─── Waiting flag postgres channel ────────────────────────
    useEffect(() => {
        if (!currentUser?.uid || !busData?.busId) return;
        const ch = supabase
            .channel(`gmap_wf_${currentUser.uid}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "waiting_flags", filter: `student_uid=eq.${currentUser.uid}` }, (p) => {
                if (p.eventType === "DELETE" || ["boarded", "cancelled", "removed", "picked_up"].includes((p.new as any)?.status)) {
                    setIsWaiting(false);
                    setCurrentFlagId(null);
                    if (p.eventType === "DELETE") addToast("🎉 You've been picked up!", "success");
                } else if ((p.new as any)?.status === "acknowledged") {
                    addToast("👋 Driver acknowledged your flag!", "success");
                }
            })
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [currentUser?.uid, busData?.busId, addToast]);

    // ─── Wake Lock ────────────────────────────────────────────
    useEffect(() => {
        let wl: any = null;
        const req = async () => {
            try { if ("wakeLock" in navigator) wl = await (navigator as any).wakeLock.request("screen"); } catch { }
        };
        if (tripActive || isWaiting || isFullScreen) req();
        const vis = async () => { if (document.visibilityState === "visible" && (tripActive || isWaiting)) await req(); };
        document.addEventListener("visibilitychange", vis);
        return () => { document.removeEventListener("visibilitychange", vis); wl?.release().catch(() => { }); };
    }, [tripActive, isWaiting, isFullScreen]);

    // ─── Map center follows bus ───────────────────────────────
    useEffect(() => {
        if (!followBus || !busLocation?.lat) return;
        setMapCenter({ lat: busLocation.lat, lng: busLocation.lng });
    }, [busLocation, followBus]);

    // ─── Raise Waiting Flag ───────────────────────────────────
    const handleRaiseWaitingFlag = useCallback(async () => {
        if (!currentUser || !busData || !tripActive) {
            addToast(tripActive ? "Missing data" : "No active trip", "error");
            return;
        }
        setSubmittingFlag(true);
        try {
            let pos: GeolocationPosition | null = null;
            try {
                pos = await new Promise<GeolocationPosition>((res, rej) =>
                    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 })
                );
            } catch (e: any) {
                addToast("📍 Location required to raise flag.", "error");
                setSubmittingFlag(false);
                return;
            }
            setStudentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
            const idToken = await currentUser.getIdToken();
            const res = await fetch("/api/student/waiting-flag", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                body: JSON.stringify({
                    idToken, busId: busData.busId,
                    routeId: routeData?.routeId || studentData?.routeId,
                    lat: pos.coords.latitude, lng: pos.coords.longitude,
                    accuracy: pos.coords.accuracy || 50,
                }),
            });
            const result = await res.json().catch(() => ({}));
            if (res.ok && result.success) {
                setIsWaiting(true);
                setCurrentFlagId(result.flagId);
                addToast("✅ Waiting flag raised! Driver notified.", "success");
            } else if (res.status === 409 && result.existingFlagId) {
                setIsWaiting(true);
                setCurrentFlagId(result.existingFlagId);
                addToast("You already have an active flag.", "info");
            } else {
                addToast(result.error || "Failed to raise flag", "error");
            }
        } catch (e: any) {
            addToast("Failed to raise flag: " + (e.message || ""), "error");
        } finally {
            setSubmittingFlag(false);
        }
    }, [currentUser, busData, routeData, studentData, tripActive, addToast]);

    useEffect(() => { handleRaiseRef.current = handleRaiseWaitingFlag; }, [handleRaiseWaitingFlag]);

    // ─── Remove Waiting Flag ──────────────────────────────────
    const handleRemoveFlag = async () => {
        if (!currentFlagId) return;
        setSubmittingFlag(true);
        try {
            await supabase.from("waiting_flags").update({ status: "cancelled" }).eq("id", currentFlagId);
            setIsWaiting(false);
            setCurrentFlagId(null);
            addToast("Waiting flag removed", "success");
        } catch { addToast("Failed to remove flag", "error"); }
        finally { setSubmittingFlag(false); }
    };

    const handleToggleFlag = () => {
        if (isWaiting) return;
        if (pendingRaise) { setPendingRaise(false); setCountdown(5); addToast("Cancelled", "info"); }
        else { setPendingRaise(true); setCountdown(5); }
    };

    // ─── Build map markers ────────────────────────────────────
    const markers = [];
    if (busLocation?.lat) {
        markers.push({
            id: "bus",
            lat: busLocation.lat,
            lng: busLocation.lng,
            title: `Bus ${busData?.busNumber || ""}`,
            iconUrl: BUS_MARKER_SVG,
            iconSize: 48,
            zIndex: 10,
        });
    }
    if (studentLocation?.lat) {
        markers.push({
            id: "student",
            lat: studentLocation.lat,
            lng: studentLocation.lng,
            title: "You",
            iconUrl: STUDENT_MARKER_SVG,
            iconSize: 36,
            zIndex: 5,
        });
    }

    // ─── Google Maps navigation helper ────────────────────────
    const openGMapsNav = (lat: number, lng: number) => {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`, "_blank");
    };

    // ═══════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════

    if (authLoading || dataLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900">
                <div className="text-center space-y-6">
                    <div className="relative flex items-center justify-center h-24">
                        <div className="absolute w-64 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent rounded-full" />
                        <div className="relative p-4 bg-gradient-to-br from-blue-600 via-cyan-600 to-blue-700 rounded-2xl shadow-2xl">
                            <Bus className="h-10 w-10 text-white" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-2xl font-bold text-white">Loading Bus Tracker</h3>
                        <p className="text-sm text-blue-200">Connecting to live tracking...</p>
                        <div className="w-64 mx-auto mt-4">
                            <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500 rounded-full animate-pulse" style={{ width: "70%" }} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!busData || !routeData) {
        return (
            <div className="container mx-auto p-6 pt-24">
                <Card>
                    <CardHeader><CardTitle>No Bus Assigned</CardTitle></CardHeader>
                    <CardContent><p>You haven&apos;t been assigned to a bus yet. Please contact your admin.</p></CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-gray-950 dark:via-blue-950/20 dark:to-purple-950/10">
            <div className="container mx-auto px-4 pb-4 pt-20 md:px-6 md:pb-6 md:pt-24 space-y-6">
                {/* ─── Header ────────────────────────────────────────── */}
                <div className="group relative overflow-hidden rounded-3xl p-[2px] bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 shadow-xl">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-75 group-hover:opacity-100 transition-opacity duration-300" />
                    <div className="relative bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-3xl p-6 md:p-10">
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                            <div className="space-y-4 flex-1">
                                <div className="flex items-center gap-4">
                                    <div className="relative p-3 md:p-4 rounded-2xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 shadow-lg">
                                        <Navigation className="h-6 md:h-7 w-6 md:w-7 text-white" />
                                    </div>
                                    <div>
                                        <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 dark:from-blue-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                                            Live Bus Tracker
                                        </h1>
                                        <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mt-1 font-medium flex items-center gap-2">
                                            <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 text-white text-[10px] font-bold">GMAP</span>
                                            Google Maps • Real-time • Smart ETA
                                        </p>
                                    </div>
                                </div>

                                {/* Status Badges */}
                                <div className="flex flex-wrap items-center gap-3">
                                    <div className={`px-5 py-2.5 rounded-full font-semibold text-sm shadow-lg ${tripActive ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-green-500/30" : "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/30"}`}>
                                        <span className={`inline-block w-2 h-2 rounded-full mr-2 ${tripActive ? "bg-white animate-pulse" : "bg-white/80"}`} />
                                        {tripActive ? "🚌 Trip Active" : "⏸️ Trip Inactive"}
                                    </div>
                                    {eta && (
                                        <div className="px-5 py-2.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold text-sm shadow-lg shadow-blue-500/30">
                                            <Clock className="inline-block h-4 w-4 mr-2" />ETA: {eta}
                                        </div>
                                    )}
                                    {distanceToBus !== null && (
                                        <div className="px-5 py-2.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold text-sm shadow-lg shadow-purple-500/30">
                                            <MapPin className="inline-block h-4 w-4 mr-2" />{distanceToBus < 1 ? `${(distanceToBus * 1000).toFixed(0)}m` : `${distanceToBus.toFixed(1)} km`} away
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ─── Map + Sidebar ─────────────────────────────────── */}
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Full screen dimmer */}
                    {isFullScreen && <div className="fixed inset-0 bg-black/80 z-40 backdrop-blur-sm pointer-events-none" />}

                    {/* Map */}
                    <div className={`transition-all duration-300 ${isFullScreen ? "fixed inset-0 z-[10000] p-0" : "flex-1"}`}>
                        <div className={`relative overflow-hidden shadow-xl ring-1 ring-black/5 dark:ring-white/10 ${isFullScreen ? "h-[100dvh] w-screen rounded-none" : "h-[450px] md:h-[600px] lg:h-[650px] rounded-3xl"}`}>
                            <GoogleMapView
                                apiKey={GMAP_API_KEY}
                                center={mapCenter}
                                zoom={tripActive && busLocation ? 16 : 14}
                                markers={markers}
                                darkMode={typeof document !== "undefined" && document.documentElement.classList.contains("dark")}
                                className="w-full h-full"
                                circle={studentLocation && tripActive ? { center: { lat: studentLocation.lat, lng: studentLocation.lng }, radius: 100, color: "#EF4444" } : undefined}
                            />

                            {/* Map Controls Overlay */}
                            <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                                <button onClick={() => setIsFullScreen(!isFullScreen)} className="p-2.5 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl shadow-lg hover:scale-105 transition-transform">
                                    {isFullScreen ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                </button>
                                <button onClick={() => { setFollowBus(!followBus); if (!followBus && busLocation) setMapCenter({ lat: busLocation.lat, lng: busLocation.lng }); }} className={`p-2.5 backdrop-blur-sm rounded-xl shadow-lg hover:scale-105 transition-transform ${followBus ? "bg-blue-500 text-white" : "bg-white/90 dark:bg-gray-800/90"}`}>
                                    <Locate className="h-5 w-5" />
                                </button>
                            </div>

                            {/* Connection indicator */}
                            <div className="absolute top-4 left-4 z-10">
                                <div className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 backdrop-blur-sm shadow-lg ${tripActive ? "bg-green-500/90 text-white" : "bg-gray-500/90 text-white"}`}>
                                    {tripActive ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                                    {tripActive ? "Live" : "Offline"}
                                </div>
                            </div>

                            {/* Google Maps open link */}
                            {busLocation?.lat && (
                                <div className="absolute bottom-4 left-4 z-10">
                                    <button
                                        onClick={() => window.open(`https://www.google.com/maps?q=${busLocation.lat},${busLocation.lng}`, "_blank")}
                                        className="flex items-center gap-2 px-4 py-2.5 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm rounded-xl shadow-lg text-sm font-semibold text-blue-600 dark:text-blue-400 hover:scale-105 transition-transform"
                                    >
                                        <ExternalLink className="h-4 w-4" />
                                        Open in Google Maps
                                    </button>
                                </div>
                            )}

                            {/* Bottom action bar on fullscreen */}
                            {isFullScreen && (
                                <div className="absolute bottom-6 left-4 right-4 z-10">
                                    <Button
                                        onClick={(!tripActive && !isWaiting) ? undefined : handleToggleFlag}
                                        disabled={isWaiting || submittingFlag || (!tripActive && !isWaiting)}
                                        className={`w-full py-5 font-bold text-base rounded-2xl shadow-xl ${isWaiting ? "bg-gray-500" : pendingRaise ? "bg-gradient-to-r from-red-500 to-pink-500" : tripActive ? "bg-gradient-to-r from-orange-500 to-pink-500" : "bg-gray-400"} text-white`}
                                    >
                                        {submittingFlag ? "Processing..." : isWaiting ? "🚩 Flag Raised" : pendingRaise ? `Cancel (${countdown}s)` : !tripActive ? "No Active Trip" : "🚩 Raise Waiting Flag"}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ─── Info Sidebar ────────────────────────────────── */}
                    <div className="w-full lg:w-96 space-y-5">
                        {/* Bus Info Card */}
                        <div className="group relative overflow-hidden rounded-2xl p-[1px] bg-gradient-to-br from-blue-400 via-cyan-400 to-teal-400 shadow-lg hover:scale-[1.02] transition-transform duration-300">
                            <Card className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-0">
                                <CardHeader className="pb-4">
                                    <CardTitle className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg">
                                            <Bus className="h-5 w-5 text-white" />
                                        </div>
                                        <span className="bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent font-bold">Bus Information</span>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="bg-gradient-to-br from-blue-50 to-cyan-50/50 dark:from-blue-950/30 dark:to-cyan-950/20 rounded-xl p-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Bus Number</span>
                                            <span className="font-bold text-lg bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400 bg-clip-text text-transparent">{busData.busNumber}</span>
                                        </div>
                                    </div>
                                    <div className="bg-gradient-to-br from-purple-50 to-pink-50/50 dark:from-purple-950/30 dark:to-pink-950/20 rounded-xl p-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Route</span>
                                            <span className="font-bold text-lg bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent">{routeData.routeName}</span>
                                        </div>
                                    </div>
                                    <div className="bg-gradient-to-br from-green-50 to-emerald-50/50 dark:from-green-950/30 dark:to-emerald-950/20 rounded-xl p-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Status</span>
                                            <Badge className={`font-semibold px-4 py-1 ${tripActive ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white" : ""}`}>
                                                {tripActive ? "✅ Active" : "⏸️ Inactive"}
                                            </Badge>
                                        </div>
                                    </div>
                                    {busLocation && (
                                        <div className="bg-gradient-to-br from-amber-50 to-orange-50/50 dark:from-amber-950/30 dark:to-orange-950/20 rounded-xl p-4">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Speed</span>
                                                <span className="text-sm font-semibold">{busLocation.speed ? `${(busLocation.speed * 3.6).toFixed(0)} km/h` : "Idle"}</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Navigate to bus button */}
                                    {busLocation?.lat && (
                                        <Button onClick={() => openGMapsNav(busLocation.lat, busLocation.lng)} className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold py-3 rounded-xl hover:scale-[1.02] transition-transform">
                                            <ExternalLink className="h-4 w-4 mr-2" /> Navigate to Bus
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* ETA Card */}
                        {eta && distanceToBus !== null && (
                            <div className="group relative overflow-hidden rounded-2xl p-[1px] bg-gradient-to-br from-green-400 via-emerald-400 to-teal-400 shadow-lg hover:scale-[1.02] transition-transform duration-300">
                                <Card className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-0">
                                    <CardContent className="p-5">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2.5 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500">
                                                    <Clock className="h-5 w-5 text-white" />
                                                </div>
                                                <span className="font-bold text-green-700 dark:text-green-300">Estimated Arrival</span>
                                            </div>
                                        </div>
                                        <div className="text-center py-3">
                                            <span className="text-5xl font-black bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-400 dark:to-emerald-400 bg-clip-text text-transparent">{eta}</span>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 font-medium">
                                                {distanceToBus < 1 ? `${(distanceToBus * 1000).toFixed(0)}m away` : `${distanceToBus.toFixed(2)} km away`}
                                            </p>
                                        </div>
                                        {/* Progress bar */}
                                        <div className="mt-3 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-green-500 to-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${Math.max(5, Math.min(95, 100 - distanceToBus * 10))}%` }} />
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {/* Waiting Flag Card */}
                        <div className="group relative overflow-hidden rounded-2xl p-[1px] bg-gradient-to-br from-orange-400 via-red-400 to-pink-400 shadow-lg hover:scale-[1.02] transition-transform duration-300">
                            <Card className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-0">
                                <CardHeader className="pb-4">
                                    <CardTitle className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-orange-500 to-pink-500 shadow-lg">
                                            <Flag className="h-5 w-5 text-white" />
                                        </div>
                                        <span className="bg-gradient-to-r from-orange-600 to-pink-600 dark:from-orange-400 dark:to-pink-400 bg-clip-text text-transparent font-bold">Waiting Status</span>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex justify-between items-center bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-800/50 dark:to-slate-800/30 rounded-xl p-4">
                                        <span className="font-medium text-gray-700 dark:text-gray-300">Status:</span>
                                        <Badge className={`font-semibold px-4 py-1 ${isWaiting ? "bg-gradient-to-r from-orange-500 to-pink-500 text-white animate-pulse" : ""}`}>
                                            {isWaiting ? "🚩 Waiting" : "✋ Not Waiting"}
                                        </Badge>
                                    </div>

                                    {isWaiting && currentFlagId && (
                                        <>
                                            <div className="bg-gradient-to-br from-blue-50 via-cyan-50 to-blue-50 dark:from-blue-950/40 dark:via-cyan-950/30 dark:to-blue-950/40 border-2 border-blue-200 dark:border-blue-800 rounded-xl p-4">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <div className="p-1.5 rounded-lg bg-blue-500 animate-pulse"><Flag className="h-4 w-4 text-white" /></div>
                                                    <span className="font-bold text-blue-800 dark:text-blue-300">Flag Active</span>
                                                </div>
                                                <p className="text-sm text-blue-700 dark:text-blue-400 font-medium">Driver has been notified. Expires in 20 min.</p>
                                            </div>
                                            <Button onClick={handleRemoveFlag} disabled={submittingFlag} variant="outline" className="w-full border-red-300 text-red-600 hover:bg-red-50">
                                                <XCircle className="h-4 w-4 mr-2" /> Cancel Waiting Flag
                                            </Button>
                                        </>
                                    )}

                                    {/* How it works */}
                                    <div className="bg-gradient-to-br from-indigo-50 via-blue-50 to-cyan-50 dark:from-indigo-950/30 dark:via-blue-950/20 dark:to-cyan-950/30 rounded-xl p-5 border border-indigo-100 dark:border-indigo-900">
                                        <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                            <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-500"><AlertCircle className="h-4 w-4 text-white" /></div>
                                            How it Works
                                        </h4>
                                        <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300 font-medium">
                                            <p className="flex items-start gap-2"><span className="text-indigo-600 dark:text-indigo-400">1️⃣</span>Click &quot;Raise Waiting Flag&quot; when ready</p>
                                            <p className="flex items-start gap-2"><span className="text-indigo-600 dark:text-indigo-400">2️⃣</span>Your driver will be notified instantly</p>
                                            <p className="flex items-start gap-2"><span className="text-indigo-600 dark:text-indigo-400">3️⃣</span>Driver will come to your location</p>
                                            <p className="flex items-start gap-2"><span className="text-indigo-600 dark:text-indigo-400">4️⃣</span>Flag expires automatically in 20 minutes</p>
                                        </div>
                                    </div>

                                    {/* Raise Flag Button */}
                                    <Button
                                        onClick={handleToggleFlag}
                                        disabled={submittingFlag || (!tripActive && !isWaiting) || (isWaiting && !pendingRaise)}
                                        className={`w-full py-6 font-bold text-base shadow-lg transition-all active:scale-[0.98] ${isWaiting ? "bg-gray-500 text-white cursor-not-allowed" : pendingRaise ? "bg-gradient-to-r from-red-500 to-pink-500 text-white" : tripActive ? "bg-gradient-to-r from-orange-500 to-pink-500 text-white shadow-orange-500/50" : "bg-gray-400 text-gray-700"}`}
                                    >
                                        {submittingFlag ? <><div className="h-5 w-5 animate-spin rounded-full border-3 border-current border-t-transparent mr-2" />Processing...</>
                                            : isWaiting ? <><Flag className="h-5 w-5 mr-2" />Flag Raised</>
                                                : pendingRaise ? <><XCircle className="h-5 w-5 mr-2" />Cancel ({countdown}s)</>
                                                    : !tripActive ? <><AlertCircle className="h-5 w-5 mr-2" />No Trip</>
                                                        : <><Flag className="h-5 w-5 mr-2 animate-pulse" />🚩 Raise Waiting Flag</>}
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Arrival Modal ────────────────────────────────────── */}
            {arrivalModal && (
                <>
                    <div className="fixed inset-0 z-[10001] bg-black/60 backdrop-blur-sm" onClick={() => setArrivalModal(null)} />
                    <div className="fixed inset-0 z-[10002] flex items-center justify-center p-4 pointer-events-none">
                        <div className="pointer-events-auto w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700 animate-in zoom-in-95 fade-in duration-200">
                            <div className="relative px-6 py-5 bg-gradient-to-r from-green-500 to-emerald-500">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-white/20"><Bus className="h-6 w-6 text-white" /></div>
                                    <h3 className="text-lg font-bold text-white">{arrivalModal.title}</h3>
                                </div>
                                <button onClick={() => setArrivalModal(null)} className="absolute top-4 right-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center text-white transition-all">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="p-6 text-center">
                                <p className="text-gray-700 dark:text-gray-300 font-medium mb-4">{arrivalModal.body}</p>
                                {busLocation?.lat && (
                                    <Button onClick={() => { window.open(`https://www.google.com/maps?q=${busLocation.lat},${busLocation.lng}`, "_blank"); setArrivalModal(null); }} className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold py-3 mb-3">
                                        <ExternalLink className="h-4 w-4 mr-2" /> View on Google Maps
                                    </Button>
                                )}
                                <Button onClick={() => setArrivalModal(null)} variant="outline" className="w-full">Dismiss</Button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Notification Permission Banner */}

        </div>
    );
}
