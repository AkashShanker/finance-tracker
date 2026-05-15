-- Bills upgrade: support payday-linked bills and actual due dates
-- Run this in the Supabase SQL Editor

-- Add new columns to bills
ALTER TABLE bills ADD COLUMN IF NOT EXISTS next_due_date date;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS schedule_type text DEFAULT 'monthly'
  CHECK (schedule_type IN ('monthly', 'every_payday', 'every_other_payday', 'weekly', 'custom'));
ALTER TABLE bills ADD COLUMN IF NOT EXISTS paid_by text DEFAULT 'you'
  CHECK (paid_by IN ('you', 'wife', 'shared'));

-- due_day becomes optional (null for payday-linked bills)
-- Make due_day nullable
ALTER TABLE bills ALTER COLUMN due_day DROP NOT NULL;

-- Drop the old frequency column check and add broader one
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_frequency_check;
ALTER TABLE bills ADD CONSTRAINT bills_frequency_check
  CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'));

-- Update existing bills with sensible next_due_date based on due_day
-- (For May 2026, set next due to May <due_day> 2026 or June if already past)
UPDATE bills
SET next_due_date = CASE
  WHEN due_day IS NOT NULL AND due_day >= EXTRACT(DAY FROM CURRENT_DATE)
    THEN (DATE_TRUNC('month', CURRENT_DATE) + (due_day - 1) * INTERVAL '1 day')::date
  WHEN due_day IS NOT NULL
    THEN (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' + (due_day - 1) * INTERVAL '1 day')::date
  ELSE CURRENT_DATE
END
WHERE next_due_date IS NULL;

-- Set schedule_type for payday-linked bills
UPDATE bills SET schedule_type = 'every_payday' WHERE name LIKE 'Parents (you)%';
UPDATE bills SET schedule_type = 'every_other_payday' WHERE name LIKE 'Parents (wife)%';
UPDATE bills SET schedule_type = 'weekly' WHERE name LIKE 'Marcus%';

-- Set paid_by
UPDATE bills SET paid_by = 'wife' WHERE name LIKE '%wife%' OR name LIKE '%Wife%';
UPDATE bills SET paid_by = 'you' WHERE paid_by IS NULL OR paid_by = 'you';
