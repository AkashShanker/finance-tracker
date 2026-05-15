-- Add email to household_members for auto-linking on signup
-- Run this in the Supabase SQL Editor

ALTER TABLE household_members ADD COLUMN IF NOT EXISTS email text;

-- Set Purnima's email if you know it (replace with her actual email)
-- UPDATE household_members SET email = 'purnima@example.com' WHERE name = 'Purnima';
