# FinTracker — Claude Context

## Project Overview
Personal finance tracker web app for Akash and wife Purnima. Replaces an Excel-based workflow. Built with Next.js 15, Supabase (free tier), Tailwind CSS, TypeScript. Deployed on Vercel.

## Current State
- App is live at: https://finance-tracker-kappa-flax.vercel.app/
- Supabase project: https://zufbjgwkjrrrticaglvt.supabase.co
- Dev server: `cd ~/finance-tracker && npm run dev` -> http://localhost:3000
- Build check: `cd ~/finance-tracker && npm run build`
- GitHub repo auto-deploys to Vercel on push

## Architecture
- See ARCHITECTURE.md for full documentation
- See DATABASE.md for complete schema diagram, table definitions, RPC functions, and RLS policies
- `src/app/(auth)/` — login, signup pages (no sidebar)
- `src/app/(app)/` — all app pages (with sidebar)
- `src/lib/supabase/` — client.ts (browser), server.ts (SSR), middleware.ts (auth session refresh + redirect)
- `src/lib/types.ts` — all TypeScript interfaces
- `src/lib/payday.ts` — payday schedule calculator (getUpcomingPaydays, getNextDueDate, getBillEvents, reverseBillDate, advanceBillDate, daysUntil)
- `src/lib/format.ts` — formatCurrency, formatDate, getOrdinalDay, daysUntilDue
- `src/lib/timezone.ts` — timezone-aware date utilities (getTodayString, getToday, parseLocalDate, TIMEZONE_OPTIONS)
- `src/lib/accounts.ts` — (deprecated, now uses tracked_accounts table)
- `src/components/Sidebar.tsx` — navigation with user avatar/name/email at bottom
- `src/components/Modal.tsx` — reusable modal dialog

## Database Tables
- `households` — household groups with invite_code and owner_id (admin)
- `profiles` — user profiles linked to auth.users (email, display_name, household_id, pay_frequency, next_pay_date, timezone)
- `household_members` — flexible members (name, email, pay_frequency, next_pay_date, profile_id) — don't require signup
- `categories` — income/expense categories per household (seeded with 14 defaults)
- `transactions` — income and expense entries, optional payment_method_id (FK to tracked_accounts)
- `bills` — recurring bills with schedule_type, paid_by (member UUID), optional debt_id link
- `debts` — debt tracking with current_balance, original_balance, interest_rate, minimum_payment
- `snapshots` + `snapshot_balances` — history ledger for payday balance tracking
- `tracked_accounts` — configurable accounts for history snapshots (asset/debt, owner, active/dormant)

## SQL Files (run in Supabase SQL Editor)
| # | File | Purpose | Status |
|---|------|---------|--------|
| 1 | supabase-schema.sql | Initial schema + RLS + seed_default_categories | DONE |
| 2 | supabase-fix.sql | handle_signup RPC (security definer) | DONE |
| 3 | supabase-history.sql | snapshots + snapshot_balances tables | DONE |
| 4 | supabase-bills-upgrade.sql | Payday-linked bill scheduling | DONE |
| 5 | supabase-bills-flexible-owner.sql | Flexible paid_by column | DONE |
| 6 | supabase-members-accounts.sql | household_members + tracked_accounts | DONE |
| 7 | supabase-member-email.sql | Email field on household_members | NEEDS RUN |
| 8 | supabase-member-pay.sql | pay_frequency + next_pay_date on members | NEEDS RUN |
| 9 | supabase-bill-debt-link.sql | debt_id on bills for linking | NEEDS RUN |
| 10 | supabase-join-household.sql | join_household_by_code RPC | NEEDS RUN |
| 11 | supabase-account-deletion.sql | owner_id + delete RPCs | NEEDS RUN |
| 12 | supabase-transfer-ownership.sql | transfer_household_ownership RPC | NEEDS RUN |
| 13 | supabase-timezone.sql | timezone column on profiles | NEEDS RUN |
| 14 | import-data.sql | Initial bills + debts from Excel | DONE |
| 15 | import-history.sql | 4 historical snapshots from Excel | DONE |
| 16 | supabase-bill-frequency.sql | Expand schedule_type + custom_interval_days | NEEDS RUN |
| 17 | supabase-readable-invite-code.sql | Human-readable invite codes | NEEDS RUN |
| 18 | supabase-transaction-payment-method.sql | payment_method_id on transactions (FK to tracked_accounts) | NEEDS RUN |
| 19 | supabase-bills-category.sql | Add "Bills" expense category to all households | NEEDS RUN |

## RPC Functions (security definer, bypass RLS)
- `seed_default_categories(h_id)` — seeds 14 default categories for new household
- `handle_signup(p_user_id, p_email, p_display_name, p_invite_code)` — signup flow, creates/joins household
- `join_household_by_code(p_user_id, p_invite_code)` — post-signup household switch, auto-links member by email, cleans up old household
- `delete_my_account(p_user_id)` — non-owner: unlinks profile from member, deletes profile + auth, keeps household data
- `delete_household(p_user_id)` — owner-only: deletes entire household + all data + all member accounts
- `transfer_household_ownership(p_current_owner_id, p_new_owner_id)` — transfers admin to another member with a login

