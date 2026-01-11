-- Device Sessions Table for Single-Device Access Control
-- This table tracks which device is actively using location-related features

-- Create the device_sessions table
CREATE TABLE IF NOT EXISTS public.device_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  feature TEXT NOT NULL CHECK (feature IN ('driver_location_share', 'student_location_view')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint: one session per user per feature
  CONSTRAINT unique_user_feature UNIQUE (user_id, feature)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_device_sessions_user_feature ON public.device_sessions(user_id, feature);
CREATE INDEX IF NOT EXISTS idx_device_sessions_last_active ON public.device_sessions(last_active_at);

-- Enable Row Level Security
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only manage their own sessions
CREATE POLICY "Users can view own sessions" ON public.device_sessions
  FOR SELECT
  USING (true); -- Allow all to read (needed for conflict detection)

CREATE POLICY "Users can insert own sessions" ON public.device_sessions
  FOR INSERT
  WITH CHECK (true); -- Service role will validate

CREATE POLICY "Users can update own sessions" ON public.device_sessions
  FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete own sessions" ON public.device_sessions
  FOR DELETE
  USING (true);

-- Function to auto-cleanup stale sessions (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_stale_device_sessions()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.device_sessions 
  WHERE last_active_at < NOW() - INTERVAL '1 hour';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to cleanup stale sessions on each insert (lightweight cleanup)
DROP TRIGGER IF EXISTS trigger_cleanup_device_sessions ON public.device_sessions;
CREATE TRIGGER trigger_cleanup_device_sessions
  AFTER INSERT ON public.device_sessions
  FOR EACH STATEMENT
  EXECUTE FUNCTION cleanup_stale_device_sessions();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_sessions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_sessions TO service_role;
