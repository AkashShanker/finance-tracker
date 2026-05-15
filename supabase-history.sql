-- History tracking: payday snapshots with account balances
-- Run this in the Supabase SQL Editor

-- Each payday you take a "snapshot" of all your balances
create table snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  date date not null,
  label text,
  notes text,
  created_at timestamptz default now()
);

-- Individual account balances within a snapshot
create table snapshot_balances (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references snapshots(id) on delete cascade,
  account_name text not null,
  account_type text not null check (account_type in ('asset', 'debt')),
  balance numeric(12,2) not null default 0,
  sort_order integer default 0
);

-- RLS
alter table snapshots enable row level security;
alter table snapshot_balances enable row level security;

create policy "Household members can read snapshots"
  on snapshots for select using (
    household_id in (select household_id from profiles where id = auth.uid())
  );
create policy "Household members can insert snapshots"
  on snapshots for insert with check (
    household_id in (select household_id from profiles where id = auth.uid())
  );
create policy "Household members can update snapshots"
  on snapshots for update using (
    household_id in (select household_id from profiles where id = auth.uid())
  );
create policy "Household members can delete snapshots"
  on snapshots for delete using (
    household_id in (select household_id from profiles where id = auth.uid())
  );

create policy "Read snapshot balances via snapshot"
  on snapshot_balances for select using (
    snapshot_id in (
      select id from snapshots where household_id in (
        select household_id from profiles where id = auth.uid()
      )
    )
  );
create policy "Insert snapshot balances via snapshot"
  on snapshot_balances for insert with check (
    snapshot_id in (
      select id from snapshots where household_id in (
        select household_id from profiles where id = auth.uid()
      )
    )
  );
create policy "Update snapshot balances via snapshot"
  on snapshot_balances for update using (
    snapshot_id in (
      select id from snapshots where household_id in (
        select household_id from profiles where id = auth.uid()
      )
    )
  );
create policy "Delete snapshot balances via snapshot"
  on snapshot_balances for delete using (
    snapshot_id in (
      select id from snapshots where household_id in (
        select household_id from profiles where id = auth.uid()
      )
    )
  );
