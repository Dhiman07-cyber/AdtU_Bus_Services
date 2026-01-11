
-- =================================================================
-- MIGRATION SCRIPT: REMOVE LEGACY COLUMNS
-- Run this script in the Supabase SQL Editor to remove the 
-- 'metadata' and 'approval_source' columns from the 'payments' table.
-- =================================================================

-- 1. Remove 'metadata' column if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'metadata') THEN
        ALTER TABLE public.payments DROP COLUMN metadata;
        RAISE NOTICE 'Dropped column: metadata';
    ELSE
        RAISE NOTICE 'Column does not exist: metadata';
    END IF;
END $$;

-- 2. Remove 'approval_source' column if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'approval_source') THEN
        ALTER TABLE public.payments DROP COLUMN approval_source;
        RAISE NOTICE 'Dropped column: approval_source';
    ELSE
        RAISE NOTICE 'Column does not exist: approval_source';
    END IF;
END $$;
