/** Live tracking map engines (UI implementation), derived from admin mapProvider config. */
export type LiveMapEngine = "leaflet" | "google" | "guwahati";

/** Stored in Firestore system config — validated server-side. */
export type MapProviderId = "osm" | "carto" | "google" | "guwahati";

export function engineFromMapProvider(provider: MapProviderId | undefined | null): LiveMapEngine {
    if (provider === "google") return "google";
    // Default to guwahati for everything else (replaces legacy leaflet)
    return "guwahati";
}
