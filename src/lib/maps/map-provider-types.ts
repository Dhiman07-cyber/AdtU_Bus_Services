/** Live tracking map engines (UI implementation), derived from admin mapProvider config. */
export type LiveMapEngine = "leaflet" | "google";

/** Stored in Firestore system config — validated server-side. */
export type MapProviderId = "osm" | "carto" | "google";

export function engineFromMapProvider(provider: MapProviderId | undefined | null): LiveMapEngine {
    if (provider === "google") return "google";
    return "leaflet";
}
