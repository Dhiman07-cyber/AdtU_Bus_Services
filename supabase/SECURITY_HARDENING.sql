-- =====================================================
-- ADTU Bus XQ System - COMPREHENSIVE SECURITY PATCH (ROBUST)
-- This script fixes "Mutable Search Path" warnings and "Always True" RLS policies.
-- Run this in the Supabase SQL Editor to secure your database.
-- =====================================================

-- 0. ENSURE SECURITY INFRASTRUCTURE EXISTS
-- device_sessions table (single-device session management)
CREATE TABLE IF NOT EXISTS public.device_sessions (
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  feature TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, feature)
);

-- Function to cleanup stale device sessions
CREATE OR REPLACE FUNCTION public.cleanup_stale_device_sessions(p_timeout_seconds INTEGER DEFAULT 60)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  DELETE FROM public.device_sessions
  WHERE last_active_at < NOW() - (p_timeout_seconds || ' seconds')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1. FIX SEARCH PATH FOR ALL FUNCTIONS
-- This prevents search_path attacks where a malicious user could 
-- override standard functions with their own.
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT n.nspname as schema, p.proname as name, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
    LOOP
        EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', 
                       func_record.schema, func_record.name, func_record.args);
    END LOOP;
END $$;

-- 2. HARDEN RLS POLICIES FOR DEVICE_SESSIONS
-- Only allow users to manage their own sessions.
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;

-- Systematic cleanup: Drop ALL existing policies on device_sessions 
-- regardless of name to remove "Always True" lingering policies.
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'device_sessions' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.device_sessions', policy_record.policyname);
    END LOOP;
END $$;

-- Create restrictive policies
CREATE POLICY "device_sessions_select_own" ON public.device_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()::text OR auth.role() = 'service_role');

CREATE POLICY "device_sessions_insert_own" ON public.device_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text OR auth.role() = 'service_role');

CREATE POLICY "device_sessions_update_own" ON public.device_sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()::text OR auth.role() = 'service_role');

CREATE POLICY "device_sessions_delete_own" ON public.device_sessions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid()::text OR auth.role() = 'service_role');

-- 3. FIX OVERLY PERMISSIVE POLICIES (Example: active_trips and bus_locations)
-- Ensure only authenticated users can read, and only service_role can write.

-- bus_locations: SELECT for authenticated, rest for service_role
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'bus_locations' AND schemaname = 'public') THEN
        ALTER TABLE public.bus_locations ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "bus_locations_select_authenticated" ON public.bus_locations;
        CREATE POLICY "bus_locations_select_authenticated" ON public.bus_locations
          FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

-- active_trips: SELECT for authenticated, rest for service_role
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'active_trips' AND schemaname = 'public') THEN
        ALTER TABLE public.active_trips ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "active_trips_select_authenticated" ON public.active_trips;
        CREATE POLICY "active_trips_select_authenticated" ON public.active_trips
          FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

-- 4. CLEAN UP ANONYMOUS ACCESS
-- Revoke all permissions from the 'anon' role by default, except where explicitly needed.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Explicitly allow 'anon' to read driver_status (needed for public tracking if not logged in)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'driver_status' AND schemaname = 'public') THEN
        GRANT SELECT ON public.driver_status TO anon;
    END IF;
END $$;

-- 5. ENSURE RLS IS ENABLED ON ALL TABLES
DO $$
DECLARE
    table_record RECORD;
BEGIN
    FOR table_record IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_record.tablename);
    END LOOP;
END $$;

-- 6. ADD SECURITY DEFINER TO CRITICAL HELPERS Safely
-- These functions need to run with elevated privileges but with a fixed search_path.
DO $$
DECLARE
    f_exists BOOLEAN;
BEGIN
    -- get_effective_driver
    SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'get_effective_driver') INTO f_exists;
    IF f_exists THEN 
        EXECUTE 'ALTER FUNCTION public.get_effective_driver(text) SECURITY DEFINER'; 
    END IF;

    -- expire_temporary_assignments
    SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'expire_temporary_assignments') INTO f_exists;
    IF f_exists THEN 
        EXECUTE 'ALTER FUNCTION public.expire_temporary_assignments() SECURITY DEFINER'; 
    END IF;

    -- cleanup_old_reassignment_logs
    SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'cleanup_old_reassignment_logs') INTO f_exists;
    IF f_exists THEN 
        EXECUTE 'ALTER FUNCTION public.cleanup_old_reassignment_logs() SECURITY DEFINER'; 
    END IF;

    -- check_bus_lock
    SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'check_bus_lock') INTO f_exists;
    IF f_exists THEN 
        EXECUTE 'ALTER FUNCTION public.check_bus_lock(text) SECURITY DEFINER'; 
    END IF;

    -- get_stale_locks
    SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'get_stale_locks') INTO f_exists;
    IF f_exists THEN 
        EXECUTE 'ALTER FUNCTION public.get_stale_locks(int) SECURITY DEFINER'; 
    END IF;

    -- cleanup_stale_locks
    SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'cleanup_stale_locks') INTO f_exists;
    IF f_exists THEN 
        EXECUTE 'ALTER FUNCTION public.cleanup_stale_locks(int) SECURITY DEFINER'; 
    END IF;

    -- expire_missed_bus_requests
    SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'expire_missed_bus_requests') INTO f_exists;
    IF f_exists THEN 
        EXECUTE 'ALTER FUNCTION public.expire_missed_bus_requests() SECURITY DEFINER'; 
    END IF;

    -- cleanup_stale_device_sessions (We just created it above, so it will exist)
    ALTER FUNCTION public.cleanup_stale_device_sessions(int) SECURITY DEFINER;
END $$;

-- 7. AUDIT LOG (Optional)
SELECT 'Security Patch Applied Successfully' as status, now() as timestamp;
