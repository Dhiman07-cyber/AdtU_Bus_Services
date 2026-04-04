"use client";

import React, { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Maximize2, Minimize2, MapPin, QrCode, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import GoogleMapView, { MarkerData } from "../GoogleMapView";
import MapFallbackUI from "./MapFallbackUI";
import { useGoogleMapsClientKey } from "@/hooks/useGoogleMapsClientKey";
import { useAuth } from "@/contexts/auth-context";
import { logMapObservability } from "@/lib/maps/map-observability";

export interface RouteStopLite {
    name: string;
    lat: number;
    lng: number;
    sequence?: number;
}

interface GoogleBusMapProps {
    busId: string;
    busNumber?: string;
    journeyActive?: boolean;
    isFullScreen?: boolean;
    onToggleFullScreen?: () => void;
    showStatsOnMobile?: boolean;
    primaryActionLabel?: string;
    onPrimaryAction?: () => void;
    primaryActionColor?: "red" | "blue" | "green" | "orange" | "yellow";
    primaryActionDisabled?: boolean;
    studentLocation?: { lat: number; lng: number; accuracy?: number } | null;
    onShowQrCode?: () => void;
    currentLocation?: {
        lat: number;
        lng: number;
        speed?: number;
        accuracy?: number;
        timestamp?: string;
        busId?: string;
    } | null;
    loading?: boolean;
    routeStops?: RouteStopLite[];
}

function buildRoutePath(stops: RouteStopLite[] | undefined): Array<{ lat: number; lng: number }> {
    if (!stops?.length) return [];
    const sorted = [...stops].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    return sorted.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)).map((s) => ({ lat: s.lat, lng: s.lng }));
}

