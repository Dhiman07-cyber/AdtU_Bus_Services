/**
 * Returns the PMTiles URL for Guwahati.
 * Primarily checks for NEXT_PUBLIC_GUWAHATI_PMTILES_URL from env,
 * otherwise falls back to a local file.
 */
export function getGuwahatiPmtilesUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_GUWAHATI_PMTILES_URL;
  if (envUrl && envUrl.length > 5) {
    return envUrl;
  }
  
  // Fallback to local public path
  return '/maps/guwahati.pmtiles';
}

export function isNonEmptyHttpUrl(value: string): boolean {
  if (!value) return false;
  return value.startsWith('/') || value.startsWith('http'); 
}


