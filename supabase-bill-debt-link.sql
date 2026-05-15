-- Link bills to debts so paying a bill can update the debt balance
-- Run this in the Supabase SQL Editor

ALTER TABLE bills ADD COLUMN IF NOT EXISTS debt_id uuid REFERENCES debts(id) ON DELETE SET NULL;