function GoogleBusMapInner({
    busId,
    busNumber,
    journeyActive = false,
    isFullScreen = false,
    onToggleFullScreen,
    showStatsOnMobile = false,
    primaryActionLabel,
    onPrimaryAction,
    primaryActionColor = "orange",
    primaryActionDisabled = false,
    studentLocation = null,
    onShowQrCode,
    currentLocation: busLocation,
    loading = false,
    routeStops,
}: GoogleBusMapProps) {
    const { currentUser } = useAuth();
    const getIdToken = useCallback(() => currentUser?.getIdToken() ?? Promise.resolve(null), [currentUser]);

    const { status, apiKey, retry } = useGoogleMapsClientKey(true, getIdToken);
    const [mapBroken, setMapBroken] = useState(false);
    const [waitingTooLong, setWaitingTooLong] = useState(false);

    const displayLocation = useRef(busLocation);
    useEffect(() => {
        if (busLocation?.lat && busLocation?.lng) {
            displayLocation.current = busLocation;
        }
    }, [busLocation]);

    useEffect(() => {
        if (!busLocation && journeyActive && !loading) {
            const timeout = setTimeout(() => setWaitingTooLong(true), 30000);
            return () => clearTimeout(timeout);
        }
        setWaitingTooLong(false);
    }, [busLocation, journeyActive, loading]);

    const routePath = useMemo(() => buildRoutePath(routeStops), [routeStops]);

    const stopMarkers: MarkerData[] = useMemo(() => {
        if (!routeStops?.length) return [];
        const sorted = [...routeStops].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
        return sorted
            .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
            .map((s, i) => ({
                id: `stop-${i}-${s.name}`,
                lat: s.lat,
                lng: s.lng,
                title: s.name,
                zIndex: 2,
            }));
    }, [routeStops]);

    if (!journeyActive) {
        return (
            <div className="w-full h-full bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 rounded-3xl flex items-center justify-center relative overflow-hidden">
                <div className="text-center p-6 md:p-8 relative z-10 max-w-sm mx-auto">
                    <div className="w-20 h-20 md:w-24 md:h-24 mx-auto mb-6 bg-gradient-to-br from-blue-500 via-purple-600 to-indigo-700 rounded-full flex items-center justify-center shadow-xl opacity-80 mix-blend-multiply dark:mix-blend-screen animate-pulse">
                        <MapPin className="w-10 h-10 md:w-12 md:h-12 text-white" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent mb-3">
                        Waiting for Bus
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 text-sm md:text-base">
                        Trip hasn&apos;t started yet. You&apos;ll see live tracking once the driver begins the journey.
                    </p>
                </div>
            </div>
        );
    }

    if (loading && !busLocation) {
        return (
            <div className="w-full h-full bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 rounded-3xl flex items-center justify-center relative overflow-hidden">
                <div className="text-center relative z-10 max-w-sm mx-auto px-6">
                    <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Connecting</h3>
                    <p className="text-sm text-gray-500">Establishing real-time connection…</p>
                </div>
            </div>
        );
    }

    const defaultCenter = { lat: 26.1445, lng: 91.7362 };
    const centerOptions =
        busLocation?.lat && busLocation?.lng ? { lat: busLocation.lat, lng: busLocation.lng } : defaultCenter;

    const markers: MarkerData[] = useMemo(() => {
        const list: MarkerData[] = [...stopMarkers];
        if (busLocation?.lat && busLocation?.lng) {
            list.push({
                id: "bus-marker",
                lat: busLocation.lat,
                lng: busLocation.lng,
                iconUrl: "https://cdn-icons-png.flaticon.com/512/809/809098.png",
                iconSize: 56,
                zIndex: 10,
            });
        }
        if (studentLocation?.lat && studentLocation?.lng) {
            list.push({
                id: "student-marker",
                lat: studentLocation.lat,
                lng: studentLocation.lng,
                iconUrl: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
                iconSize: 46,
                zIndex: 5,
            });
        }
        return list;
    }, [busLocation, studentLocation, stopMarkers]);

    const fallbackLoc = displayLocation.current || busLocation;
    const lastTs = fallbackLoc?.timestamp;

    if (status === "loading" || status === "idle") {
        return (
            <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 dark:from-gray-900 dark:to-gray-800 rounded-3xl flex items-center justify-center">
                <div className="text-center space-y-3 px-6">
                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">Preparing map…</p>
                </div>
            </div>
        );
    }

    if (status === "failed" || mapBroken || !apiKey) {
        return (
            <div className="relative w-full h-full rounded-3xl overflow-hidden min-h-[300px]">
                <MapFallbackUI
                    onRetry={() => {
                        logMapObservability({ category: "network", code: "google_bus_map_user_retry" });
                        setMapBroken(false);
                        retry();
                    }}
                />
                {fallbackLoc?.lat && fallbackLoc?.lng && (
                    <div className="absolute bottom-4 left-4 right-4 z-10 pointer-events-none">
                        <div className="bg-white/95 dark:bg-gray-900/95 rounded-xl shadow-lg p-4 pointer-events-auto border border-gray-100 dark:border-gray-800">
                            <p className="text-xs text-gray-500 dark:text-gray-400">Last known bus location</p>
                            <p className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                                {fallbackLoc.lat.toFixed(5)}, {fallbackLoc.lng.toFixed(5)}
                            </p>
                            {lastTs && (
                                <p className="text-xs text-gray-500 mt-1">
                                    Updated: {new Date(lastTs).toLocaleString()}
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-2xl bg-slate-100 dark:bg-slate-900">
            {busLocation && (
                <div
                    className={`absolute top-3 left-3 ${isFullScreen ? "right-20" : "right-3"} z-[1000] pointer-events-none transition-all duration-300 ${!showStatsOnMobile ? "hidden md:block" : ""}`}
                >
                    <div className="bg-white/95 dark:bg-gray-900/95 rounded-2xl shadow-lg p-4 backdrop-blur-sm pointer-events-auto">
                        <div className="flex items-center gap-3 w-full">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shrink-0">
                                <span className="text-2xl">🚌</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-500 font-medium">Bus Number</p>
                                <p className="text-lg font-bold text-gray-900 dark:text-white truncate">
                                    {busNumber || busLocation.busId || "Unknown"}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <GoogleMapView
                apiKey={apiKey}
                center={centerOptions}
                zoom={15}
                markers={markers}
                routePath={routePath.length > 1 ? routePath : undefined}
                onLoadError={() => setMapBroken(true)}
                circle={
                    busLocation?.lat && busLocation?.lng
                        ? {
                            center: { lat: busLocation.lat, lng: busLocation.lng },
                            radius: busLocation.accuracy || 50,
                        }
                        : undefined
                }
                className="w-full h-full !rounded-none"
            />

            <div className={`absolute z-[1000] flex flex-col gap-2 ${isFullScreen ? "bottom-32 right-4" : "bottom-4 right-4"}`}>
                {onToggleFullScreen && !isFullScreen && (
                    <button
                        type="button"
                        onClick={onToggleFullScreen}
                        className="w-10 h-10 bg-gray-800 text-white rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
                    >
                        <Maximize2 className="w-4 h-4" />
                    </button>
                )}
            </div>

            {isFullScreen && onToggleFullScreen && (
                <button
                    type="button"
                    onClick={onToggleFullScreen}
                    className="absolute top-4 right-4 z-[1001] w-12 h-12 bg-white dark:bg-gray-800 text-gray-700 dark:text-white rounded-full shadow-lg flex items-center justify-center hover:scale-105 transition-all"
                >
                    <Minimize2 className="w-5 h-5" />
                </button>
            )}

            {isFullScreen && onShowQrCode && (
                <button
                    type="button"
                    onClick={onShowQrCode}
                    className="absolute top-20 right-4 z-[1001] w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full shadow-lg flex items-center justify-center"
                >
                    <QrCode className="w-6 h-6 text-white" />
                </button>
            )}

            {isFullScreen && primaryActionLabel && (
                <div className="absolute bottom-8 left-4 right-4 z-[1000]">
                    <Button
                        onClick={primaryActionDisabled ? undefined : onPrimaryAction}
                        disabled={primaryActionDisabled}
                        className={`w-full h-14 text-lg font-bold rounded-xl shadow-lg transition-all ${
                            primaryActionColor === "red"
                                ? "bg-red-600 hover:bg-red-700 text-white"
                                : primaryActionColor === "blue"
                                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                                  : primaryActionColor === "green"
                                    ? "bg-green-600 hover:bg-green-700 text-white"
                                    : primaryActionColor === "yellow"
                                      ? "bg-amber-400 text-gray-900 cursor-not-allowed"
                                      : "bg-orange-500 hover:bg-orange-600 text-white"
                        }`}
                    >
                        {primaryActionLabel}
                    </Button>
                </div>
            )}

            {!busLocation && journeyActive && !loading && (
                <div className="absolute inset-0 bg-black/80 z-[999] flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 max-w-sm mx-4 text-center">
                        <h3 className="text-xl font-bold mb-3">
                            {waitingTooLong ? "Location unavailable" : "Searching for bus…"}
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                            {waitingTooLong
                                ? "Internal server is under high load. Please wait and try again."
                                : "Waiting for live coordinates…"}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function GoogleBusMap(props: GoogleBusMapProps) {
    return <GoogleBusMapInner key={props.busId} {...props} />;
}
