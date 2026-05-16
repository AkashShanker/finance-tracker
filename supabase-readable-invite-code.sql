-- Migration 17: Make invite codes human-readable
-- Run in Supabase SQL Editor

-- Generate a readable invite code: 3 consonants + 3 digits + 2 consonants = 8 chars
-- e.g. "BKM472NR", "FLT839HP" — easy to read aloud and type
CREATE OR REPLACE FUNCTION generate_readable_code() RETURNS text AS $$
DECLARE
  consonants text := 'BCDFGHJKLMNPQRSTVWXZ';
  result text := '';
  i int;
BEGIN
  -- 3 consonants
  FOR i IN 1..3 LOOP
    result := result || substr(consonants, floor(random() * 20 + 1)::int, 1);
  END LOOP;
  -- 3 digits
  FOR i IN 1..3 LOOP
    result := result || floor(random() * 10)::int::text;
  END LOOP;
  -- 2 consonants
  FOR i IN 1..2 LOOP
    result := result || substr(consonants, floor(random() * 20 + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Update the default for new households
ALTER TABLE households ALTER COLUMN invite_code SET DEFAULT generate_readable_code();

-- Update existing households to use readable codes
UPDATE households SET invite_code = generate_readable_code() WHERE invite_code IS NOT NULL;
