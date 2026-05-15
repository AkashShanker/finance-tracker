# FinTracker — Claude Context

## Project Overview
Personal finance tracker web app for Akash and wife Purnima. Replaces an Excel-based workflow. Built with Next.js 15, Supabase (free tier), Tailwind CSS, TypeScript. Deployed on Vercel.

## Current State
- App is live at: https://finance-tracker-kappa-flax.vercel.app/
- Supabase project: https://zufbjgwkjrrrticaglvt.supabase.co
- Dev server: `cd ~/finance-tracker && npm run dev` → http://localhost:3000
- Build check: `cd ~/finance-tracker && npm run build`
- GitHub repo auto-deploys to Vercel on push

## Architecture
- See ARCHITECTURE.md for full documentation
- `src/app/(auth)/` — login, signup pages (no sidebar)
- `src/app/(app)/` — all app pages (with sidebar): dashboard, transactions, bills, calendar, debts, history, charts, ask-claude, settings
- `src/lib/supabase/` — client.ts (browser), server.ts (SSR), middleware.ts (auth session refresh + redirect)
- `src/lib/types.ts` — all TypeScript interfaces
- `src/lib/payday.ts` — payday schedule calculator (getUpcomingPaydays, getNextDueDate, getBillEvents)
- `src/lib/format.ts` — formatCurrency, formatDate, getOrdinalDay, daysUntilDue
- `src/lib/accounts.ts` — (deprecated, now uses tracked_accounts table)
- `src/components/Sidebar.tsx` — navigation with user avatar/name/email at bottom
- `src/components/Modal.tsx` — reusable modal dialog

## Database Tables
- `profiles` — user profiles linked to auth.users (id, email, display_name, household_id, pay_frequency, next_pay_date)
- `households` — household groups (id, name, invite_code, owner_id)
- `categories` — income/expense categories per household
- `transactions` — income and expense entries
- `bills` — recurring bills with schedule types, member assignment, and optional debt linking (debt_id)
- `debts` — debt tracking with balances, interest rates, minimum payments
- `snapshots` + `snapshot_balances` — history ledger for payday balance tracking
- `household_members` — flexible members (name, email, pay_frequency, next_pay_date, profile_id) — don't require signup
- `tracked_accounts` — configurable accounts for history snapshots (asset/debt, owner, active/dormant)

## SQL Files (run in Supabase SQL Editor)
- `supabase-schema.sql` — initial schema (DONE)
- `supabase-fix.sql` — handle_signup RPC function (DONE)
- `supabase-history.sql` — snapshot tables (DONE)
- `supabase-bills-upgrade.sql` — payday-linked bill scheduling (DONE)
- `supabase-bills-flexible-owner.sql` — flexible paid_by column (DONE)
- `supabase-members-accounts.sql` — household_members + tracked_accounts (DONE)
- `supabase-member-email.sql` — email field on household_members (NEEDS TO BE RUN)
- `supabase-member-pay.sql` — pay_frequency + next_pay_date on household_members (NEEDS TO BE RUN)
- `supabase-bill-debt-link.sql` — debt_id on bills for linking bills to debts (NEEDS TO BE RUN)
- `supabase-join-household.sql` — join_household_by_code RPC for switching households (NEEDS TO BE RUN)
- `supabase-account-deletion.sql` — owner_id on households + delete_my_account + delete_household RPCs (NEEDS TO BE RUN)
- `supabase-transfer-ownership.sql` — transfer_household_ownership RPC (NEEDS TO BE RUN)
- `import-data.sql` — initial bills + debts from Excel (DONE)
- `import-history.sql` — 4 historical snapshots from Excel (DONE)

## RPC Functions (security definer, bypass RLS)
- `handle_signup` — creates household + profile during signup, seeds default categories
- `join_household_by_code` — moves existing user to another household by invite code, auto-links member by email, cleans up old empty household
- `delete_my_account` — non-owner: unlinks from household_member, deletes profile + auth user, keeps household data
- `delete_household` — owner: deletes all household data, all member profiles + auth users, the household itself
- `transfer_household_ownership` — changes owner_id on household to another member with a login

## Key Design Decisions
- `paid_by` on bills stores a household_member UUID (not profile ID)
- household_members are separate from auth profiles — members don't need login
- Each household_member has their own pay_frequency + next_pay_date (not just profile-level)
- Bills page computes paydays per member — "every_payday" bills use the assigned member's schedule
- Profile pay settings sync to the user's household_member record on save
- Member email enables auto-linking: on signup or join-by-code, if email matches a member, profile_id is set automatically
- Bills can be linked to debts via debt_id — marking a bill paid on Calendar updates the debt balance
- Calendar page is the consolidated pay hub: shows all bills/paydays, mark-as-paid with custom amounts, debt balance adjustment with user approval
- tracked_accounts are configurable from Settings (not hardcoded)
- Claude integration works by formatting financial context and opening claude.ai (free, no API key)
- RLS policies on all tables scoped to household_id
- Household ownership: owner_id on households determines admin (can delete household, transfer ownership)
- Non-owner account deletion preserves all household data (member record stays, bills remain assigned)
- Sidebar shows logged-in user's name, email, and deterministic colored avatar

## Page Breakdown
- **Dashboard** (`/`) — summary cards (income, expenses, bills, debt), net income banner, upcoming bills, recent transactions, debt overview
- **Transactions** (`/transactions`) — add/delete/filter income & expense transactions with categories
- **Bills** (`/bills`) — list view grouped by member with reassign, calendar view, add/edit with schedule types + debt linking
- **Calendar** (`/calendar`) — consolidated calendar + upcoming list view, click day to expand, mark-as-paid modal with custom amount + debt balance update
- **Debts** (`/debts`) — debt cards with progress bars, add/edit/soft-delete
- **History** (`/history`) — payday snapshot timeline, pre-fills from tracked_accounts + latest snapshot, expandable detail with asset/debt totals
- **Charts** (`/charts`) — 5 recharts: net worth, assets vs debt, CC debt, individual debts, asset breakdown
- **Ask Claude** (`/ask-claude`) — builds financial context from all data + member pay schedules, prompt templates, opens claude.ai
- **Settings** (`/settings`) — profile (name, pay freq, pay date), join household by code, household members (add/edit with email + pay schedule), tracked accounts, invite code + ownership transfer, danger zone (account/household deletion)
- **Login** (`/login`) — email/password auth
- **Signup** (`/signup`) — registration with optional invite code, auto-links member by email

## Environment Variables (set in Vercel + .env.local)
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase publishable anon key

## What's Left / Next Steps
- Run pending SQL migrations in Supabase SQL Editor (see list above)
- Link existing debt-related bills to their debts via Bills → Edit → Linked Debt dropdown
- Connect tracked_accounts to debts table so adding a debt in one place reflects in both (history snapshots + payoff tracking)
- Future: more charts, budget planning page, recurring transaction automation, payday checklist page, password reset flow
