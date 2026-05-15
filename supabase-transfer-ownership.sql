-- Transfer household ownership to another member who has a login
-- Run this in the Supabase SQL Editor

CREATE OR REPLACE FUNCTION transfer_household_ownership(
  p_current_owner_id uuid,
  p_new_owner_id uuid
)
RETURNS json AS $$
DECLARE
  v_household_id uuid;
  v_is_owner boolean;
  v_new_in_household boolean;
BEGIN
  -- Verify caller is the owner
  SELECT p.household_id, (h.owner_id = p_current_owner_id)
  INTO v_household_id, v_is_owner
  FROM profiles p
  LEFT JOIN households h ON h.id = p.household_id
  WHERE p.id = p_current_owner_id;

  IF NOT v_is_owner THEN
    RETURN json_build_object('error', 'Only the current owner can transfer ownership');
  END IF;

  -- Verify new owner is in the same household
  SELECT EXISTS(
    SELECT 1 FROM profiles
    WHERE id = p_new_owner_id AND household_id = v_household_id
  ) INTO v_new_in_household;

  IF NOT v_new_in_household THEN
    RETURN json_build_object('error', 'New owner must be a member of this household with a login');
  END IF;

  -- Transfer
  UPDATE households
  SET owner_id = p_new_owner_id
  WHERE id = v_household_id;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
