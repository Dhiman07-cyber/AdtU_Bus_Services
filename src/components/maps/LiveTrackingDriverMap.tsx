"use client";

import type { ComponentProps } from "react";
import dynamic from "next/dynamic";
import { useSystemConfig } from "@/contexts/SystemConfigContext";
import { engineFromMapProvider } from "@/lib/maps/map-provider-types";
import MapErrorBoundary from "./MapErrorBoundary";

const UberLikeDriverMap = dynamic(() => import("@/components/UberLikeDriverMap"), {
    ssr: false,
    loading: () => <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-3xl animate-pulse" />,
});

const GoogleDriverMap = dynamic(() => import("@/components/maps/GoogleDriverMap"), {
    ssr: false,
    loading: () => <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-3xl animate-pulse" />,
});

type DriverProps = ComponentProps<typeof UberLikeDriverMap>;

/**
 * Admin-controlled map engine for driver live tracking.
 */
export default function LiveTrackingDriverMap(props: DriverProps) {
    const { config } = useSystemConfig();
    const engine = engineFromMapProvider(config?.mapProvider);

    return (
        <MapErrorBoundary>
            {engine === "google" ? (
                <GoogleDriverMap {...props} />
            ) : (
                <UberLikeDriverMap {...props} />
            )}
        </MapErrorBoundary>
    );
}
