-- Add pay schedule fields to household_members
-- Run this in the Supabase SQL Editor (along with supabase-member-email.sql if not already run)

ALTER TABLE household_members
  ADD COLUMN IF NOT EXISTS pay_frequency text DEFAULT NULL
    CHECK (pay_frequency IS NULL OR pay_frequency IN ('weekly', 'biweekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS next_pay_date date DEFAULT NULL;
