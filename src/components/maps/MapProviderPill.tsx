"use client";

import React, { useMemo } from "react";
import { Globe, Map as MapIcon } from "lucide-react";
import type { MapProvider, MapTheme } from "@/lib/maps/map-config";
import { readMapPreferences, writeMapPreferences, resolveThemePreference } from "@/lib/maps/map-preferences";

export default function MapProviderPill({
  provider,
  onProviderChange,
  theme,
}: {
  provider: MapProvider;
  onProviderChange: (p: MapProvider) => void;
  theme?: MapTheme;
}) {
  const effectiveTheme = useMemo(() => resolveThemePreference(theme), [theme]);

  return (
    <div className="pointer-events-auto">
      <div className="inline-flex items-center gap-1 rounded-2xl bg-white/90 dark:bg-gray-900/80 backdrop-blur border border-black/5 dark:border-white/10 p-1 shadow-lg">
        <button
          type="button"
          onClick={() => {
            const next: MapProvider = "guwahati";
            onProviderChange(next);
            const prev = readMapPreferences();
            writeMapPreferences({
              provider: next,
              theme: prev?.theme ?? effectiveTheme,
              center: prev?.center,
              zoom: prev?.zoom,
            });
          }}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
            provider === "guwahati"
              ? "bg-gradient-to-r from-indigo-600 to-blue-600 text-white"
              : "text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/10"
          }`}
          aria-pressed={provider === "guwahati"}
        >
          <MapIcon className="h-4 w-4" />
          Guwahati
        </button>
        <button
          type="button"
          onClick={() => {
            const next: MapProvider = "gmap";
            onProviderChange(next);
            const prev = readMapPreferences();
            writeMapPreferences({
              provider: next,
              theme: prev?.theme ?? effectiveTheme,
              center: prev?.center,
              zoom: prev?.zoom,
            });
          }}
          className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
            provider === "gmap"
              ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white"
              : "text-gray-700 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/10"
          }`}
          aria-pressed={provider === "gmap"}
        >
          <Globe className="h-4 w-4" />
          Google
        </button>
      </div>
    </div>
  );
}

