-- Migration 16: Expand bill schedule_type with biweekly, quarterly, yearly, custom + custom_interval_days
-- Run in Supabase SQL Editor

-- 1. Drop the old schedule_type CHECK constraint
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_schedule_type_check;

-- 2. Add expanded CHECK constraint
ALTER TABLE bills ADD CONSTRAINT bills_schedule_type_check
  CHECK (schedule_type IN ('monthly', 'biweekly', 'weekly', 'quarterly', 'yearly', 'every_payday', 'every_other_payday', 'custom'));

-- 3. Add custom_interval_days column for custom schedule type
ALTER TABLE bills ADD COLUMN IF NOT EXISTS custom_interval_days integer;

-- 4. Add CHECK constraint for custom_interval_days (1-365)
ALTER TABLE bills ADD CONSTRAINT bills_custom_interval_days_check
  CHECK (custom_interval_days IS NULL OR (custom_interval_days >= 1 AND custom_interval_days <= 365));
