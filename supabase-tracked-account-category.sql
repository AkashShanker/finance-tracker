-- Add debt_category to tracked_accounts so we know what kind of debt each account is
-- without needing cross-table joins or name matching
ALTER TABLE tracked_accounts ADD COLUMN IF NOT EXISTS debt_category text;
-- Drop the debt_id FK if it was added
ALTER TABLE tracked_accounts DROP COLUMN IF EXISTS debt_id;
