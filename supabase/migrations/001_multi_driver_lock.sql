-- =====================================================
-- MULTI-DRIVER LOCK SYSTEM (SIMPLIFIED)
-- Version: 2.0 - No Audit, No Admin
-- Date: 2026-01-26
-- 
-- Tables:
--   - active_trips: Live trip records with heartbeat
-- 
-- "The system enforces exclusive bus operation using a 
-- server-controlled distributed lock and automatic 
-- heartbeat recovery, without manual overrides or 
-- administrative intervention."
-- =====================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- SECTION 1: ACTIVE_TRIPS TABLE
-- Live trip records for currently running trips
-- =====================================================

CREATE TABLE IF NOT EXISTS public.active_trips (
  trip_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id TEXT NOT NULL,
  driver_id TEXT NOT NULL,
  route_id TEXT NOT NULL,
  shift TEXT NOT NULL CHECK (shift IN ('morning', 'evening', 'both')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for active_trips
CREATE INDEX IF NOT EXISTS idx_active_trips_bus_id ON public.active_trips(bus_id);
CREATE INDEX IF NOT EXISTS idx_active_trips_driver_id ON public.active_trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_active_trips_status ON public.active_trips(status);
CREATE INDEX IF NOT EXISTS idx_active_trips_status_bus ON public.active_trips(bus_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_active_trips_heartbeat ON public.active_trips(last_heartbeat) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_active_trips_start_time ON public.active_trips(start_time DESC);

-- Add comments
COMMENT ON TABLE public.active_trips IS 'Live trip records for multi-driver lock system';
COMMENT ON COLUMN public.active_trips.trip_id IS 'Unique trip identifier';
COMMENT ON COLUMN public.active_trips.shift IS 'Trip shift: morning, evening, or both';
COMMENT ON COLUMN public.active_trips.last_heartbeat IS 'Last heartbeat from driver, used for stale lock detection';

-- =====================================================
-- SECTION 2: TRIGGERS FOR updated_at
-- =====================================================

-- Trigger for active_trips
DROP TRIGGER IF EXISTS active_trips_updated_at ON public.active_trips;
CREATE TRIGGER active_trips_updated_at
  BEFORE UPDATE ON public.active_trips
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SECTION 3: ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS
ALTER TABLE public.active_trips ENABLE ROW LEVEL SECURITY;

-- ========== active_trips policies ==========
-- Drivers can read active trips for any bus (to see if locked)
DROP POLICY IF EXISTS "active_trips_select_authenticated" ON public.active_trips;
CREATE POLICY "active_trips_select_authenticated" ON public.active_trips
  FOR SELECT TO authenticated
  USING (true);

-- Only service role can insert
DROP POLICY IF EXISTS "active_trips_insert_service" ON public.active_trips;
CREATE POLICY "active_trips_insert_service" ON public.active_trips
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Only service role can update
DROP POLICY IF EXISTS "active_trips_update_service" ON public.active_trips;
CREATE POLICY "active_trips_update_service" ON public.active_trips
  FOR UPDATE USING (auth.role() = 'service_role');

-- Only service role can delete (for cleanup)
DROP POLICY IF EXISTS "active_trips_delete_service" ON public.active_trips;
CREATE POLICY "active_trips_delete_service" ON public.active_trips
  FOR DELETE USING (auth.role() = 'service_role');

-- =====================================================
-- SECTION 4: GRANTS
-- =====================================================

GRANT SELECT ON public.active_trips TO authenticated;

-- =====================================================
-- SECTION 5: ENABLE REALTIME
-- =====================================================

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'active_trips') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE active_trips;
  END IF;
END $$;

-- =====================================================
-- SECTION 6: HELPER FUNCTIONS
-- =====================================================

-- Function to check if a bus is locked
CREATE OR REPLACE FUNCTION check_bus_lock(p_bus_id TEXT)
RETURNS TABLE(
  is_locked BOOLEAN,
  locked_by TEXT,
  trip_id UUID,
  locked_since TIMESTAMPTZ,
  last_heartbeat TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    TRUE AS is_locked,
    at.driver_id AS locked_by,
    at.trip_id,
    at.start_time AS locked_since,
    at.last_heartbeat
  FROM public.active_trips at
  WHERE at.bus_id = p_bus_id
    AND at.status = 'active'
  LIMIT 1;
  
  -- Return unlocked state if no active trip found
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::UUID, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get stale locks (for cleanup worker)
CREATE OR REPLACE FUNCTION get_stale_locks(p_heartbeat_timeout_seconds INTEGER DEFAULT 60)
RETURNS TABLE(
  trip_id UUID,
  bus_id TEXT,
  driver_id TEXT,
  last_heartbeat TIMESTAMPTZ,
  stale_duration INTERVAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    at.trip_id,
    at.bus_id,
    at.driver_id,
    at.last_heartbeat,
    NOW() - at.last_heartbeat AS stale_duration
  FROM public.active_trips at
  WHERE at.status = 'active'
    AND at.last_heartbeat < NOW() - (p_heartbeat_timeout_seconds || ' seconds')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up stale locks (called by worker)
CREATE OR REPLACE FUNCTION cleanup_stale_locks(p_heartbeat_timeout_seconds INTEGER DEFAULT 60)
RETURNS TABLE(
  cleaned_trip_id UUID,
  cleaned_bus_id TEXT,
  cleaned_driver_id TEXT
) AS $$
DECLARE
  v_trip RECORD;
BEGIN
  FOR v_trip IN
    SELECT at.trip_id, at.bus_id, at.driver_id
    FROM public.active_trips at
    WHERE at.status = 'active'
      AND at.last_heartbeat < NOW() - (p_heartbeat_timeout_seconds || ' seconds')::INTERVAL
  LOOP
    -- End the trip
    UPDATE public.active_trips
    SET status = 'ended',
        end_time = NOW()
    WHERE active_trips.trip_id = v_trip.trip_id;
    
    RETURN QUERY SELECT v_trip.trip_id, v_trip.bus_id, v_trip.driver_id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- SECTION 7: CLEANUP OLD TABLES (if upgrading)
-- =====================================================

-- Drop deprecated tables if they exist
DROP TABLE IF EXISTS public.pending_trips CASCADE;
DROP TABLE IF EXISTS public.trip_events CASCADE;

SELECT 'Multi-driver lock system (simplified) migration completed successfully' AS result;