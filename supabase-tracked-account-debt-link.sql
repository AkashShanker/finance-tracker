-- Link tracked accounts to debts so we can determine account sub-type (credit_card, auto_loan, etc.)
-- without relying on name matching
ALTER TABLE tracked_accounts ADD COLUMN IF NOT EXISTS debt_id uuid REFERENCES debts(id) ON DELETE SET NULL;
