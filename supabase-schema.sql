-- ============================================
-- Finance Tracker - Supabase Database Schema
-- Run this in the Supabase SQL Editor
-- ============================================

-- Households: groups users together (you + wife)
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Household',
  invite_code text unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  created_at timestamptz default now()
);

-- Profiles: extends Supabase auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  household_id uuid references households(id) on delete set null,
  pay_frequency text default 'biweekly' check (pay_frequency in ('weekly', 'biweekly', 'monthly')),
  next_pay_date date,
  created_at timestamptz default now()
);

-- Categories for transactions
create table categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  icon text default '💰',
  created_at timestamptz default now()
);

-- Transactions: income and expenses
create table transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references profiles(id),
  category_id uuid references categories(id) on delete set null,
  amount numeric(12,2) not null,
  type text not null check (type in ('income', 'expense')),
  description text,
  date date not null default current_date,
  created_at timestamptz default now()
);

-- Bills: recurring bills with due dates
create table bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null,
  due_day integer not null check (due_day between 1 and 31),
  frequency text not null default 'monthly' check (frequency in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
  category text default 'other',
  is_autopay boolean default false,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Debts: track balances and payoff
create table debts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  current_balance numeric(12,2) not null,
  original_balance numeric(12,2),
  interest_rate numeric(5,2) default 0,
  minimum_payment numeric(12,2) default 0,
  due_day integer check (due_day between 1 and 31),
  type text default 'other' check (type in ('credit_card', 'student_loan', 'auto_loan', 'mortgage', 'personal_loan', 'medical', 'other')),
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Row Level Security: users only see their household's data
alter table households enable row level security;
alter table profiles enable row level security;
alter table categories enable row level security;
alter table transactions enable row level security;
alter table bills enable row level security;
alter table debts enable row level security;

-- Profiles policies
create policy "Users can read own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

-- Households policies
create policy "Users can read own household"
  on households for select using (
    id in (select household_id from profiles where id = auth.uid())
  );

create policy "Anyone can create a household"
  on households for insert with check (true);

create policy "Household members can update"
  on households for update using (
    id in (select household_id from profiles where id = auth.uid())
  );

-- Shared data policies (categories, transactions, bills, debts)
-- All household members can read/write their household's data

create policy "Household members can read categories"
  on categories for select using (
    household_id in (select household_id from profiles where id = auth.uid())
  );
create policy "Household members can insert categories"
  on categories for insert with check (
    household_id in (select household_id from profiles where id = auth.uid())
  );
create policy "Household members can update categories"
  on categories for update using (
    household_id in (select household_id from profiles where id = auth.uid())
  );
create policy "Household members can delete categories"
  on categories for delete using (
    household_id in (select household_id from profiles where id = auth.uid())
  );

create policy "Household members can read transactions"
  on transactions for select using (
    household_id in (select household_id from profiles where id = auth.uid())
  );
create policy "Household members can insert transactions"
  on transactions for insert with check (
    household_id in (select household_id from profiles where id = auth.uid())
  );
create policy "Household members can update transactions"
  on transactions for update using (
    household_id in (select household_id from profiles where id = auth.uid())
  );
create policy "Household members can delete transactions"
  on transactions for delete using (
    household_id in (select household_id from profiles where id = auth.uid())
  );

create policy "Household members can read bills"
  on bills for select using (
    household_id in (select household_id from profiles where id = auth.uid())
  );
create policy "Household members can insert bills"
  on bills for insert with check (
    household_id in (select household_id from profiles where id = auth.uid())
  );
create policy "Household members can update bills"
  on bills for update using (
    household_id in (select household_id from profiles where id = auth.uid())
  );
create policy "Household members can delete bills"
  on bills for delete using (
    household_id in (select household_id from profiles where id = auth.uid())
  );

create policy "Household members can read debts"
  on debts for select using (
    household_id in (select household_id from profiles where id = auth.uid())
  );
create policy "Household members can insert debts"
  on debts for insert with check (
    household_id in (select household_id from profiles where id = auth.uid())
  );
create policy "Household members can update debts"
  on debts for update using (
    household_id in (select household_id from profiles where id = auth.uid())
  );
create policy "Household members can delete debts"
  on debts for delete using (
    household_id in (select household_id from profiles where id = auth.uid())
  );

-- Default categories (inserted after a household is created via app logic)
-- Function to seed default categories for a new household
create or replace function seed_default_categories(h_id uuid)
returns void as $$
begin
  insert into categories (household_id, name, type, icon) values
    (h_id, 'Salary', 'income', '💼'),
    (h_id, 'Side Income', 'income', '💵'),
    (h_id, 'Groceries', 'expense', '🛒'),
    (h_id, 'Rent/Mortgage', 'expense', '🏠'),
    (h_id, 'Utilities', 'expense', '⚡'),
    (h_id, 'Transportation', 'expense', '🚗'),
    (h_id, 'Insurance', 'expense', '🛡️'),
    (h_id, 'Dining Out', 'expense', '🍽️'),
    (h_id, 'Entertainment', 'expense', '🎬'),
    (h_id, 'Healthcare', 'expense', '🏥'),
    (h_id, 'Shopping', 'expense', '🛍️'),
    (h_id, 'Subscriptions', 'expense', '📱'),
    (h_id, 'Childcare', 'expense', '👶'),
    (h_id, 'Other', 'expense', '📦');
end;
$$ language plpgsql security definer;

-- Helpful views
create or replace view household_summary as
select
  h.id as household_id,
  coalesce(sum(case when t.type = 'income' and t.date >= date_trunc('month', current_date) then t.amount end), 0) as monthly_income,
  coalesce(sum(case when t.type = 'expense' and t.date >= date_trunc('month', current_date) then t.amount end), 0) as monthly_expenses,
  coalesce((select sum(amount) from bills where household_id = h.id and is_active), 0) as total_monthly_bills,
  coalesce((select sum(current_balance) from debts where household_id = h.id and is_active), 0) as total_debt
from households h
left join transactions t on t.household_id = h.id
group by h.id;
