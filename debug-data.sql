-- Run this in Supabase SQL Editor to see what's actually in the DB

-- 1. Show all snapshots
SELECT id, date, label, notes FROM snapshots ORDER BY date;

-- 2. Show all snapshot balances grouped by snapshot date
SELECT s.date, s.label, sb.account_name, sb.account_type, sb.balance
FROM snapshots s
JOIN snapshot_balances sb ON sb.snapshot_id = s.id
ORDER BY s.date, sb.sort_order;

-- 3. Show all debts
SELECT name, current_balance, interest_rate, minimum_payment, type, is_active
FROM debts ORDER BY name;

-- 4. Show all tracked accounts
SELECT name, account_type, debt_category, is_active FROM tracked_accounts ORDER BY sort_order;