## Key Design Decisions
- **Household scoping**: All data is RLS-scoped to household_id. Users only see their household's data.
- **Household ownership**: owner_id on households determines admin. Owner can delete household or transfer ownership. Non-owner deletion preserves all household data.
- **Flexible members**: household_members are separate from auth profiles. Members don't need login. When they sign up (or join by code), profile_id auto-links if email matches.
- **Per-member pay schedules**: Each household_member has pay_frequency + next_pay_date. Bills page computes paydays per member. Profile pay settings sync to the user's member record on save.
- **Bill scheduling**: 8 schedule types (monthly, biweekly, weekly, quarterly, yearly, every_payday, every_other_payday, custom). Custom uses custom_interval_days (every N days). paid_by stores a household_member UUID.
- **Bill-debt linking**: Bills can link to a debt via debt_id. Calendar's mark-as-paid flow updates debt.current_balance with user-approved amount (to account for interest/late charges).
- **Timezone-aware dates**: All date calculations use configurable timezone (default: America/New_York). `src/lib/timezone.ts` provides helpers. Avoids UTC midnight bugs.
- **Bills as pay hub**: Bills page has 3 view tabs (List, Calendar, Upcoming). Calendar shows all bills/paydays across all members with paid/overdue color coding. Click to expand day, mark bills as paid with custom amounts, undo payments. Auto-advances next_due_date, creates expense transaction, updates linked debt balance.
- **User identity**: Sidebar shows deterministic colored avatar (from email hash), display name, email, and household invite code (click to copy) for quick user identification.
- **Payment method on transactions**: Expenses can optionally track which card/account was used via payment_method_id → tracked_accounts. The query gracefully falls back if the DB column doesn't exist yet.
- **Bill payment auto-categorization**: When a bill is marked as paid, the expense transaction is auto-assigned a "Bills" (🧾) category. The category is created on first use if it doesn't exist.
- **Overdue bills in calendar**: getBillEvents accepts a lookbackDays param to generate past-date events. Unpaid past bills show in red with "!" prefix until marked paid. reverseBillDate walks backwards from next_due_date.
- **UI theme**: Clean & minimal Apple Card-inspired pastel design. Frosted glass cards (`bg-white/80 backdrop-blur-sm`), soft shadows, rose-400 for expenses, emerald-500 for income, violet-500 for debt, amber-500 for bills. Background is Apple's `#f5f5f7`. Geist font.

## Page Breakdown
| Route | Page | Key Features |
|-------|------|-------------|
| `/` | Dashboard | Summary cards, net income banner, upcoming bills, recent transactions, debt overview |
| `/transactions` | Transactions | Add/edit/delete expenses & income. Filter by type (all/income/expense) + date range (this week/month/year/custom). Expense Summary panel groups by category with totals. Payment method (card) field from tracked_accounts. |
| `/bills` | Bills | 3 view tabs (List, Calendar, Upcoming). List grouped by member with reassign. Calendar with paid/overdue indicators + mark-as-paid + undo. Upcoming shows next 30 days. Add/edit with 8 schedule types + debt linking |
| ~~`/calendar`~~ | ~~Calendar~~ | **Merged into Bills page** — see Bills "Calendar" and "Upcoming" view tabs |
| `/debts` | Debts | Debt cards with progress bars, add/edit/soft-delete |
| `/history` | History | Payday snapshot timeline, pre-fills from tracked_accounts + latest snapshot, expandable with asset/debt totals |
| `/charts` | Charts | 5 recharts: net worth, assets vs debt, CC debt, individual debts, asset breakdown |
| ~~`/ask-claude`~~ | ~~Ask Claude~~ | **Removed** |
| `/settings` | Settings | Profile (name, pay freq, pay date, timezone), join household, household members (name/email/pay schedule), tracked accounts, invite code + ownership transfer, danger zone (delete account/household) |
| `/login` | Login | Email/password auth |
| `/signup` | Signup | Registration with optional invite code, auto-links member by email |

## Environment Variables (set in Vercel + .env.local)
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase publishable anon key

## What's Left / Next Steps
- Run pending SQL migrations 7-13, 16-19 in Supabase SQL Editor (see table above)
- Link existing debt-related bills to their debts via Bills -> Edit -> Linked Debt dropdown
- Connect tracked_accounts to debts table so adding a debt reflects in both places
- Apply pastel UI polish to remaining pages: debts, history, charts, settings (dashboard, transactions, bills, auth pages are done)
- Fix pre-existing Turbopack parse error in bills/page.tsx (line 585, works fine in production build)
- Future: budget planning page, recurring transaction automation, payday checklist page, password reset flow, more charts
