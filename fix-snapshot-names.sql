-- Fix snapshot_balances account names to match tracked_accounts names
-- This fixes chart CC detection which matches by name
-- Run in Supabase SQL Editor

-- Rename old snapshot account names to match tracked_accounts
UPDATE snapshot_balances SET account_name = 'Chase Slate'
  WHERE account_name = 'Chase Slate (wife)';

UPDATE snapshot_balances SET account_name = 'Chase Freedom'
  WHERE account_name = 'Chase Freedom (wife)';

UPDATE snapshot_balances SET account_name = 'Discover CC'
  WHERE account_name = 'Discover CC (yours)';

UPDATE snapshot_balances SET account_name = 'Apple Card'
  WHERE account_name = 'Apple Card (wife)';

UPDATE snapshot_balances SET account_name = 'Midland'
  WHERE account_name = 'Midland (wife)';

UPDATE snapshot_balances SET account_name = 'VOO'
  WHERE account_name = 'VOO (wife)';

UPDATE snapshot_balances SET account_name = 'Prodigy Student Loan'
  WHERE account_name = 'Prodigy (wife)';

-- Also remove the Discover CC (wife) row from old snapshots
-- and Chase Slate from the May 23 snapshot (since it was eliminated)
-- The May 23 snapshot already has correct names, so only old ones are affected.
