"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { GoogleMap, useJsApiLoader, Marker, Circle, Polyline } from "@react-google-maps/api";
import MapFallbackUI from "./maps/MapFallbackUI";
import { classifyGoogleLoadError, logMapObservability } from "@/lib/maps/map-observability";

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
    /** Ordered path for route visualization (optional). */
    routePath?: Array<{ lat: number; lng: number }>;
    onMapReady?: (map: google.maps.Map | null) => void;
    circle?: { center: { lat: number; lng: number }; radius: number; color?: string };
    className?: string;
    darkMode?: boolean;
    onLoadError?: () => void;
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

function GoogleMapViewImpl({
    apiKey,
    center,
    zoom = 15,
    markers = [],
    routePath,
    onMapReady,
    circle,
    className = "",
    darkMode = false,
    onLoadError,
}: GoogleMapViewProps) {
    const safeCenter = useMemo(() => {
        return center?.lat !== undefined && center?.lng !== undefined
            ? center
            : { lat: 26.1440, lng: 91.7360 };
    }, [center?.lat, center?.lng]);

    const { isLoaded, loadError } = useJsApiLoader({
        id: "google-map-script",
        googleMapsApiKey: apiKey,
        libraries: libraries,
        preventGoogleFontsLoading: true,
    });

    const [map, setMap] = useState<google.maps.Map | null>(null);

    const onLoad = useCallback(
        function callback(mapInstance: google.maps.Map) {
            setMap(mapInstance);
            onMapReady?.(mapInstance);
        },
        [onMapReady]
    );

    const onUnmount = useCallback(function callback() {
        setMap(null);
    }, []);

    useEffect(() => {
        if (map && safeCenter) {
            map.panTo(safeCenter);
        }
    }, [map, safeCenter]);

    useEffect(() => {
        if (!loadError) return;
        const cat = classifyGoogleLoadError(loadError.message);
        logMapObservability({
            category: cat,
            code: "google_maps_js_loader_error",
            detail: { message: loadError.message },
        });
        onLoadError?.();
    }, [loadError, onLoadError]);

    if (loadError) {
        return <MapFallbackUI className={className} />;
    }

    if (!isLoaded) {
        return (
            <div className={`relative ${className}`}>
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-2xl">
                    <div className="flex flex-col items-center gap-3">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                        <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">Loading map…</span>
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
                {routePath && routePath.length > 1 && (
                    <Polyline
                        path={routePath}
                        options={{
                            strokeColor: "#2563EB",
                            strokeOpacity: 0.92,
                            strokeWeight: 4,
                            geodesic: true,
                        }}
                    />
                )}

                {markers.map((m) => {
                    const iconOpts =
                        typeof window !== "undefined" && window.google && m.iconUrl
                            ? {
                                url: m.iconUrl,
                                scaledSize: new window.google.maps.Size(m.iconSize || 44, m.iconSize || 44),
                            }
                            : undefined;

                    return (
                        <Marker
                            key={m.id}
                            position={{ lat: m.lat, lng: m.lng }}
                            title={m.title}
                            zIndex={m.zIndex || 1}
                            icon={iconOpts}
                        />
                    );
                })}
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

/** Loads Google Maps JS only when `apiKey` is non-empty (parent must gate). */
export default function GoogleMapView(props: GoogleMapViewProps) {
    if (!props.apiKey?.trim()) {
        return <MapFallbackUI className={props.className} />;
    }
    return <GoogleMapViewImpl {...props} apiKey={props.apiKey.trim()} />;
}
