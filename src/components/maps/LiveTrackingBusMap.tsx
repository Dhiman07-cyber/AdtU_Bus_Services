"use client";

import type { ComponentProps } from "react";
import dynamic from "next/dynamic";
import { useSystemConfig } from "@/contexts/SystemConfigContext";
import { engineFromMapProvider } from "@/lib/maps/map-provider-types";
import MapErrorBoundary from "./MapErrorBoundary";
import type { RouteStopLite } from "./GoogleBusMap";

const GoogleBusMap = dynamic(() => import("@/components/maps/GoogleBusMap"), {
    ssr: false,
    loading: () => <div className="h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-3xl animate-pulse" />,
});

const GuwahatiBusMap = dynamic(() => import("@/components/maps/GuwahatiBusMap"), {
    ssr: false,
    loading: () => <div className="h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-3xl animate-pulse" />,
});

export type LiveTrackingBusMapProps = {
    busId: string;
    busNumber?: string;
    journeyActive?: boolean;
    isFullScreen?: boolean;
    onToggleFullScreen?: () => void;
    showStatsOnMobile?: boolean;
    primaryActionLabel?: string;
    onPrimaryAction?: () => void;
    primaryActionColor?: 'red' | 'blue' | 'green' | 'orange' | 'yellow';
    primaryActionDisabled?: boolean;
    studentLocation?: { lat: number; lng: number; accuracy?: number } | null;
    onShowQrCode?: () => void;
    currentLocation?: any;
    loading?: boolean;
    /** Shown on Google Maps only (route polyline + stop pins). */
    routeStops?: RouteStopLite[];
};

/**
 * Admin-controlled map engine for student live tracking.
 * - Default (custom): Guwahati Map (MapLibre + PMTiles)
 * - Fallback: Google Maps
 * - Legacy: Leaflet (osm/carto) kept for backward compatibility (hidden from new UI)
 */
export default function LiveTrackingBusMap(props: LiveTrackingBusMapProps) {
    const { config } = useSystemConfig();
    const { routeStops, ...rest } = props;
    const engine = engineFromMapProvider(config?.mapProvider);

    return (
        <MapErrorBoundary>
            {engine === "google" ? (
                <GoogleBusMap {...rest} routeStops={routeStops} />
            ) : (
                <GuwahatiBusMap
                    key={`h-${props.busId}`}
                    {...rest}
                />
            )}
        </MapErrorBoundary>
    );
}
