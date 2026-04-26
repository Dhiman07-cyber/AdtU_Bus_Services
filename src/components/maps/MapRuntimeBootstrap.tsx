"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSystemConfig } from "@/contexts/SystemConfigContext";
import { readMapPreferences, resolveThemePreference, systemConfigProviderToUserProvider } from "@/lib/maps/map-preferences";
import { ensurePmtilesProtocolRegistered } from "@/lib/maps/pmtiles-protocol";

const TRACKING_ROUTES = ["/student/track-bus", "/driver/live-tracking"];

function isTrackingRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return TRACKING_ROUTES.some((p) => pathname.startsWith(p));
}

/**
 * App-level bootstrap for map runtime.
 *
 * - Keeps registration centralized (not inside individual map components)
 * - Uses dynamic imports so map libraries aren't loaded on unrelated pages
 * - Idempotent (safe with React strict mode / HMR)
 */
export default function MapRuntimeBootstrap() {
  const pathname = usePathname();
  const { config } = useSystemConfig();

  useEffect(() => {
    if (!isTrackingRoute(pathname)) return;

    // Determine preferred provider (user preference overrides system config).
    const prefs = readMapPreferences();
    const provider = prefs?.provider ?? systemConfigProviderToUserProvider(config?.mapProvider);

    // Ensure theme is computed once to avoid re-register loops on theme toggles.
    void resolveThemePreference(prefs?.theme);

    if (provider === "guwahati") {
      void ensurePmtilesProtocolRegistered();
    }
  }, [pathname, config?.mapProvider]);

  return null;
}

