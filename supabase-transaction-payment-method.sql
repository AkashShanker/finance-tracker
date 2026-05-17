-- Migration: Add payment_method to transactions
-- Links to tracked_accounts so users can record which card/account was used
-- Run in Supabase SQL Editor

alter table transactions
  add column payment_method_id uuid references tracked_accounts(id) on delete set null;
