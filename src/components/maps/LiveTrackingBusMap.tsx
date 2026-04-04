"use client";

import type { ComponentProps } from "react";
import dynamic from "next/dynamic";
import { useSystemConfig } from "@/contexts/SystemConfigContext";
import { engineFromMapProvider } from "@/lib/maps/map-provider-types";
import MapErrorBoundary from "./MapErrorBoundary";
import type { RouteStopLite } from "./GoogleBusMap";

const UberLikeBusMap = dynamic(() => import("@/components/UberLikeBusMap"), {
    ssr: false,
    loading: () => <div className="h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-3xl animate-pulse" />,
});

const GoogleBusMap = dynamic(() => import("@/components/maps/GoogleBusMap"), {
    ssr: false,
    loading: () => <div className="h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-3xl animate-pulse" />,
});

type UberProps = ComponentProps<typeof UberLikeBusMap>;

export type LiveTrackingBusMapProps = UberProps & {
    /** Shown on Google Maps only (route polyline + stop pins). */
    routeStops?: RouteStopLite[];
};

/**
 * Admin-controlled map engine for student live tracking.
 * Leaflet when mapProvider is osm/carto; Google when mapProvider is google.
 */
export default function LiveTrackingBusMap(props: LiveTrackingBusMapProps) {
    const { config } = useSystemConfig();
    const engine = engineFromMapProvider(config?.mapProvider);
    const { routeStops, ...uberProps } = props;

    return (
        <MapErrorBoundary>
            {engine === "google" ? (
                <GoogleBusMap key={`g-${props.busId}`} {...uberProps} routeStops={routeStops} />
            ) : (
                <UberLikeBusMap key={`l-${props.busId}`} {...uberProps} />
            )}
        </MapErrorBoundary>
    );
}
