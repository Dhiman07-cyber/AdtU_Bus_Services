"use client";

import React, { useState, useCallback } from "react";
import { Maximize2, Minimize2, MapPin, ScanLine, Users, X, Bell, Bus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import GoogleMapView, { MarkerData } from "../GoogleMapView";
import MapFallbackUI from "./MapFallbackUI";
import { useGoogleMapsClientKey } from "@/hooks/useGoogleMapsClientKey";
import { useAuth } from "@/contexts/auth-context";
import { logMapObservability } from "@/lib/maps/map-observability";

interface WaitingStudent {
    id: string;
    student_uid: string;
    student_name: string;
    student_profile_photo?: string | null;
    bus_id: string;
    stop_lat?: number;
    stop_lng?: number;
    accuracy: number;
    stop_name?: string;
    message?: string;
    status: "waiting" | "acknowledged" | "boarded" | "raised";
    created_at: string;
    distance?: number;
    queue_number?: number;
}

interface GoogleDriverMapProps {
    driverLocation: { lat: number; lng: number; accuracy: number } | null;
    waitingStudents: WaitingStudent[];
    tripActive: boolean;
    busNumber?: string;
    routeName?: string;
    speed?: number;
    accuracy?: number;
    onAcknowledgeStudent?: (studentId: string) => void;
    onMarkBoarded?: (studentId: string) => void;
    isFullScreen?: boolean;
    onToggleFullScreen?: () => void;
    showStatsOnMobile?: boolean;
    primaryActionLabel?: string;
    onPrimaryAction?: () => void;
    primaryActionColor?: "red" | "blue" | "green";
    onQrScan?: () => void;
}

function GoogleDriverMapInner({
    driverLocation,
    waitingStudents = [],
    tripActive,
    busNumber,
    routeName: _routeName,
    speed: _speed = 0,
    accuracy: _accuracy = 50,
    onAcknowledgeStudent,
    onMarkBoarded,
    isFullScreen = false,
    onToggleFullScreen,
    showStatsOnMobile = false,
    primaryActionLabel,
    onPrimaryAction,
    primaryActionColor = "red",
    onQrScan,
}: GoogleDriverMapProps) {
    const [isWaitingPanelOpen, setIsWaitingPanelOpen] = useState(false);
    const [mapBroken, setMapBroken] = useState(false);

    const { currentUser } = useAuth();
    const getIdToken = useCallback(() => currentUser?.getIdToken() ?? Promise.resolve(null), [currentUser]);
    const { status, apiKey, retry } = useGoogleMapsClientKey(true, getIdToken);

    if (!tripActive) {
        return (
            <div className="w-full h-full bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 rounded-3xl flex items-center justify-center">
                <div className="text-center p-6">
                    <div className="w-20 h-20 mx-auto mb-6 bg-blue-500 rounded-full flex items-center justify-center shadow-lg">
                        <MapPin className="w-10 h-10 text-white" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">Location Inactive</h3>
                    <p className="text-gray-500">Start the trip to view the map</p>
                </div>
            </div>
        );
    }

    if (tripActive && !driverLocation) {
        return (
            <div className="w-full h-full bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 rounded-3xl flex items-center justify-center">
                <div className="text-center p-6">
                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-4" />
                    <h3 className="text-xl font-bold mb-2">Acquiring GPS…</h3>
                </div>
            </div>
        );
    }

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
            <div className="relative w-full h-full min-h-[300px] rounded-3xl overflow-hidden">
                <MapFallbackUI
                    onRetry={() => {
                        logMapObservability({ category: "network", code: "google_driver_map_user_retry" });
                        setMapBroken(false);
                        retry();
                    }}
                />
                {driverLocation && (
                    <div className="absolute bottom-4 left-4 right-4 z-10 pointer-events-none">
                        <div className="bg-white/95 dark:bg-gray-900/95 rounded-xl shadow-lg p-4 pointer-events-auto border border-gray-100 dark:border-gray-800">
                            <p className="text-xs text-gray-500 dark:text-gray-400">Last known position</p>
                            <p className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                                {driverLocation.lat.toFixed(5)}, {driverLocation.lng.toFixed(5)}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    const defaultCenter = { lat: 26.1445, lng: 91.7362 };
    const centerOptions =
        driverLocation?.lat && driverLocation?.lng
            ? { lat: driverLocation.lat, lng: driverLocation.lng }
            : defaultCenter;

    const markers: MarkerData[] = [];
    if (driverLocation?.lat && driverLocation?.lng) {
        markers.push({
            id: "driver-marker",
            lat: driverLocation.lat,
            lng: driverLocation.lng,
            iconUrl: "https://cdn-icons-png.flaticon.com/512/809/809098.png",
            iconSize: 58,
            zIndex: 100,
        });
    }

    waitingStudents.forEach((student) => {
        if (student.stop_lat && student.stop_lng) {
            const isAcknowledged = student.status === "acknowledged";
            markers.push({
                id: `student-${student.id}`,
                lat: student.stop_lat,
                lng: student.stop_lng,
                iconUrl: isAcknowledged
                    ? "https://cdn-icons-png.flaticon.com/512/5610/5610944.png"
                    : "https://cdn-icons-png.flaticon.com/512/2540/2540614.png",
                iconSize: 44,
                zIndex: isAcknowledged ? 10 : 20,
            });
        }
    });

    return (
        <div className="relative w-full h-full rounded-3xl overflow-hidden shadow-2xl bg-slate-100 dark:bg-slate-900">
            {showStatsOnMobile && (
                <div className={`absolute top-4 left-4 ${isFullScreen ? "right-20" : "right-4"} z-[1000] pointer-events-none`}>
                    <div className="bg-white/90 dark:bg-gray-900/90 rounded-2xl shadow-xl p-3 border border-gray-100 dark:border-gray-800 pointer-events-auto">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                                <Bus className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-500 uppercase">Vehicle</p>
                                <p className="text-lg font-bold">{busNumber || "Bus"}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isFullScreen && (
                <>
                    {onToggleFullScreen && (
                        <button
                            type="button"
                            onClick={onToggleFullScreen}
                            className="absolute top-4 right-4 z-[1001] w-12 h-12 bg-white dark:bg-gray-800 text-gray-700 dark:text-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50"
                        >
                            <Minimize2 className="w-5 h-5" />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setIsWaitingPanelOpen(true)}
                        className="absolute top-20 right-4 z-[999] w-12 h-12 bg-white dark:bg-gray-800 rounded-full shadow-lg flex items-center justify-center"
                    >
                        <Bell className="w-6 h-6 text-green-500" />
                        {waitingStudents.length > 0 && (
                            <span className="absolute -top-1 -right-1 flex h-5 w-5 bg-green-500 text-white rounded-full text-[10px] items-center justify-center font-bold">
                                {waitingStudents.length}
                            </span>
                        )}
                    </button>
                    {onQrScan && (
                        <button
                            type="button"
                            onClick={onQrScan}
                            className="absolute top-36 right-4 z-[999] w-12 h-12 bg-white dark:bg-gray-800 rounded-full shadow-lg flex items-center justify-center"
                        >
                            <ScanLine className="w-6 h-6 text-blue-600" />
                        </button>
                    )}
                </>
            )}

            <GoogleMapView
                apiKey={apiKey}
                center={centerOptions}
                zoom={16}
                markers={markers}
                onLoadError={() => setMapBroken(true)}
                className="w-full h-full !rounded-none"
            />

            {!isFullScreen && onToggleFullScreen && (
                <div className="absolute bottom-6 right-4 z-[1000]">
                    <button
                        type="button"
                        onClick={onToggleFullScreen}
                        className="w-10 h-10 bg-gray-900 text-white rounded-full shadow-lg flex items-center justify-center hover:scale-110"
                    >
                        <Maximize2 className="w-4 h-4" />
                    </button>
                </div>
            )}

            {isFullScreen && primaryActionLabel && onPrimaryAction && (
                <div className="absolute bottom-8 left-4 right-4 z-[1000]">
                    <Button
                        onClick={onPrimaryAction}
                        className={`w-full h-14 text-lg font-bold rounded-xl shadow-lg ${
                            primaryActionColor === "red"
                                ? "bg-red-600 hover:bg-red-700 text-white"
                                : primaryActionColor === "green"
                                  ? "bg-green-600 hover:bg-green-700 text-white"
                                  : "bg-blue-600 hover:bg-blue-700 text-white"
                        }`}
                    >
                        {primaryActionLabel}
                    </Button>
                </div>
            )}

            {isFullScreen && isWaitingPanelOpen && (
                <div
                    role="presentation"
                    className="absolute inset-0 bg-black/40 z-[1001] backdrop-blur-sm"
                    onClick={() => setIsWaitingPanelOpen(false)}
                >
                    <div
                        className="absolute bottom-0 left-0 right-0 z-[1002] bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl transition-transform"
                        style={{ maxHeight: "70vh" }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6 pt-4">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold flex items-center gap-2">
                                    <Users className="w-5 h-5 text-orange-500" /> Waiting list
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setIsWaitingPanelOpen(false)}
                                    className="p-2 bg-gray-100 rounded-full"
                                >
                                    <X className="w-4 h-4 text-gray-600" />
                                </button>
                            </div>
                            <div className="space-y-3 overflow-y-auto max-h-[50vh] pb-8 pr-1">
                                {waitingStudents.length === 0 ? (
                                    <p className="text-center py-8 text-gray-500">No students waiting currently.</p>
                                ) : (
                                    waitingStudents.map((student) => (
                                        <div key={student.id} className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                                            <p className="font-semibold">{student.student_name}</p>
                                            <Button
                                                size="sm"
                                                onClick={() => {
                                                    if (student.status === "acknowledged") {
                                                        onMarkBoarded?.(student.id);
                                                    } else {
                                                        onAcknowledgeStudent?.(student.id);
                                                    }
                                                }}
                                                className={student.status === "acknowledged" ? "bg-green-600" : "bg-orange-500"}
                                            >
                                                {student.status === "acknowledged" ? "Picked up" : "Acknowledge"}
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function GoogleDriverMap(props: GoogleDriverMapProps) {
    return <GoogleDriverMapInner {...props} />;
}
