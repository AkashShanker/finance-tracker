-- Add timezone to profiles, default to US Eastern
-- Run this in the Supabase SQL Editor

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/New_York';
