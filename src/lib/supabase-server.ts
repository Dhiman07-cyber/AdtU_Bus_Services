/**
 * Server-side Supabase Client Singleton
 * 
 * PERF: Reuses a single SupabaseClient instance w/ service-role key
 * across all API routes, avoiding the overhead of createClient() per request.
 * 
 * SECURITY: Uses SUPABASE_SERVICE_ROLE_KEY — NEVER import this in client code.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _serverClient: SupabaseClient | null = null;

/**
 * Returns a singleton Supabase client for server-side (API route) usage.
 * Uses service-role key to bypass RLS for admin operations.
 */
export function getSupabaseServer(): SupabaseClient {
  if (!_serverClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars'
      );
    }

    _serverClient = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      // Disable realtime on server — we only need REST
      realtime: { params: { eventsPerSecond: 0 } },
    });
  }

  return _serverClient;
}
