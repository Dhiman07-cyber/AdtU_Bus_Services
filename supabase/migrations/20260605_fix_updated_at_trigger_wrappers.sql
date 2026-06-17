-- ============================================================================
-- Fix trigger wrappers that incorrectly call other trigger functions
-- ============================================================================
-- PostgreSQL trigger functions can only be invoked by a trigger. Calling
-- update_updated_at_column() from another trigger function raises:
--   "trigger functions can only be called as triggers"
-- This broke UPDATEs on payments, including receipt document_signature storage.

CREATE OR REPLACE FUNCTION update_reassignment_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

