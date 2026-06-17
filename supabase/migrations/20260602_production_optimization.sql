-- ============================================================================
-- AdtU ITMS: Production Optimization Migration
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Add 'Rejected' to payments status CHECK constraint
-- Drop existing constraint and recreate with new value
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS chk_payment_status;
ALTER TABLE payments ADD CONSTRAINT payments_status_check 
  CHECK (status IN ('Pending', 'Completed', 'Rejected'));

-- 2. Add rejected_by and rejected_at columns (if not exist)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'rejected_by') THEN
    ALTER TABLE payments ADD COLUMN rejected_by JSONB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'rejected_at') THEN
    ALTER TABLE payments ADD COLUMN rejected_at TIMESTAMPTZ;
  END IF;
END $$;

-- 3. Add document_signature for RSA-2048 receipt verification.
-- This is required storage for server-side QR verification; no separate index is
-- needed because lookups are by payment_id.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'document_signature') THEN
    ALTER TABLE payments ADD COLUMN document_signature TEXT;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_payments_signature;

-- 4. Add end_time column to active_trips for driver-owned and automatic stale-lock endings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'active_trips' AND column_name = 'end_time') THEN
    ALTER TABLE active_trips ADD COLUMN end_time TIMESTAMPTZ;
  END IF;
END $$;

-- 5. Update active_trips status CHECK constraint
ALTER TABLE active_trips DROP CONSTRAINT IF EXISTS active_trips_status_check;
ALTER TABLE active_trips ADD CONSTRAINT active_trips_status_check
  CHECK (status IN ('active', 'ended'));

-- 6. Unique partial index: Only one active trip per bus at a time
-- This is the DB-level enforcement of the multi-driver lock
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_trips_bus_active 
  ON active_trips (bus_id) 
  WHERE status = 'active';

-- 7. Unique partial index: Only one active trip per driver at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_trips_driver_active
  ON active_trips (driver_id)
  WHERE status = 'active';

-- 8. Indexes for active trip lookups
CREATE INDEX IF NOT EXISTS idx_active_trips_route_active
  ON active_trips (route_id, status)
  WHERE status = 'active';

-- 9. Index for payment lookups by student and status
CREATE INDEX IF NOT EXISTS idx_payments_student_uid_status 
  ON payments (student_uid, status);

CREATE INDEX IF NOT EXISTS idx_payments_status_method 
  ON payments (status, method);

-- 10a. Prevent duplicate online ledger rows for the same Razorpay payment.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'payments'
      AND indexname = 'idx_payments_razorpay_id_unique'
      AND schemaname = 'public'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM (
        SELECT razorpay_payment_id, COUNT(*) AS duplicate_count
        FROM payments
        WHERE razorpay_payment_id IS NOT NULL
        GROUP BY razorpay_payment_id
        HAVING COUNT(*) > 1
      ) duplicates
    ) THEN
      EXECUTE 'CREATE UNIQUE INDEX idx_payments_razorpay_id_unique
        ON payments (razorpay_payment_id)
        WHERE razorpay_payment_id IS NOT NULL';
    ELSE
      RAISE NOTICE 'Skipped idx_payments_razorpay_id_unique because duplicate Razorpay payment IDs exist';
    END IF;
  END IF;
END $$;

-- 10. Index for pending payment approval queue
CREATE INDEX IF NOT EXISTS idx_payments_pending_offline 
  ON payments (status, method, created_at) 
  WHERE status = 'Pending' AND method = 'Offline';

-- 11. Prevent duplicate completed payment rows for the same student/session.
-- If historical duplicates already exist, the migration leaves a notice so
-- operators can reconcile data before enabling the constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'payments'
      AND indexname = 'idx_payments_one_completed_per_student_session'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM (
        SELECT student_uid, session_start_year, session_end_year, COUNT(*) AS duplicate_count
        FROM payments
        WHERE status = 'Completed'
          AND student_uid IS NOT NULL
          AND session_start_year IS NOT NULL
          AND session_end_year IS NOT NULL
        GROUP BY student_uid, session_start_year, session_end_year
        HAVING COUNT(*) > 1
      ) duplicates
    ) THEN
      EXECUTE 'CREATE UNIQUE INDEX idx_payments_one_completed_per_student_session
        ON payments (student_uid, session_start_year, session_end_year)
        WHERE status = ''Completed''
          AND student_uid IS NOT NULL
          AND session_start_year IS NOT NULL
          AND session_end_year IS NOT NULL';
    ELSE
      RAISE NOTICE 'Skipped idx_payments_one_completed_per_student_session because completed duplicate student/session payments exist';
    END IF;
  END IF;
END $$;

-- 12. Prevent DELETE on payments table via RLS (belt-and-suspenders with service role)
-- Note: Service role bypasses RLS, but this protects against accidental anon/user deletes
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'payments_no_delete') THEN
    CREATE POLICY payments_no_delete ON payments FOR DELETE USING (false);
  END IF;
END $$;

-- 9. Verify the migration
SELECT 
  'payments.status constraint' as check_name,
  conname as constraint_name,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'payments'::regclass AND conname = 'payments_status_check'

UNION ALL

SELECT 
  'active_trips unique index' as check_name,
  indexname as constraint_name,
  indexdef as definition
FROM pg_indexes 
WHERE tablename = 'active_trips' AND indexname = 'idx_active_trips_bus_active';
