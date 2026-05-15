# FinTracker — Claude Context

## Project Overview
Personal finance tracker web app for Akash and wife Purnima. Replaces an Excel-based workflow. Built with Next.js 15, Supabase (free tier), Tailwind CSS, TypeScript.

## Current State
- App is functional with: auth, dashboard, transactions, bills (with calendar + payday scheduling), debts, history ledger, charts, ask-claude, settings
- Supabase project: https://zufbjgwkjrrrticaglvt.supabase.co
- Dev server: `cd ~/finance-tracker && npm run dev` → http://localhost:3000
- Build check: `cd ~/finance-tracker && npm run build`

## Architecture
- See ARCHITECTURE.md for full documentation
- `src/app/(auth)/` — login, signup pages (no sidebar)
- `src/app/(app)/` — all app pages (with sidebar, including /calendar for consolidated pay view)
- `src/lib/supabase/` — client.ts (browser), server.ts (SSR), middleware.ts (auth)
- `src/lib/types.ts` — all TypeScript interfaces
- `src/lib/payday.ts` — payday schedule calculator
- `src/lib/accounts.ts` — (deprecated, now uses tracked_accounts table)
- `src/components/` — Sidebar.tsx, Modal.tsx

## Database Tables
- profiles, households, categories, transactions, bills, debts
- snapshots, snapshot_balances (history tracking)
- household_members (flexible members without requiring signup)
- tracked_accounts (configurable accounts for history snapshots)

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
- `import-data.sql` — initial bills + debts from Excel (DONE)
- `import-history.sql` — 4 historical snapshots from Excel (DONE)

## Key Design Decisions
- `paid_by` on bills stores a household_member UUID (not profile ID)
- household_members are separate from auth profiles — members don't need login
- Each household_member has their own pay_frequency + next_pay_date (not just profile-level)
- Bills page computes paydays per member — "every_payday" bills use the assigned member's schedule
- Profile pay settings sync to the user's household_member record on save
- Member email enables auto-linking: on signup with invite code, if email matches a member, profile_id is set
- Bills can be linked to debts via debt_id — marking a bill paid on Calendar updates the debt balance
- Calendar page is the consolidated pay hub: shows all bills/paydays, mark-as-paid with custom amounts, debt balance adjustment
- tracked_accounts are configurable from Settings (not hardcoded)
- Claude integration works by formatting financial context and opening claude.ai (free, no API key)
- RLS policies on all tables scoped to household_id

## What's Left / Next Steps
- Run 3 SQL migrations in Supabase SQL Editor: `supabase-member-email.sql`, `supabase-member-pay.sql`, `supabase-bill-debt-link.sql`
- Deploy to Vercel so wife can access remotely
- Connect tracked_accounts to debts table so adding a debt in one place reflects in both (history snapshots + payoff tracking)
- Future: more charts, budget planning page, recurring transaction automation, payday checklist page
