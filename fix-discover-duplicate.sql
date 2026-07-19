-- Fix duplicate "Discover CC" tracking for Akash
-- There should be ONE active Discover CC account for Akash at $6,106.39.
-- "Discover CC (yours)" was a leftover duplicate of "Discover CC" that kept
-- getting a separate balance entered in History, inflating Total Debt by ~$6K
-- and (via ambiguous name matching in the CSV export) inheriting the wife's
-- old paid-off Discover card's "CLOSED" status.
-- Run in Supabase SQL Editor

DO $$
DECLARE
  v_household_id uuid;
  v_correct_debt_id uuid;
  v_latest_snapshot_id uuid;
BEGIN
  SELECT household_id INTO v_household_id FROM profiles LIMIT 1;

  -- 1) Retire the duplicate tracked account so History stops asking for it
  UPDATE tracked_accounts SET is_active = false
    WHERE household_id = v_household_id AND name = 'Discover CC (yours)';

  -- 2) Consolidate the debt record: rename "Discover CC (yours)" to "Discover CC"
  --    (exact-matches the tracked account name) and set the correct balance
  UPDATE debts SET name = 'Discover CC', current_balance = 6106.39, is_active = true
    WHERE household_id = v_household_id AND name = 'Discover CC (yours)'
    RETURNING id INTO v_correct_debt_id;

  -- 3) Link Akash's Discover bill(s) to the debt via FK, not name-guessing
  UPDATE bills SET debt_id = v_correct_debt_id
    WHERE household_id = v_household_id
      AND name ILIKE '%discover%'
      AND name NOT ILIKE '%wife%'
      AND is_active = true;

  -- 4) Remove the duplicate balance row from the latest snapshot
  SELECT id INTO v_latest_snapshot_id FROM snapshots
    WHERE household_id = v_household_id ORDER BY date DESC LIMIT 1;

  DELETE FROM snapshot_balances
    WHERE snapshot_id = v_latest_snapshot_id AND account_name = 'Discover CC (yours)';

  RAISE NOTICE 'Discover CC consolidated. debt_id = %', v_correct_debt_id;
END $$;
