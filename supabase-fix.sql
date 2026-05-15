-- Fix: Create a security definer function for signup
-- This bypasses RLS so household + profile can be created during signup

create or replace function handle_signup(
  p_user_id uuid,
  p_email text,
  p_display_name text default null,
  p_invite_code text default null
)
returns json as $$
declare
  v_household_id uuid;
begin
  if p_invite_code is not null and p_invite_code != '' then
    select id into v_household_id from households where invite_code = p_invite_code;
    if v_household_id is null then
      return json_build_object('error', 'Invalid invite code');
    end if;
  else
    insert into households (name)
    values (coalesce(p_display_name, p_email) || '''s Household')
    returning id into v_household_id;

    perform seed_default_categories(v_household_id);
  end if;

  insert into profiles (id, email, display_name, household_id)
  values (p_user_id, p_email, p_display_name, v_household_id)
  on conflict (id) do update set household_id = v_household_id;

  return json_build_object('household_id', v_household_id);
end;
$$ language plpgsql security definer;
