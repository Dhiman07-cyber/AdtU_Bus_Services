import { z } from "zod";

// Stored in Firestore system config.
// Legacy values ("osm", "carto") are kept for backward compatibility, but should be hidden from new UI.
export const mapProviderSchema = z.enum(["osm", "carto", "google", "guwahati"]);

export type ValidatedMapProvider = z.infer<typeof mapProviderSchema>;

/** Strips and validates mapProvider from an admin config patch. Returns undefined if absent/invalid. */
export function sanitizeMapProviderInput(raw: unknown): ValidatedMapProvider | undefined {
    if (raw === undefined || raw === null) return undefined;
    const r = mapProviderSchema.safeParse(raw);
    return r.success ? r.data : undefined;
}
