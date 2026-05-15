-- Import Akash's financial data from Excel tracker
-- Run this in the Supabase SQL Editor

DO $$
DECLARE
  v_household_id uuid;
BEGIN
  -- Get the first household (yours)
  SELECT household_id INTO v_household_id FROM profiles LIMIT 1;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'No household found. Sign up first.';
  END IF;

  -- ============ BILLS ============

  -- Your bills
  INSERT INTO bills (household_id, name, amount, due_day, frequency, category, is_autopay) VALUES
    (v_household_id, 'Rent', 2525.00, 1, 'monthly', 'housing', false),
    (v_household_id, 'Mazda Payment', 546.73, 23, 'monthly', 'transportation', false),
    (v_household_id, 'Toyota Payment', 554.77, 14, 'monthly', 'transportation', false),
    (v_household_id, 'Geico Insurance', 296.75, 9, 'monthly', 'insurance', false),
    (v_household_id, 'Verizon', 295.30, 29, 'monthly', 'utilities', true),
    (v_household_id, 'Utilities', 180.00, 13, 'monthly', 'utilities', false),
    (v_household_id, 'Capital One CC min', 147.00, 3, 'monthly', 'debt', false),
    (v_household_id, 'Discover CC min (yours)', 133.00, 20, 'monthly', 'debt', false),
    (v_household_id, 'Citi CC min', 153.00, 22, 'monthly', 'debt', false),
    (v_household_id, 'Parents (you)', 252.00, 15, 'biweekly', 'family', false),
    (v_household_id, 'Marcus Emergency Fund', 125.00, 1, 'weekly', 'savings', true),

    -- Wife's bills
    (v_household_id, 'Prodigy Student Loan', 965.00, 28, 'monthly', 'debt', true),
    (v_household_id, 'Midland (collections)', 149.00, 15, 'biweekly', 'debt', true),
    (v_household_id, 'Discover CC min (wife)', 389.00, 16, 'monthly', 'debt', false),
    (v_household_id, 'Chase Slate min', 30.00, 6, 'monthly', 'debt', true),
    (v_household_id, 'Chase Freedom min', 66.00, 16, 'monthly', 'debt', true),
    (v_household_id, 'Apple Card min', 50.00, 30, 'monthly', 'debt', false),
    (v_household_id, 'Parents (wife)', 500.00, 15, 'monthly', 'family', false);

  -- ============ DEBTS (ordered by payoff priority) ============

  INSERT INTO debts (household_id, name, current_balance, original_balance, interest_rate, minimum_payment, due_day, type) VALUES
    (v_household_id, 'Chase Slate (wife)', 371.56, 371.56, 0, 30.00, 6, 'credit_card'),
    (v_household_id, 'Discover CC (wife)', 1600.36, 1989.36, 26.49, 389.00, 16, 'credit_card'),
    (v_household_id, 'Capital One CC', 4424.79, 4523.61, 24.49, 147.00, 3, 'credit_card'),
    (v_household_id, 'Chase Freedom (wife)', 3469.20, 3469.20, 22.00, 66.00, 16, 'credit_card'),
    (v_household_id, 'Apple Card (wife)', 2643.74, 2643.74, 22.00, 50.00, 30, 'credit_card'),
    (v_household_id, 'Midland Collections (wife)', 2235.89, 2533.89, 0, 149.00, 15, 'other'),
    (v_household_id, 'Discover CC (yours)', 6004.26, 6157.41, 24.00, 133.00, 20, 'credit_card'),
    (v_household_id, 'Citi CC', 3802.23, 3995.03, 24.00, 153.00, 22, 'credit_card'),
    (v_household_id, 'Prodigy Student Loan (wife)', 70679.52, 72022.99, 9.50, 965.00, 28, 'student_loan'),
    (v_household_id, 'Toyota Loan', 12960.07, 14009.37, 2.99, 554.77, 14, 'auto_loan'),
    (v_household_id, 'Mazda Loan', 12035.63, 13008.49, 3.99, 546.73, 23, 'auto_loan'),
    (v_household_id, 'India House', 7000.00, 7000.00, 0, 0, null, 'personal_loan');

  RAISE NOTICE 'Import complete! Bills: 18, Debts: 12';
END $$;
