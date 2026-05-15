-- Make paid_by flexible: store profile ID instead of hardcoded string
-- Run this in the Supabase SQL Editor

-- Drop the old check constraint on paid_by
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_paid_by_check;

-- Change paid_by to reference a profile ID (nullable = shared/unassigned)
-- First convert existing string values to null (we'll reassign in the app)
ALTER TABLE bills ALTER COLUMN paid_by TYPE text;
-- No constraint — it now stores a profile ID (uuid as text) or display name
