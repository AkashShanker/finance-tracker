-- Import historical payday snapshots from your Excel tracker
-- Run this in the Supabase SQL Editor AFTER running supabase-history.sql

DO $$
DECLARE
  v_household_id uuid;
  v_snap1 uuid;
  v_snap2 uuid;
  v_snap3 uuid;
  v_snap4 uuid;
BEGIN
  SELECT household_id INTO v_household_id FROM profiles LIMIT 1;

  -- Snapshot 1: Apr 8, 2026 (Starting baseline)
  INSERT INTO snapshots (household_id, date, label, notes)
  VALUES (v_household_id, '2026-04-08', 'Apr 8 START', 'Starting baseline. Wife Discover 5354 added.')
  RETURNING id INTO v_snap1;

  INSERT INTO snapshot_balances (snapshot_id, account_name, account_type, balance, sort_order) VALUES
    (v_snap1, 'Checking', 'asset', 267.02, 1),
    (v_snap1, 'Marcus Emergency', 'asset', 716.53, 2),
    (v_snap1, 'VOO (wife)', 'asset', 3056.17, 3),
    (v_snap1, '401K', 'asset', 57086.00, 4),
    (v_snap1, 'Capital One CC', 'debt', 4523.61, 10),
    (v_snap1, 'Discover CC (yours)', 'debt', 6157.41, 11),
    (v_snap1, 'Citi CC', 'debt', 3995.03, 12),
    (v_snap1, 'Discover CC (wife)', 'debt', 1989.36, 13),
    (v_snap1, 'Chase Slate (wife)', 'debt', 329.11, 14),
    (v_snap1, 'Chase Freedom (wife)', 'debt', 2610.35, 15),
    (v_snap1, 'Apple Card (wife)', 'debt', 2462.98, 16),
    (v_snap1, 'Midland (wife)', 'debt', 2533.89, 17),
    (v_snap1, 'Toyota', 'debt', 14009.37, 18),
    (v_snap1, 'Mazda', 'debt', 13008.49, 19),
    (v_snap1, 'Prodigy (wife)', 'debt', 72022.99, 20),
    (v_snap1, 'India House', 'debt', 7000.00, 21);

  -- Snapshot 2: Apr 17, 2026
  INSERT INTO snapshots (household_id, date, label, notes)
  VALUES (v_household_id, '2026-04-17', 'Apr 17 payday', '401K match hit. Geico switch done.')
  RETURNING id INTO v_snap2;

  INSERT INTO snapshot_balances (snapshot_id, account_name, account_type, balance, sort_order) VALUES
    (v_snap2, 'Checking', 'asset', 641.74, 1),
    (v_snap2, 'Marcus Emergency', 'asset', 841.53, 2),
    (v_snap2, 'VOO (wife)', 'asset', 3180.63, 3),
    (v_snap2, '401K', 'asset', 75102.69, 4),
    (v_snap2, 'Capital One CC', 'debt', 4467.89, 10),
    (v_snap2, 'Discover CC (yours)', 'debt', 6024.41, 11),
    (v_snap2, 'Citi CC', 'debt', 3841.23, 12),
    (v_snap2, 'Discover CC (wife)', 'debt', 1989.36, 13),
    (v_snap2, 'Chase Slate (wife)', 'debt', 336.50, 14),
    (v_snap2, 'Chase Freedom (wife)', 'debt', 2372.57, 15),
    (v_snap2, 'Apple Card (wife)', 'debt', 2533.95, 16),
    (v_snap2, 'Midland (wife)', 'debt', 2533.89, 17),
    (v_snap2, 'Toyota', 'debt', 13499.36, 18),
    (v_snap2, 'Mazda', 'debt', 12582.36, 19),
    (v_snap2, 'Prodigy (wife)', 'debt', 72022.99, 20),
    (v_snap2, 'India House', 'debt', 7000.00, 21);

  -- Snapshot 3: Apr 24, 2026
  INSERT INTO snapshots (household_id, date, label, notes)
  VALUES (v_household_id, '2026-04-24', 'Apr 24 payday', 'Toyota arrears resolved. Desk $750.')
  RETURNING id INTO v_snap3;

  INSERT INTO snapshot_balances (snapshot_id, account_name, account_type, balance, sort_order) VALUES
    (v_snap3, 'Checking', 'asset', 1648.89, 1),
    (v_snap3, 'Marcus Emergency', 'asset', 1091.53, 2),
    (v_snap3, 'VOO (wife)', 'asset', 3180.63, 3),
    (v_snap3, '401K', 'asset', 76016.03, 4),
    (v_snap3, 'Capital One CC', 'debt', 4467.89, 10),
    (v_snap3, 'Discover CC (yours)', 'debt', 6024.41, 11),
    (v_snap3, 'Citi CC', 'debt', 3926.63, 12),
    (v_snap3, 'Discover CC (wife)', 'debt', 1989.36, 13),
    (v_snap3, 'Chase Slate (wife)', 'debt', 403.70, 14),
    (v_snap3, 'Chase Freedom (wife)', 'debt', 3147.45, 15),
    (v_snap3, 'Apple Card (wife)', 'debt', 2590.66, 16),
    (v_snap3, 'Midland (wife)', 'debt', 2384.89, 17),
    (v_snap3, 'Toyota', 'debt', 13499.36, 18),
    (v_snap3, 'Mazda', 'debt', 12582.36, 19),
    (v_snap3, 'Prodigy (wife)', 'debt', 72022.99, 20),
    (v_snap3, 'India House', 'debt', 7000.00, 21);

  -- Snapshot 4: May 11, 2026 (latest)
  INSERT INTO snapshots (household_id, date, label, notes)
  VALUES (v_household_id, '2026-05-11', 'May 11 payday', null)
  RETURNING id INTO v_snap4;

  INSERT INTO snapshot_balances (snapshot_id, account_name, account_type, balance, sort_order) VALUES
    (v_snap4, 'Checking', 'asset', 711.44, 1),
    (v_snap4, 'Marcus Emergency', 'asset', 1343.94, 2),
    (v_snap4, 'VOO (wife)', 'asset', 2948.17, 3),
    (v_snap4, '401K', 'asset', 78517.69, 4),
    (v_snap4, 'Capital One CC', 'debt', 4424.79, 10),
    (v_snap4, 'Discover CC (yours)', 'debt', 6004.26, 11),
    (v_snap4, 'Citi CC', 'debt', 3802.23, 12),
    (v_snap4, 'Discover CC (wife)', 'debt', 1600.36, 13),
    (v_snap4, 'Chase Slate (wife)', 'debt', 371.56, 14),
    (v_snap4, 'Chase Freedom (wife)', 'debt', 3469.20, 15),
    (v_snap4, 'Apple Card (wife)', 'debt', 2643.74, 16),
    (v_snap4, 'Midland (wife)', 'debt', 2235.89, 17),
    (v_snap4, 'Toyota', 'debt', 12960.07, 18),
    (v_snap4, 'Mazda', 'debt', 12035.63, 19),
    (v_snap4, 'Prodigy (wife)', 'debt', 70679.52, 20),
    (v_snap4, 'India House', 'debt', 7000.00, 21);

  RAISE NOTICE 'Imported 4 historical snapshots with 16 account balances each';
END $$;
