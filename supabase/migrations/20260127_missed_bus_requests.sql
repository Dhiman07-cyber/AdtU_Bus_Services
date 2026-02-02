-- =====================================================
-- MISSED BUS REQUESTS TABLE
-- Created: January 27, 2026
-- 
-- This table stores missed-bus pickup requests from students.
-- Students can request an alternate bus when they miss their assigned bus.
-- Drivers can accept/reject these requests.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.missed_bus_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Idempotency key from client
  op_id TEXT,
  
  -- Student information
  student_id TEXT NOT NULL,
  
  -- Route and stop information
  route_id TEXT NOT NULL,
  stop_id TEXT NOT NULL,
  student_sequence INT NULL,  -- cached resolve of stop sequence
  
  -- When driver accepts, this is set to their active trip id
  candidate_trip_id UUID NULL,
  
  -- List of candidate trip IDs & raw ETA data (small JSON)
  trip_candidates JSONB NULL,
  
  -- Request status: pending | approved | rejected | expired | cancelled
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  
  -- Response tracking
  responded_by TEXT NULL,
  responded_at TIMESTAMPTZ NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_missed_bus_requests_student_id ON public.missed_bus_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_missed_bus_requests_op_id ON public.missed_bus_requests(op_id);
CREATE INDEX IF NOT EXISTS idx_missed_bus_requests_candidate_trip_id ON public.missed_bus_requests(candidate_trip_id);
CREATE INDEX IF NOT EXISTS idx_missed_bus_requests_status ON public.missed_bus_requests(status);
CREATE INDEX IF NOT EXISTS idx_missed_bus_requests_expires_at ON public.missed_bus_requests(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_missed_bus_requests_route_stop ON public.missed_bus_requests(route_id, stop_id);

-- Index for realtime subscription efficiency
CREATE INDEX IF NOT EXISTS idx_missed_bus_requests_trip_candidates ON public.missed_bus_requests USING GIN (trip_candidates);

-- Enable RLS
ALTER TABLE public.missed_bus_requests ENABLE ROW LEVEL SECURITY;

-- Students can read their own missed bus requests
DROP POLICY IF EXISTS "missed_bus_requests_select_own" ON public.missed_bus_requests;
CREATE POLICY "missed_bus_requests_select_own" ON public.missed_bus_requests
  FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()::text
    OR auth.role() = 'service_role'
  );

-- Drivers can read missed bus requests where their trip is a candidate
DROP POLICY IF EXISTS "missed_bus_requests_select_driver_candidates" ON public.missed_bus_requests;
CREATE POLICY "missed_bus_requests_select_driver_candidates" ON public.missed_bus_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.active_trips at
      WHERE at.driver_id = auth.uid()::text
        AND at.status = 'active'
        AND (
          trip_candidates ? at.trip_id::text
          OR candidate_trip_id = at.trip_id
        )
    )
    OR auth.role() = 'service_role'
  );

-- Only service role can insert/update/delete (server-controlled)
DROP POLICY IF EXISTS "missed_bus_requests_insert_service" ON public.missed_bus_requests;
CREATE POLICY "missed_bus_requests_insert_service" ON public.missed_bus_requests
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "missed_bus_requests_update_service" ON public.missed_bus_requests;
CREATE POLICY "missed_bus_requests_update_service" ON public.missed_bus_requests
  FOR UPDATE USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "missed_bus_requests_delete_service" ON public.missed_bus_requests;
CREATE POLICY "missed_bus_requests_delete_service" ON public.missed_bus_requests
  FOR DELETE USING (auth.role() = 'service_role');

-- Grant read access to authenticated users (via RLS policies)
GRANT SELECT ON public.missed_bus_requests TO authenticated;

-- Enable realtime for missed_bus_requests
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'missed_bus_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE missed_bus_requests;
  END IF;
END $$;

-- Function to expire stale missed bus requests
CREATE OR REPLACE FUNCTION expire_missed_bus_requests()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER := 0;
BEGIN
  UPDATE public.missed_bus_requests
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < NOW();
    
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if a trip has pending missed bus requests
CREATE OR REPLACE FUNCTION get_pending_missed_bus_requests_for_trip(p_trip_id UUID)
RETURNS TABLE(
  request_id UUID,
  student_id TEXT,
  route_id TEXT,
  stop_id TEXT,
  student_sequence INT,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    mbr.id AS request_id,
    mbr.student_id,
    mbr.route_id,
    mbr.stop_id,
    mbr.student_sequence,
    mbr.created_at,
    mbr.expires_at
  FROM public.missed_bus_requests mbr
  WHERE mbr.status = 'pending'
    AND mbr.trip_candidates ? p_trip_id::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Documentation
COMMENT ON TABLE public.missed_bus_requests IS 'Stores missed-bus pickup requests from students seeking alternate buses when they miss their assigned bus.';
COMMENT ON COLUMN public.missed_bus_requests.op_id IS 'Client-provided idempotency key to prevent duplicate requests.';
COMMENT ON COLUMN public.missed_bus_requests.trip_candidates IS 'JSON array containing candidate trip IDs and ETA values.';
COMMENT ON COLUMN public.missed_bus_requests.student_sequence IS 'Cached stop sequence number for the student''s stop on the route.';

-- Completion message
DO $$
BEGIN
  RAISE NOTICE '✅ Missed Bus Requests table created successfully!';
  RAISE NOTICE '📋 Table: missed_bus_requests';
  RAISE NOTICE '🔒 RLS policies applied';
  RAISE NOTICE '⚡ Indexes created for performance';
  RAISE NOTICE '📡 Realtime enabled';
END $$;
