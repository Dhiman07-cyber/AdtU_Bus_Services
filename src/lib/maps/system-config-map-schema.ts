import { z } from "zod";

export const mapProviderSchema = z.enum(["osm", "carto", "google"]);

export type ValidatedMapProvider = z.infer<typeof mapProviderSchema>;

/** Strips and validates mapProvider from an admin config patch. Returns undefined if absent/invalid. */
export function sanitizeMapProviderInput(raw: unknown): ValidatedMapProvider | undefined {
    if (raw === undefined || raw === null) return undefined;
    const r = mapProviderSchema.safeParse(raw);
    return r.success ? r.data : undefined;
}
