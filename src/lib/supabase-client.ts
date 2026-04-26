import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  const msg = 'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY';
  if (typeof window !== 'undefined') {
    // Client-side: warn but don't throw (SSR prerendering may not have env)
    console.error(`⚠️ ${msg}`);
  }
}

// Create a single supabase client for interacting with the database
export const supabase = createClient(
  supabaseUrl || '',
  supabaseAnonKey || ''
);

export const db = supabase;