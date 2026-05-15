-- Account deletion + household ownership
-- Run this in the Supabase SQL Editor

-- 1. Add owner_id to households
ALTER TABLE households ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id);

-- 2. Set existing household owners (the first profile in each household)
UPDATE households h
SET owner_id = (
  SELECT p.id FROM profiles p
  WHERE p.household_id = h.id
  ORDER BY p.created_at ASC
  LIMIT 1
)
WHERE h.owner_id IS NULL;

-- 3. Delete account (non-owner): unlinks from household, keeps data, removes auth user
CREATE OR REPLACE FUNCTION delete_my_account(p_user_id uuid)
RETURNS json AS $$
DECLARE
  v_household_id uuid;
  v_is_owner boolean;
BEGIN
  -- Check if user is household owner
  SELECT p.household_id, (h.owner_id = p_user_id)
  INTO v_household_id, v_is_owner
  FROM profiles p
  LEFT JOIN households h ON h.id = p.household_id
  WHERE p.id = p_user_id;

  IF v_is_owner THEN
    RETURN json_build_object('error', 'You are the household owner. Use delete_household instead.');
  END IF;

  -- Unlink from household_member (keep the member record)
  UPDATE household_members
  SET profile_id = NULL
  WHERE profile_id = p_user_id;

  -- Delete profile
  DELETE FROM profiles WHERE id = p_user_id;

  -- Delete auth user
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Delete household (owner only): removes everything
CREATE OR REPLACE FUNCTION delete_household(p_user_id uuid)
RETURNS json AS $$
DECLARE
  v_household_id uuid;
  v_is_owner boolean;
  v_member_profile_id uuid;
BEGIN
  -- Verify ownership
  SELECT p.household_id, (h.owner_id = p_user_id)
  INTO v_household_id, v_is_owner
  FROM profiles p
  LEFT JOIN households h ON h.id = p.household_id
  WHERE p.id = p_user_id;

  IF NOT v_is_owner THEN
    RETURN json_build_object('error', 'Only the household owner can delete the household');
  END IF;

  IF v_household_id IS NULL THEN
    RETURN json_build_object('error', 'No household found');
  END IF;

  -- Delete all household data
  DELETE FROM snapshot_balances WHERE snapshot_id IN (
    SELECT id FROM snapshots WHERE household_id = v_household_id
  );
  DELETE FROM snapshots WHERE household_id = v_household_id;
  DELETE FROM tracked_accounts WHERE household_id = v_household_id;
  DELETE FROM transactions WHERE household_id = v_household_id;
  DELETE FROM bills WHERE household_id = v_household_id;
  DELETE FROM debts WHERE household_id = v_household_id;
  DELETE FROM categories WHERE household_id = v_household_id;
  DELETE FROM household_members WHERE household_id = v_household_id;

  -- Delete all member profiles and auth users in this household
  FOR v_member_profile_id IN
    SELECT id FROM profiles WHERE household_id = v_household_id AND id != p_user_id
  LOOP
    DELETE FROM profiles WHERE id = v_member_profile_id;
    DELETE FROM auth.users WHERE id = v_member_profile_id;
  END LOOP;

  -- Delete owner's profile
  DELETE FROM profiles WHERE id = p_user_id;

  -- Delete household
  DELETE FROM households WHERE id = v_household_id;

  -- Delete owner's auth user last
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
