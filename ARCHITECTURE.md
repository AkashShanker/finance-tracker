# FinTracker — Architecture, Maintenance & Learning Guide

This document explains how the entire app works, what each file does, how to maintain it, and what to learn to develop it further yourself.

---

## Table of Contents

1. [How the App Works (Big Picture)](#1-how-the-app-works-big-picture)
2. [Tech Stack Explained](#2-tech-stack-explained)
3. [Project File Map](#3-project-file-map)
4. [Request Flow: What Happens When You Open a Page](#4-request-flow-what-happens-when-you-open-a-page)
5. [Authentication Flow](#5-authentication-flow)
6. [Database Schema](#6-database-schema)
7. [How Each Page Works](#7-how-each-page-works)
8. [Commands Reference](#8-commands-reference)
9. [How to Make Changes](#9-how-to-make-changes)
10. [Maintenance & Operations](#10-maintenance--operations)
11. [Learning Roadmap](#11-learning-roadmap)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. How the App Works (Big Picture)

```
┌─────────────┐         ┌──────────────────┐         ┌──────────────────┐
│   Browser   │ ──────> │  Next.js App     │ ──────> │    Supabase      │
│ (React UI)  │ <────── │  (your code)     │ <────── │ (database + auth)│
└─────────────┘         └──────────────────┘         └──────────────────┘
  You & wife              Runs on your                Cloud database
  open the URL            computer or Vercel          (free tier)
```

**The short version:**
- Your browser loads the React app (HTML + JavaScript)
- The app talks directly to Supabase (a cloud database) to read/write data
- Supabase handles login/signup AND stores all your financial data
- Row Level Security (RLS) ensures you only see your own household's data

There is no traditional "backend server" — Supabase acts as both the database AND the API. Your Next.js app is mostly a frontend that talks to Supabase directly from the browser.

---

## 2. Tech Stack Explained

| Technology | What It Is | Why We Use It |
|-----------|-----------|---------------|
| **Next.js** | A React framework that handles routing, server rendering, and builds | Gives us file-based routing (each file = a page), easy deployment |
| **React** | JavaScript library for building UIs with components | Industry standard, huge community, easy to learn |
| **TypeScript** | JavaScript with type annotations | Catches bugs before they run (e.g., typos in variable names) |
| **Tailwind CSS** | Utility-first CSS framework | Write styles directly in HTML (`className="text-red-500"`) instead of separate CSS files |
| **Supabase** | Open-source Firebase alternative (Postgres database + auth + APIs) | Free tier, handles auth and database, auto-generates REST APIs from your tables |
| **Lucide React** | Icon library | Clean, consistent icons throughout the app |

---

## 3. Project File Map

```
finance-tracker/
├── .env.local                    # YOUR SECRET KEYS (never commit this)
├── .env.local.example            # Template for .env.local
├── package.json                  # Dependencies and scripts
├── next.config.ts                # Next.js configuration
├── tailwind.config.ts            # Tailwind CSS configuration (currently default)
├── tsconfig.json                 # TypeScript configuration
├── supabase-schema.sql           # Database table definitions (run once in Supabase)
├── supabase-fix.sql              # Signup fix function (run once in Supabase)
├── import-data.sql               # Your financial data import (run once in Supabase)
│
└── src/
    ├── middleware.ts              # GATEWAY: Runs before every page load, checks auth
    │
    ├── lib/                      # SHARED UTILITIES (used by multiple pages)
    │   ├── types.ts              # TypeScript type definitions for all data models
    │   ├── format.ts             # Currency/date formatting helper functions
    │   └── supabase/
    │       ├── client.ts         # Supabase client for BROWSER code
    │       ├── server.ts         # Supabase client for SERVER code
    │       └── middleware.ts     # Auth session refresh logic
    │
    ├── components/               # REUSABLE UI PIECES
    │   ├── Sidebar.tsx           # Navigation sidebar (appears on every page)
    │   └── Modal.tsx             # Pop-up dialog for forms (add transaction, etc.)
    │
    └── app/                      # PAGES (each folder = a URL route)
        ├── layout.tsx            # ROOT LAYOUT: HTML wrapper for entire app
        ├── globals.css           # Global styles and CSS variables (colors)
        │
        ├── (auth)/               # AUTH PAGES (no sidebar)
        │   ├── login/page.tsx    # /login — email + password form
        │   └── signup/page.tsx   # /signup — registration with invite code
        │
        └── (app)/                # APP PAGES (with sidebar)
            ├── layout.tsx        # APP LAYOUT: adds sidebar to all app pages
            ├── page.tsx          # / — Dashboard (summary cards, upcoming bills)
            ├── transactions/
            │   └── page.tsx      # /transactions — add/view income & expenses
            ├── bills/
            │   └── page.tsx      # /bills — manage recurring bills
            ├── debts/
            │   └── page.tsx      # /debts — track debt balances and payoff
            ├── ask-claude/
            │   └── page.tsx      # /ask-claude — AI financial advice prompts
            └── settings/
                └── page.tsx      # /settings — profile, pay schedule, invite code
```

### Key Concepts in the File Structure

**Route Groups `(auth)` and `(app)`:** The parentheses mean "group these pages together but DON'T add to the URL." So `(app)/bills/page.tsx` maps to `/bills`, not `/app/bills`. The groups let us use different layouts — auth pages have no sidebar, app pages do.

**`page.tsx`:** In Next.js App Router, a file named `page.tsx` inside a folder becomes a route. `bills/page.tsx` → `/bills`.

**`layout.tsx`:** Wraps all pages in its folder. The root layout adds the HTML/body tags. The `(app)/layout.tsx` adds the sidebar.

**`"use client"`:** At the top of most page files. Tells Next.js this component runs in the browser (not on the server). We need this because we use React hooks like `useState` and `useEffect`.

---

## 4. Request Flow: What Happens When You Open a Page

Here's exactly what happens when you visit `http://localhost:3000/bills`:

```
1. Browser requests /bills
        │
        ▼
2. middleware.ts intercepts the request
   → Creates a Supabase client using your cookies
   → Calls supabase.auth.getUser() to check if you're logged in
   → NOT logged in? Redirects to /login
   → Logged in? Lets the request through
        │
        ▼
3. Next.js matches the route: /bills → src/app/(app)/bills/page.tsx
        │
        ▼
4. Layouts wrap the page (outside → inside):
   app/layout.tsx          → <html><body>...</body></html>
   (app)/layout.tsx        → <Sidebar /> + <main>{page}</main>
   bills/page.tsx          → The actual bills content
        │
        ▼
5. Browser receives the HTML + JavaScript
        │
        ▼
6. React hydrates (makes the page interactive)
   → useEffect() runs
   → Calls supabase.from("bills").select("*") to fetch your bills
   → Supabase checks RLS policies → only returns YOUR household's bills
   → setState() updates the page with your data
        │
        ▼
7. You see your bills list!
```

---

## 5. Authentication Flow

### Signup Flow
```
User fills form → supabase.auth.signUp({ email, password })
                          │
                          ▼
               Supabase creates user in auth.users table
                          │
                          ▼
               App calls handle_signup() RPC function
               (security definer = bypasses RLS)
                          │
                    ┌─────┴─────┐
                    │           │
              No invite     Has invite
              code          code
                    │           │
                    ▼           ▼
              Create new    Find existing
              household     household
                    │           │
                    ▼           ▼
              Seed default  ────────────┐
              categories                │
                    │                   │
                    ▼                   ▼
               Create profile with household_id
                          │
                          ▼
               Redirect to Dashboard
```

### Login Flow
```
User fills form → supabase.auth.signInWithPassword()
                          │
                          ▼
               Supabase validates credentials
               Sets auth cookies in browser
                          │
                          ▼
               Redirect to Dashboard
               middleware.ts sees valid cookies
               All Supabase queries now include user context
```

### How Sessions Work
- Supabase stores auth tokens in browser cookies
- `middleware.ts` refreshes these tokens on every request
- The token tells Supabase WHO you are, so RLS policies work
- Tokens expire and auto-refresh (handled by `@supabase/ssr`)

---

## 6. Database Schema

### Tables and Relationships

```
auth.users (managed by Supabase)
    │
    │ id (uuid)
    ▼
profiles ──────────────────────┐
    │                          │
    │ household_id             │ id = user_id
    ▼                          │
households                     │
    │                          │
    │ id (uuid)                │
    ▼                          ▼
┌─────────────┬───────────┬──────────┬───────────┐
│ categories  │ transactions │  bills  │   debts   │
│             │              │         │           │
│ household_id│ household_id │ house.. │ house..   │
│ name        │ user_id      │ name    │ name      │
│ type        │ amount       │ amount  │ balance   │
│ icon        │ category_id  │ due_day │ apr       │
└─────────────┴───────────┴──────────┴───────────┘
```

### Row Level Security (RLS) — How Data Stays Private

Every table has RLS policies that say: "Only let users see/edit data belonging to their household."

Example policy (simplified):
```sql
-- "Can I read this bill?"
-- Only if the bill's household_id matches MY household_id
CREATE POLICY "read bills" ON bills FOR SELECT USING (
  household_id IN (
    SELECT household_id FROM profiles WHERE id = auth.uid()
  )
);
```

`auth.uid()` is a Supabase function that returns the currently logged-in user's ID (from the auth token in the cookie). This means:
- You and your wife (same household) see the same data
- A random person who signs up sees nothing of yours

---

## 7. How Each Page Works

### Dashboard (`src/app/(app)/page.tsx`)
**What it does:** Shows financial overview — income/expenses this month, upcoming bills, recent transactions, debt progress.

**Data flow:**
1. Gets current user → gets their profile → gets household_id
2. Runs 5 parallel Supabase queries (income, expenses, bills, debts, recent transactions)
3. Calculates totals client-side
4. Renders summary cards and lists

**Key patterns:**
- `Promise.all([...])` — runs multiple database queries at once (faster)
- Conditional rendering — shows "No bills added yet" when empty

### Transactions (`src/app/(app)/transactions/page.tsx`)
**What it does:** List all transactions, filter by type, add new ones, delete.

**Key patterns:**
- `useState` for form state and filter state
- Modal component for the "add" form
- `category:categories(*)` — Supabase join syntax (fetches the related category)
- Optimistic deletion — removes from state immediately, doesn't wait for DB

### Bills (`src/app/(app)/bills/page.tsx`)
**What it does:** List active/inactive bills, toggle status, add new, delete.

**Key patterns:**
- `daysUntilDue()` — calculates urgency from due_day
- Toggle active/inactive without a modal (inline update)
- Separated active vs inactive lists

### Debts (`src/app/(app)/debts/page.tsx`)
**What it does:** Card-based debt view with progress bars, edit/delete, add new.

**Key patterns:**
- Edit reuses the same modal as add (controlled by `editingId` state)
- Progress bar: `(original - current) / original * 100`
- `is_active: false` is a soft delete (hides but doesn't remove)

### Ask Claude (`src/app/(app)/ask-claude/page.tsx`)
**What it does:** Builds a text summary of your financial data and opens Claude.ai with it.

**Key patterns:**
- `buildContext()` — queries all your data and formats it as plain text
- `PROMPT_TEMPLATES` — pre-built prompts for common questions
- `encodeURIComponent()` — URL-encodes the prompt for `claude.ai/new?q=...`
- Copy to clipboard as fallback

### Settings (`src/app/(app)/settings/page.tsx`)
**What it does:** Edit profile (name, pay frequency, next pay date), view household invite code and members.

**Key patterns:**
- Form with save button (not auto-save)
- Clipboard API for copying invite code
- Lists household members from profiles table

---

## 8. Commands Reference

### Daily Development

| Command | What It Does |
|---------|-------------|
| `cd ~/finance-tracker && npm run dev` | Start the dev server at localhost:3000 |
| `npm run build` | Build for production (also checks for TypeScript errors) |
| `npm run start` | Run the production build locally |
| `npm install <package>` | Add a new dependency |

### Git (Version Control)

| Command | What It Does |
|---------|-------------|
| `git status` | See what files changed |
| `git add .` | Stage all changes |
| `git commit -m "message"` | Save a checkpoint |
| `git log --oneline -10` | See last 10 commits |
| `git push` | Upload to GitHub |

### Deployment (Vercel)

| Command | What It Does |
|---------|-------------|
| `npx vercel` | Deploy from command line |
| `npx vercel --prod` | Deploy to production URL |

Or just push to GitHub — Vercel auto-deploys on push.

### Database (Supabase)

All database changes are done in the Supabase dashboard → SQL Editor. There's no command-line tool needed for this project.

---

## 9. How to Make Changes

### Adding a New Page

1. Create folder: `src/app/(app)/your-page/`
2. Create file: `src/app/(app)/your-page/page.tsx`
3. Add navigation link in `src/components/Sidebar.tsx`
4. The page is now live at `/your-page`

Example minimal page:
```tsx
"use client";

export default function YourPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold">Your Page</h1>
      <p>Content here</p>
    </div>
  );
}
```

### Adding a New Database Table

1. Write CREATE TABLE SQL in Supabase SQL Editor
2. Add RLS policies (copy pattern from existing tables)
3. Add TypeScript type in `src/lib/types.ts`
4. Query it with `supabase.from("your_table").select("*")`

### Changing Styles

All colors are defined in `src/app/globals.css` as CSS variables:
```css
--primary: #3b82f6;    /* Blue — buttons, active states */
--success: #22c55e;    /* Green — income, positive */
--danger: #ef4444;     /* Red — expenses, negative */
--warning: #f59e0b;    /* Yellow — due soon */
```

Change these to retheme the entire app.

### Adding a New Bill Field

1. Add column in Supabase: `ALTER TABLE bills ADD COLUMN new_field text;`
2. Update type in `src/lib/types.ts`
3. Add form field in `src/app/(app)/bills/page.tsx`
4. Include in the insert query

---

## 10. Maintenance & Operations

### Regular Maintenance

| Task | Frequency | How |
|------|-----------|-----|
| Update dependencies | Monthly | `npm update` then `npm run build` to check nothing broke |
| Check Supabase usage | Monthly | Supabase dashboard → Settings → Usage (free tier: 500MB DB, 50K users) |
| Backup data | Monthly | Supabase dashboard → Settings → Database → Backups |
| Check for security updates | Monthly | `npm audit` — fix with `npm audit fix` |

### If the App Breaks

1. **Check the browser console** (F12 → Console tab) for error messages
2. **Check the terminal** where `npm run dev` is running for server errors
3. **Check Supabase** dashboard → Logs for database errors
4. Common fixes:
   - `npm run build` — catches TypeScript errors
   - Restart dev server (Ctrl+C then `npm run dev`)
   - Clear browser cookies if auth is broken

### Environment Variables

| Variable | Where to Get It | What It Does |
|----------|----------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | Tells the app where your database lives |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | Public key for browser-to-database communication |

The `NEXT_PUBLIC_` prefix means these are exposed to the browser. That's OK — RLS protects your data, not the key.

### Deploying Updates

```bash
# After making changes:
git add .
git commit -m "describe what you changed"
git push
# Vercel auto-deploys (if connected to GitHub)
```

---

## 11. Learning Roadmap

Here's what to learn, in order, to fully understand and extend this app:

### Phase 1: Foundations (Week 1-2)
| Topic | Resource | Why |
|-------|----------|-----|
| **HTML & CSS basics** | MDN Web Docs | Everything renders as HTML with CSS styling |
| **JavaScript basics** | javascript.info | The language everything is written in |
| **TypeScript basics** | typescriptlang.org/docs | Just JavaScript + types. Focus on: interfaces, type annotations |

### Phase 2: React (Week 3-4)
| Topic | Resource | Why |
|-------|----------|-----|
| **React fundamentals** | react.dev/learn | Components, JSX, props |
| **useState hook** | react.dev/reference/react/useState | How pages store and update data (forms, lists) |
| **useEffect hook** | react.dev/reference/react/useEffect | How pages load data when they open |
| **Handling events** | react.dev/learn/responding-to-events | Button clicks, form submissions |

### Phase 3: Next.js (Week 5-6)
| Topic | Resource | Why |
|-------|----------|-----|
| **App Router** | nextjs.org/docs/app | File-based routing, layouts, route groups |
| **Client vs Server components** | nextjs.org/docs/app/building-your-application/rendering | When to use `"use client"` |
| **Middleware** | nextjs.org/docs/app/building-your-application/routing/middleware | Auth protection |

### Phase 4: Supabase (Week 7-8)
| Topic | Resource | Why |
|-------|----------|-----|
| **Supabase JavaScript client** | supabase.com/docs/reference/javascript | `.from().select()`, `.insert()`, `.update()` |
| **Row Level Security** | supabase.com/docs/guides/auth/row-level-security | How data privacy works |
| **Auth** | supabase.com/docs/guides/auth | Signup, login, sessions |

### Phase 5: Styling (Ongoing)
| Topic | Resource | Why |
|-------|----------|-----|
| **Tailwind CSS** | tailwindcss.com/docs | Utility classes like `text-red-500`, `p-4`, `flex` |
| **Responsive design** | tailwindcss.com/docs/responsive-design | `md:` prefix for desktop vs mobile |

### Recommended Practice Projects
1. Add a "notes" field to transactions (tiny change, learn the full flow)
2. Add a "paid this month" checkbox to bills
3. Build a monthly budget page that compares income vs spending by category
4. Add a chart library (recharts) to show spending trends

---

## 12. Troubleshooting

### "Invalid Supabase URL"
→ Your `.env.local` is missing or has placeholder values. Check `NEXT_PUBLIC_SUPABASE_URL`.

### "Failed to create household" on signup
→ Run `supabase-fix.sql` in the Supabase SQL Editor. This creates the `handle_signup` function.

### Page shows "Loading..." forever
→ Check browser console (F12). Usually means the Supabase query failed. Common causes:
- Table doesn't exist (run `supabase-schema.sql`)
- RLS blocking the query (user has no household)
- Network issue

### "relation does not exist"
→ You haven't run `supabase-schema.sql` yet, or it had an error. Re-run it.

### Can't see wife's data
→ She needs to sign up with the invite code from your Settings page. Check that her profile has the same `household_id` by running in Supabase SQL Editor:
```sql
SELECT id, email, household_id FROM profiles;
```

### TypeScript errors when building
→ Run `npm run build` to see exact errors. Most common: a property name typo or missing field in a type.

---

## Glossary

| Term | Meaning |
|------|---------|
| **Component** | A reusable piece of UI (like `<Modal>` or `<Sidebar>`) |
| **Hook** | A React function that adds behavior to components (`useState`, `useEffect`) |
| **Route** | A URL path (`/bills`, `/settings`) mapped to a page file |
| **Layout** | A wrapper component that surrounds pages (adds sidebar, HTML structure) |
| **RLS** | Row Level Security — database rules that restrict who can see/edit what |
| **RPC** | Remote Procedure Call — calling a database function from the app |
| **Hydration** | When React makes server-rendered HTML interactive in the browser |
| **Middleware** | Code that runs BEFORE a page loads (used for auth checks) |
| **State** | Data that a component "remembers" between renders (form values, lists) |
| **Props** | Data passed from a parent component to a child component |
