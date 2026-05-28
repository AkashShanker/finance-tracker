-- Cleanup: duplicate transactions, closed bills, uncategorized transactions
-- Run in Supabase SQL Editor

DO $$
DECLARE
  v_household_id uuid;
  v_bills_cat_id uuid;
  v_deleted int;
BEGIN
  SELECT household_id INTO v_household_id FROM profiles LIMIT 1;

  -- ============================================================
  -- #1: Remove duplicate Chase Pay in 4 transactions
  -- Keep only the LATEST transaction per bill per date, delete dupes
  -- ============================================================

  -- Show what we'll delete (for reference)
  RAISE NOTICE 'Checking for duplicate Chase Pay in 4 transactions...';

  -- Delete duplicate "Bill: Chase Pay in 4" transactions on same date, keeping the newest
  WITH dupes AS (
    SELECT id, description, date, amount,
      ROW_NUMBER() OVER (
        PARTITION BY date, amount
        ORDER BY created_at DESC
      ) AS rn
    FROM transactions
    WHERE household_id = v_household_id
      AND description LIKE '%Chase Pay in 4%'
  )
  DELETE FROM transactions WHERE id IN (
    SELECT id FROM dupes WHERE rn > 1
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Deleted % duplicate Chase Pay in 4 transactions', v_deleted;

  -- ============================================================
  -- #3: Deactivate bills for closed accounts
  -- Chase Slate and Discover CC (wife) are paid off
  -- ============================================================

  UPDATE bills SET is_active = false
    WHERE household_id = v_household_id
      AND name IN ('Chase Slate min', 'Discover CC min (wife)')
      AND is_active = true;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Deactivated % closed-account bills', v_deleted;

  -- Also mark the debts as inactive
  UPDATE debts SET is_active = false
    WHERE household_id = v_household_id
      AND name IN ('Chase Slate (wife)', 'Discover CC (wife)');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Deactivated % paid-off debts', v_deleted;

  -- ============================================================
  -- #2: Auto-categorize uncategorized transactions
  -- Assign "Bills" category to known bill payments
  -- ============================================================

  -- Get or create Bills category
  SELECT id INTO v_bills_cat_id FROM categories
    WHERE household_id = v_household_id AND name = 'Bills' AND type = 'expense';

  IF v_bills_cat_id IS NULL THEN
    INSERT INTO categories (household_id, name, type, icon)
    VALUES (v_household_id, 'Bills', 'expense', '🧾')
    RETURNING id INTO v_bills_cat_id;
  END IF;

  -- Categorize bill-related transactions that have no category
  UPDATE transactions SET category_id = v_bills_cat_id
    WHERE household_id = v_household_id
      AND category_id IS NULL
      AND type = 'expense'
      AND (
        description LIKE 'Bill:%'
        OR description LIKE 'Skipped:%'
        OR description LIKE '%Mazda%'
        OR description LIKE '%Toyota%'
        OR description LIKE '%Discover%'
        OR description LIKE '%Chase%'
        OR description LIKE '%Capital One%'
        OR description LIKE '%Citi%'
        OR description LIKE '%Geico%'
        OR description LIKE '%Verizon%'
        OR description LIKE '%Prodigy%'
        OR description LIKE '%Midland%'
        OR description LIKE '%Apple Card%'
        OR description LIKE '%Parents%'
        OR description LIKE '%CPAP%'
      );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Categorized % uncategorized bill transactions', v_deleted;

  RAISE NOTICE 'Cleanup complete!';
END $$;
