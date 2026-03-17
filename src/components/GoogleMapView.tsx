"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { GoogleMap, useJsApiLoader, Marker, Circle } from "@react-google-maps/api";

export interface MarkerData {
    id: string;
    lat: number;
    lng: number;
    title?: string;
    label?: string;
    iconUrl?: string;
    iconSize?: number;
    zIndex?: number;
}

export interface GoogleMapViewProps {
    apiKey: string;
    center: { lat: number; lng: number };
    zoom?: number;
    markers?: MarkerData[];
    onMapReady?: (map: any) => void;
    circle?: { center: { lat: number; lng: number }; radius: number; color?: string };
    className?: string;
    darkMode?: boolean;
}

const DARK_STYLE = [
    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
    { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
    { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] },
];

const libraries = ["geometry"] as any;

export default function GoogleMapView({
    apiKey,
    center,
    zoom = 15,
    markers = [],
    onMapReady,
    circle,
    className = "",
    darkMode = false,
}: GoogleMapViewProps) {

    // Safety check for center
    const safeCenter = useMemo(() => {
        return center?.lat !== undefined && center?.lng !== undefined
            ? center
            : { lat: 26.1440, lng: 91.7360 };
    }, [center?.lat, center?.lng]);

    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: apiKey,
        libraries: libraries,
    });

    const [map, setMap] = useState<any>(null);

    const onLoad = useCallback(function callback(mapInstance: any) {
        setMap(mapInstance);
        if (onMapReady) onMapReady(mapInstance);
    }, [onMapReady]);

    const onUnmount = useCallback(function callback(mapInstance: any) {
        setMap(null);
    }, []);

    // Effect to handle panning to new center smoothly if map is loaded
    useEffect(() => {
        if (map && safeCenter) {
            map.panTo(safeCenter);
        }
    }, [map, safeCenter]);

    if (loadError) {
        return (
            <div className={`flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-2xl p-4 ${className}`}>
                <p className="text-red-500 font-bold mb-2">Map Error</p>
                <p className="text-xs text-red-400 text-center">{loadError.message || "Failed to load maps API"}</p>
            </div>
        );
    }

    if (!isLoaded) {
        return (
            <div className={`relative ${className}`}>
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-2xl">
                    <div className="flex flex-col items-center gap-3">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                        <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Loading Google Maps...</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`relative ${className} rounded-2xl overflow-hidden`}>
            <GoogleMap
                mapContainerStyle={{ width: "100%", height: "100%" }}
                center={safeCenter}
                zoom={zoom}
                onLoad={onLoad}
                onUnmount={onUnmount}
                options={{
                    disableDefaultUI: true,
                    zoomControl: true,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                    styles: darkMode ? DARK_STYLE : [],
                    gestureHandling: "greedy",
                }}
            >
                {/* Render Markers */}
                {markers.map((m) => {
                    const iconOpts = typeof window !== 'undefined' && window.google && m.iconUrl ? {
                        url: m.iconUrl,
                        scaledSize: new window.google.maps.Size(m.iconSize || 44, m.iconSize || 44)
                    } : undefined;

                    return (
                        <Marker
                            key={m.id}
                            position={{ lat: m.lat, lng: m.lng }}
                            title={m.title}
                            zIndex={m.zIndex || 1}
                            icon={iconOpts}
                        />
                    )
                })}
                {/* Render Circle if provided */}
                {circle?.center?.lat !== undefined && circle?.center?.lng !== undefined && (
                    <Circle
                        center={circle.center}
                        radius={circle.radius}
                        options={{
                            fillColor: circle.color || "#3B82F6",
                            fillOpacity: 0.1,
                            strokeColor: circle.color || "#3B82F6",
                            strokeOpacity: 0.3,
                            strokeWeight: 1,
                        }}
                    />
                )}
            </GoogleMap>
        </div>
    );
}
