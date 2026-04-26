let registered = false;
let registering: Promise<void> | null = null;
let protocolInstance: any | null = null;

/**
 * Registers the "pmtiles" protocol for MapLibre exactly once (idempotent).
 * Uses dynamic imports so the heavy map libraries only load when needed.
 */
export function ensurePmtilesProtocolRegistered(): Promise<void> {
  if (registered) return Promise.resolve();
  if (registering) return registering;

  registering = (async () => {
    // Browser-only: MapLibre touches window/document.
    if (typeof window === "undefined") return;

    const maplibregl = await import("maplibre-gl");
    const pmtiles = await import("pmtiles");

    // MapLibre's addProtocol may not exist in some builds; guard safely.
    const addProtocol = (maplibregl as any).addProtocol as
      | ((scheme: string, handler: any) => void)
      | undefined;

    if (!addProtocol) {
      // If addProtocol isn't available, we can't use pmtiles://. Leave unregistered.
      return;
    }

    // Keep protocol instance alive for the app lifetime (avoid GC edge-cases).
    protocolInstance = protocolInstance ?? new (pmtiles as any).Protocol();

    try {
      addProtocol("pmtiles", protocolInstance.tile);
      registered = true;
    } catch {
      // If protocol already registered (hot reload), consider it registered.
      registered = true;
    }
  })().finally(() => {
    registering = null;
  });

  return registering;
}

