# FinTracker — Database Schema

## Entity Relationship Diagram

```
auth.users (Supabase Auth)
    |
    | 1:1
    v
+------------------+        +-------------------+
|    profiles      |  N:1   |   households      |
|------------------|------->|-------------------|
| id (PK, FK auth) |        | id (PK)           |
| email            |        | name              |
| display_name     |        | invite_code (UQ)  |
| household_id(FK) |        | owner_id (FK auth)|
| pay_frequency    |        | created_at        |
| next_pay_date    |        +-------------------+
| timezone         |              |
| created_at       |              | 1:N
+------------------+              |
                         +--------+--------+--------+--------+--------+--------+--------+
                         |        |        |        |        |        |        |        |
                         v        v        v        v        v        v        v        v
                    categories  trans-   bills    debts   snapshots  household tracked
                               actions                              _members  _accounts
```

```
households
  |
  |-- categories (household_id FK)
  |     |
  |     +-- transactions.category_id FK
  |
  |-- transactions (household_id FK, user_id FK -> profiles)
  |
  |-- bills (household_id FK)
  |     |-- paid_by -> household_members.id (text UUID)
  |     +-- debt_id FK -> debts.id (optional link)
  |
  |-- debts (household_id FK)
  |
  |-- snapshots (household_id FK)
  |     +-- snapshot_balances (snapshot_id FK)
  |
  |-- household_members (household_id FK)
  |     |-- profile_id FK -> profiles.id (nullable, linked on signup)
  |     +-- tracked_accounts.owner_member_id FK
  |
  +-- tracked_accounts (household_id FK)
```

## Tables

### households
The top-level grouping. All data is scoped to a household via RLS.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid PK | gen_random_uuid() | |
| name | text NOT NULL | 'My Household' | |
| invite_code | text UNIQUE | 8-char random | Used to join household |
| owner_id | uuid FK auth.users | | Admin — can delete household, transfer ownership |
| created_at | timestamptz | now() | |

### profiles
One per authenticated user. Links to a household.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid PK FK auth.users | | ON DELETE CASCADE |
| email | text NOT NULL | | From signup |
| display_name | text | | Optional |
| household_id | uuid FK households | | ON DELETE SET NULL |
| pay_frequency | text | 'biweekly' | CHECK: weekly, biweekly, monthly |
| next_pay_date | date | | |
| timezone | text | 'America/New_York' | IANA timezone for date calculations |
| created_at | timestamptz | now() | |

### household_members
Flexible member records. Members do NOT need a login. When a member signs up, their profile_id gets linked.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid PK | gen_random_uuid() | Referenced by bills.paid_by |
| household_id | uuid FK households NOT NULL | | ON DELETE CASCADE |
| profile_id | uuid FK profiles | NULL | Set when member creates a login |
| name | text NOT NULL | | |
| email | text | | For auto-linking on signup/join |
| pay_frequency | text | NULL | CHECK: NULL, weekly, biweekly, monthly |
| next_pay_date | date | NULL | |
| is_active | boolean | true | Soft delete |
| created_at | timestamptz | now() | |

### categories
Income and expense categories per household. Seeded with defaults on household creation.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid PK | gen_random_uuid() | |
| household_id | uuid FK households NOT NULL | | ON DELETE CASCADE |
| name | text NOT NULL | | |
| type | text NOT NULL | | CHECK: income, expense |
| icon | text | '💰' | Emoji icon |
| created_at | timestamptz | now() | |

### transactions
Individual income or expense entries.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid PK | gen_random_uuid() | |
| household_id | uuid FK households NOT NULL | | ON DELETE CASCADE |
| user_id | uuid FK profiles NOT NULL | | Who recorded it |
| category_id | uuid FK categories | | ON DELETE SET NULL |
| amount | numeric(12,2) NOT NULL | | |
| type | text NOT NULL | | CHECK: income, expense |
| description | text | | |
| date | date NOT NULL | current_date | |
| created_at | timestamptz | now() | |

### bills
Recurring bills with flexible scheduling and member assignment.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid PK | gen_random_uuid() | |
| household_id | uuid FK households NOT NULL | | ON DELETE CASCADE |
| name | text NOT NULL | | |
| amount | numeric(12,2) NOT NULL | | |
| due_day | integer | | CHECK: 1-31. Nullable for payday-linked bills |
| next_due_date | date | | Tracks next occurrence |
| frequency | text NOT NULL | 'monthly' | CHECK: weekly, biweekly, monthly, quarterly, yearly |
| schedule_type | text | 'monthly' | CHECK: monthly, biweekly, weekly, quarterly, yearly, every_payday, every_other_payday, custom |
| custom_interval_days | integer | | CHECK: 1-365. For custom schedule_type only |
| paid_by | text | | household_member UUID as text |
| debt_id | uuid FK debts | | ON DELETE SET NULL. Links bill to debt for balance updates |
| category | text | 'other' | |
| is_autopay | boolean | false | |
| is_active | boolean | true | Soft delete |
| created_at | timestamptz | now() | |

