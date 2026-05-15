-- RPC function: join an existing household by invite code (for users who already signed up)
-- This moves the user's profile to the target household, auto-links their household_member,
-- and cleans up the old empty household if nobody else is in it.
-- Run this in the Supabase SQL Editor

CREATE OR REPLACE FUNCTION join_household_by_code(
  p_user_id uuid,
  p_invite_code text
)
RETURNS json AS $$
DECLARE
  v_target_household_id uuid;
  v_old_household_id uuid;
  v_user_email text;
  v_member_id uuid;
  v_remaining_members int;
BEGIN
  -- Validate invite code
  SELECT id INTO v_target_household_id
  FROM households WHERE invite_code = p_invite_code;

  IF v_target_household_id IS NULL THEN
    RETURN json_build_object('error', 'Invalid invite code');
  END IF;

  -- Get user's current household and email
  SELECT household_id, email INTO v_old_household_id, v_user_email
  FROM profiles WHERE id = p_user_id;

  -- Don't rejoin the same household
  IF v_old_household_id = v_target_household_id THEN
    RETURN json_build_object('error', 'You are already in this household');
  END IF;

  -- Move profile to target household
  UPDATE profiles
  SET household_id = v_target_household_id
  WHERE id = p_user_id;

  -- Auto-link: check if a household_member exists with matching email
  IF v_user_email IS NOT NULL THEN
    SELECT id INTO v_member_id
    FROM household_members
    WHERE household_id = v_target_household_id
      AND LOWER(email) = LOWER(v_user_email)
      AND profile_id IS NULL
    LIMIT 1;

    IF v_member_id IS NOT NULL THEN
      UPDATE household_members
      SET profile_id = p_user_id
      WHERE id = v_member_id;
    END IF;
  END IF;

  -- Clean up old household if it's now empty
  IF v_old_household_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_remaining_members
    FROM profiles WHERE household_id = v_old_household_id;

    IF v_remaining_members = 0 THEN
      -- Delete orphaned data from the old household
      DELETE FROM snapshot_balances WHERE snapshot_id IN (
        SELECT id FROM snapshots WHERE household_id = v_old_household_id
      );
      DELETE FROM snapshots WHERE household_id = v_old_household_id;
      DELETE FROM tracked_accounts WHERE household_id = v_old_household_id;
      DELETE FROM household_members WHERE household_id = v_old_household_id;
      DELETE FROM transactions WHERE household_id = v_old_household_id;
      DELETE FROM bills WHERE household_id = v_old_household_id;
      DELETE FROM debts WHERE household_id = v_old_household_id;
      DELETE FROM categories WHERE household_id = v_old_household_id;
      DELETE FROM households WHERE id = v_old_household_id;
    END IF;
  END IF;

  RETURN json_build_object(
    'success', true,
    'household_id', v_target_household_id,
    'linked_member_id', v_member_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
