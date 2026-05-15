-- Household members (can exist without a login) and configurable tracked accounts
-- Run this in the Supabase SQL Editor

-- Members: people in the household (some may have logins, some may not)
create table household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,  -- null if no login
  name text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Tracked accounts: configurable list for history snapshots
create table tracked_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  account_type text not null check (account_type in ('asset', 'debt')),
  owner_member_id uuid references household_members(id) on delete set null,
  is_active boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- RLS
alter table household_members enable row level security;
alter table tracked_accounts enable row level security;

create policy "Household members read" on household_members for select using (
  household_id in (select household_id from profiles where id = auth.uid())
);
create policy "Household members insert" on household_members for insert with check (
  household_id in (select household_id from profiles where id = auth.uid())
);
create policy "Household members update" on household_members for update using (
  household_id in (select household_id from profiles where id = auth.uid())
);
create policy "Household members delete" on household_members for delete using (
  household_id in (select household_id from profiles where id = auth.uid())
);

create policy "Tracked accounts read" on tracked_accounts for select using (
  household_id in (select household_id from profiles where id = auth.uid())
);
create policy "Tracked accounts insert" on tracked_accounts for insert with check (
  household_id in (select household_id from profiles where id = auth.uid())
);
create policy "Tracked accounts update" on tracked_accounts for update using (
  household_id in (select household_id from profiles where id = auth.uid())
);
create policy "Tracked accounts delete" on tracked_accounts for delete using (
  household_id in (select household_id from profiles where id = auth.uid())
);

-- Seed: create members for existing household and migrate tracked accounts
-- Run after the table creation above
DO $$
DECLARE
  v_household_id uuid;
  v_user_id uuid;
  v_member_you uuid;
  v_member_wife uuid;
BEGIN
  SELECT p.household_id, p.id INTO v_household_id, v_user_id FROM profiles p LIMIT 1;
  IF v_household_id IS NULL THEN RETURN; END IF;

  -- Create two members
  INSERT INTO household_members (household_id, profile_id, name)
  VALUES (v_household_id, v_user_id, 'Akash')
  RETURNING id INTO v_member_you;

  INSERT INTO household_members (household_id, profile_id, name)
  VALUES (v_household_id, null, 'Purnima')
  RETURNING id INTO v_member_wife;

  -- Create tracked accounts
  INSERT INTO tracked_accounts (household_id, name, account_type, owner_member_id, is_active, sort_order) VALUES
    -- Your assets
    (v_household_id, 'Checking', 'asset', v_member_you, true, 1),
    (v_household_id, 'Marcus Emergency', 'asset', v_member_you, true, 2),
    (v_household_id, '401K', 'asset', v_member_you, true, 3),
    -- Wife's assets
    (v_household_id, 'VOO', 'asset', v_member_wife, false, 4),  -- dormant
    (v_household_id, 'Wife Checking', 'asset', v_member_wife, false, 5),  -- add when ready
    -- Your debts
    (v_household_id, 'Capital One CC', 'debt', v_member_you, true, 10),
    (v_household_id, 'Discover CC', 'debt', v_member_you, true, 11),
    (v_household_id, 'Citi CC', 'debt', v_member_you, true, 12),
    -- Wife's debts
    (v_household_id, 'Discover CC (wife)', 'debt', v_member_wife, true, 13),
    (v_household_id, 'Chase Slate', 'debt', v_member_wife, true, 14),
    (v_household_id, 'Chase Freedom', 'debt', v_member_wife, true, 15),
    (v_household_id, 'Apple Card', 'debt', v_member_wife, true, 16),
    (v_household_id, 'Midland', 'debt', v_member_wife, true, 17),
    (v_household_id, 'Prodigy Student Loan', 'debt', v_member_wife, true, 18),
    -- Shared debts
    (v_household_id, 'Toyota', 'debt', null, true, 19),
    (v_household_id, 'Mazda', 'debt', null, true, 20),
    (v_household_id, 'India House', 'debt', null, true, 21);

  -- Update existing bills: assign to members
  UPDATE bills SET paid_by = v_member_you::text WHERE paid_by = 'you';
  UPDATE bills SET paid_by = v_member_wife::text WHERE paid_by = 'wife';

  RAISE NOTICE 'Created members: Akash (%), Purnima (%). Created 17 tracked accounts.', v_member_you, v_member_wife;
END $$;