### debts
Debt accounts with balance tracking and payoff progress.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid PK | gen_random_uuid() | |
| household_id | uuid FK households NOT NULL | | ON DELETE CASCADE |
| name | text NOT NULL | | |
| current_balance | numeric(12,2) NOT NULL | | Updated when linked bill is paid |
| original_balance | numeric(12,2) | | For progress calculation |
| interest_rate | numeric(5,2) | 0 | APR percentage |
| minimum_payment | numeric(12,2) | 0 | Monthly minimum |
| due_day | integer | | CHECK: 1-31 |
| type | text | 'other' | CHECK: credit_card, student_loan, auto_loan, mortgage, personal_loan, medical, other |
| is_active | boolean | true | Soft delete |
| created_at | timestamptz | now() | |

### snapshots
Payday balance snapshots for history tracking.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid PK | gen_random_uuid() | |
| household_id | uuid FK households NOT NULL | | ON DELETE CASCADE |
| date | date NOT NULL | | Snapshot date (usually payday) |
| label | text | | e.g. "May 15 payday" |
| notes | text | | |
| created_at | timestamptz | now() | |

### snapshot_balances
Individual account balances within a snapshot.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid PK | gen_random_uuid() | |
| snapshot_id | uuid FK snapshots NOT NULL | | ON DELETE CASCADE |
| account_name | text NOT NULL | | Matches tracked_accounts.name |
| account_type | text NOT NULL | | CHECK: asset, debt |
| balance | numeric(12,2) NOT NULL | 0 | |
| sort_order | integer | 0 | |

### tracked_accounts
Configurable accounts that appear in history snapshot forms.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| id | uuid PK | gen_random_uuid() | |
| household_id | uuid FK households NOT NULL | | ON DELETE CASCADE |
| name | text NOT NULL | | |
| account_type | text NOT NULL | | CHECK: asset, debt |
| owner_member_id | uuid FK household_members | | ON DELETE SET NULL |
| is_active | boolean | true | Toggle dormant accounts off |
| sort_order | integer | 0 | |
| created_at | timestamptz | now() | |

## RPC Functions (Security Definer)

All RPCs run as the function creator to bypass RLS.

### seed_default_categories(h_id uuid) -> void
Seeds 14 default categories (2 income, 12 expense) for a new household.

### handle_signup(p_user_id, p_email, p_display_name, p_invite_code) -> json
Signup flow. With invite code: joins existing household. Without: creates new household + seeds categories. Returns `{household_id}` or `{error}`.

### join_household_by_code(p_user_id, p_invite_code) -> json
Post-signup household join. Moves profile to target household, auto-links member by email match, cleans up empty old household. Returns `{success, household_id, linked_member_id}` or `{error}`.

### delete_my_account(p_user_id) -> json
Non-owner account deletion. Unlinks profile_id from household_member (keeps member record + data), deletes profile and auth user. Returns `{success}` or `{error}`.

### delete_household(p_user_id) -> json
Owner-only. Deletes entire household: all data, all member profiles, all auth users. Returns `{success}` or `{error}`.

### transfer_household_ownership(p_current_owner_id, p_new_owner_id) -> json
Transfers owner_id to another member with a login. Returns `{success}` or `{error}`.

## Row Level Security

All tables have RLS enabled. Policies scope access to the user's household:
- Users can only read/write data where `household_id` matches their `profiles.household_id`
- `profiles` table: users can only read/update their own row
- Security definer RPCs bypass RLS for signup, join, and deletion flows

## SQL Migration Order

| # | File | Status |
|---|------|--------|
| 1 | supabase-schema.sql | DONE |
| 2 | supabase-fix.sql | DONE |
| 3 | supabase-history.sql | DONE |
| 4 | supabase-bills-upgrade.sql | DONE |
| 5 | supabase-bills-flexible-owner.sql | DONE |
| 6 | supabase-members-accounts.sql | DONE |
| 7 | supabase-member-email.sql | DONE |
| 8 | supabase-member-pay.sql | DONE |
| 9 | supabase-bill-debt-link.sql | DONE |
| 10 | supabase-join-household.sql | DONE |
| 11 | supabase-account-deletion.sql | DONE |
| 12 | supabase-transfer-ownership.sql | DONE |
| 13 | supabase-timezone.sql | DONE |
| 14 | import-data.sql | DONE |
| 15 | import-history.sql | DONE |
| 16 | supabase-bill-frequency.sql | DONE |
