"use client";

import type { ComponentProps } from "react";
import dynamic from "next/dynamic";
import { useSystemConfig } from "@/contexts/SystemConfigContext";
import { engineFromMapProvider } from "@/lib/maps/map-provider-types";
import MapErrorBoundary from "./MapErrorBoundary";

const GoogleDriverMap = dynamic(() => import("@/components/maps/GoogleDriverMap"), {
    ssr: false,
    loading: () => <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-3xl animate-pulse" />,
});

const GuwahatiDriverMap = dynamic(() => import("@/components/maps/GuwahatiDriverMap"), {
    ssr: false,
    loading: () => <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-3xl animate-pulse" />,
});

export type LiveTrackingDriverMapProps = {
    driverLocation: { lat: number; lng: number; accuracy: number } | null;
    waitingStudents: any[];
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
};

/**
 * Admin-controlled map engine for driver live tracking.
 */
export default function LiveTrackingDriverMap(props: LiveTrackingDriverMapProps) {
    const { config } = useSystemConfig();
    const engine = engineFromMapProvider(config?.mapProvider);

    return (
        <MapErrorBoundary>
            {engine === "google" ? (
                <GoogleDriverMap {...props} />
            ) : (
                <GuwahatiDriverMap
                    {...props}
                />
            )}
        </MapErrorBoundary>
    );
}
