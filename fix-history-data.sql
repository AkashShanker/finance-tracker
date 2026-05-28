-- Fix snapshot balances and debt balances to match Excel tracker
-- Run this in the Supabase SQL Editor
-- Source: akash_finances_balanced_plan(1).xlsx (History Ledger + Dashboard)

DO $$
DECLARE
  v_household_id uuid;
  v_snap_id uuid;
BEGIN
  SELECT household_id INTO v_household_id FROM profiles LIMIT 1;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'No household found.';
  END IF;

  -- ============================================================
  -- FIX SNAPSHOT: Apr 8, 2026
  -- ============================================================
  SELECT id INTO v_snap_id FROM snapshots
    WHERE household_id = v_household_id AND date = '2026-04-08' LIMIT 1;

  IF v_snap_id IS NOT NULL THEN
    -- Delete existing balances and re-insert with correct Excel values
    DELETE FROM snapshot_balances WHERE snapshot_id = v_snap_id;
    INSERT INTO snapshot_balances (snapshot_id, account_name, account_type, balance, sort_order) VALUES
      (v_snap_id, 'Checking', 'asset', 267.02, 1),
      (v_snap_id, 'Marcus Emergency', 'asset', 716.53, 2),
      (v_snap_id, 'VOO (wife)', 'asset', 3056.17, 3),
      (v_snap_id, '401K', 'asset', 57086.00, 4),
      (v_snap_id, 'Capital One CC', 'debt', 4523.61, 10),
      (v_snap_id, 'Discover CC (yours)', 'debt', 6157.41, 11),
      (v_snap_id, 'Citi CC', 'debt', 3995.03, 12),
      (v_snap_id, 'Discover CC (wife)', 'debt', 1989.36, 13),
      (v_snap_id, 'Chase Slate (wife)', 'debt', 329.11, 14),
      (v_snap_id, 'Chase Freedom (wife)', 'debt', 2610.35, 15),
      (v_snap_id, 'Apple Card (wife)', 'debt', 2462.98, 16),
      (v_snap_id, 'Midland (wife)', 'debt', 2533.89, 17),
      (v_snap_id, 'Toyota', 'debt', 14009.37, 18),
      (v_snap_id, 'Mazda', 'debt', 13008.49, 19),
      (v_snap_id, 'Prodigy (wife)', 'debt', 72022.99, 20),
      (v_snap_id, 'India House', 'debt', 7000.00, 21);
    RAISE NOTICE 'Fixed Apr 8 snapshot';
  ELSE
    RAISE NOTICE 'Apr 8 snapshot not found — skipping';
  END IF;

  -- ============================================================
  -- FIX SNAPSHOT: Apr 17, 2026
  -- ============================================================
  SELECT id INTO v_snap_id FROM snapshots
    WHERE household_id = v_household_id AND date = '2026-04-17' LIMIT 1;

  IF v_snap_id IS NOT NULL THEN
    DELETE FROM snapshot_balances WHERE snapshot_id = v_snap_id;
    INSERT INTO snapshot_balances (snapshot_id, account_name, account_type, balance, sort_order) VALUES
      (v_snap_id, 'Checking', 'asset', 641.74, 1),
      (v_snap_id, 'Marcus Emergency', 'asset', 841.53, 2),
      (v_snap_id, 'VOO (wife)', 'asset', 3180.63, 3),
      (v_snap_id, '401K', 'asset', 75102.69, 4),
      (v_snap_id, 'Capital One CC', 'debt', 4467.89, 10),
      (v_snap_id, 'Discover CC (yours)', 'debt', 6024.41, 11),
      (v_snap_id, 'Citi CC', 'debt', 3841.23, 12),
      (v_snap_id, 'Discover CC (wife)', 'debt', 1989.36, 13),
      (v_snap_id, 'Chase Slate (wife)', 'debt', 336.50, 14),
      (v_snap_id, 'Chase Freedom (wife)', 'debt', 2372.57, 15),
      (v_snap_id, 'Apple Card (wife)', 'debt', 2533.95, 16),
      (v_snap_id, 'Midland (wife)', 'debt', 2533.89, 17),
      (v_snap_id, 'Toyota', 'debt', 13499.36, 18),
      (v_snap_id, 'Mazda', 'debt', 12582.36, 19),
      (v_snap_id, 'Prodigy (wife)', 'debt', 72022.99, 20),
      (v_snap_id, 'India House', 'debt', 7000.00, 21);
    RAISE NOTICE 'Fixed Apr 17 snapshot';
  ELSE
    RAISE NOTICE 'Apr 17 snapshot not found — skipping';
  END IF;

  -- ============================================================
  -- FIX SNAPSHOT: Apr 24, 2026
  -- ============================================================
  SELECT id INTO v_snap_id FROM snapshots
    WHERE household_id = v_household_id AND date = '2026-04-24' LIMIT 1;

  IF v_snap_id IS NOT NULL THEN
    DELETE FROM snapshot_balances WHERE snapshot_id = v_snap_id;
    INSERT INTO snapshot_balances (snapshot_id, account_name, account_type, balance, sort_order) VALUES
      (v_snap_id, 'Checking', 'asset', 1648.89, 1),
      (v_snap_id, 'Marcus Emergency', 'asset', 966.53, 2),
      (v_snap_id, 'VOO (wife)', 'asset', 3180.63, 3),
      (v_snap_id, '401K', 'asset', 75102.69, 4),
      (v_snap_id, 'Capital One CC', 'debt', 4467.89, 10),
      (v_snap_id, 'Discover CC (yours)', 'debt', 6024.41, 11),
      (v_snap_id, 'Citi CC', 'debt', 3841.23, 12),
      (v_snap_id, 'Discover CC (wife)', 'debt', 1989.36, 13),
      (v_snap_id, 'Chase Slate (wife)', 'debt', 336.50, 14),
      (v_snap_id, 'Chase Freedom (wife)', 'debt', 2372.57, 15),
      (v_snap_id, 'Apple Card (wife)', 'debt', 2533.95, 16),
      (v_snap_id, 'Midland (wife)', 'debt', 2533.89, 17),
      (v_snap_id, 'Toyota', 'debt', 13499.36, 18),
      (v_snap_id, 'Mazda', 'debt', 12582.36, 19),
      (v_snap_id, 'Prodigy (wife)', 'debt', 72022.99, 20),
      (v_snap_id, 'India House', 'debt', 7000.00, 21);
    RAISE NOTICE 'Fixed Apr 24 snapshot';
  ELSE
    RAISE NOTICE 'Apr 24 snapshot not found — skipping';
  END IF;

  -- ============================================================
  -- UPDATE DEBTS TABLE — current balances from Excel Dashboard
  -- (latest values from Apr 24 / "DEBT DEATH ORDER")
  -- ============================================================
  -- Note: Debt names in DB may differ from Excel. Using DB names from import-data.sql.

  UPDATE debts SET current_balance = 336.50
    WHERE household_id = v_household_id AND name = 'Chase Slate (wife)';

  UPDATE debts SET current_balance = 1989.36, interest_rate = 26.49
    WHERE household_id = v_household_id AND name = 'Discover CC (wife)';

  UPDATE debts SET current_balance = 4467.89, interest_rate = 24.49
    WHERE household_id = v_household_id AND name = 'Capital One CC';

  UPDATE debts SET current_balance = 2372.57, interest_rate = 22.00
    WHERE household_id = v_household_id AND name = 'Chase Freedom (wife)';

  UPDATE debts SET current_balance = 2533.95, interest_rate = 22.00
    WHERE household_id = v_household_id AND name = 'Apple Card (wife)';

  UPDATE debts SET current_balance = 2533.89, interest_rate = 0
    WHERE household_id = v_household_id AND name = 'Midland Collections (wife)';

  UPDATE debts SET current_balance = 6024.41, interest_rate = 24.00
    WHERE household_id = v_household_id AND name = 'Discover CC (yours)';

  UPDATE debts SET current_balance = 3841.23, interest_rate = 24.00
    WHERE household_id = v_household_id AND name = 'Citi CC';

  UPDATE debts SET current_balance = 72022.99, interest_rate = 9.50
    WHERE household_id = v_household_id AND name = 'Prodigy Student Loan (wife)';

  UPDATE debts SET current_balance = 13499.36, interest_rate = 2.99
    WHERE household_id = v_household_id AND name = 'Toyota Loan';

  UPDATE debts SET current_balance = 12582.36, interest_rate = 3.99
    WHERE household_id = v_household_id AND name = 'Mazda Loan';

  UPDATE debts SET current_balance = 7000.00
    WHERE household_id = v_household_id AND name = 'India House';

  RAISE NOTICE 'Done! Fixed 3 snapshots + updated 12 debt balances to match Excel.';
END $$;
