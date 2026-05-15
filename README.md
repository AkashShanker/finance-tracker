# FinTracker - Personal Finance Tracker

A free, self-hosted finance tracker for you and your partner. Track income, expenses, bills, debts, and get AI-powered financial advice via Claude.

## Features

- **Dashboard** - Monthly overview of income, expenses, bills, and debts
- **Transactions** - Log income and expenses with categories
- **Bills** - Track recurring bills with due date reminders
- **Debts** - Monitor balances, interest rates, and payoff progress
- **Ask Claude** - Get paycheck planning, debt strategies, and budget advice (opens Claude.ai with your financial context)
- **Multi-user** - Share a household with your partner via invite code
- **Mobile-friendly** - Responsive design works on phone, tablet, and desktop

## Setup Guide

### 1. Create a Supabase Project (free)

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **New Project** and give it a name (e.g., "finance-tracker")
3. Set a database password (save it somewhere safe)
4. Choose a region close to you
5. Wait for the project to finish setting up (~2 minutes)

### 2. Set Up the Database

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Open the file `supabase-schema.sql` from this project
4. Copy the entire contents and paste it into the SQL Editor
5. Click **Run** - this creates all the tables, security policies, and default categories

### 3. Get Your API Keys

1. In Supabase, go to **Settings** > **API** (left sidebar)
2. Copy the **Project URL** (looks like `https://xxxxx.supabase.co`)
3. Copy the **anon/public** key (the long string under "Project API keys")

### 4. Configure the App

1. In the project directory, copy the example env file:
   ```bash
   cp .env.local.example .env.local
   ```
2. Edit `.env.local` and paste your values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```

### 5. Run the App

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Create Your Account

1. Click **Sign up** and create your account
2. This automatically creates a household and default categories
3. Go to **Settings** to find your **household invite code**
4. Share the invite code with your wife
5. She signs up and enters the invite code to join your household
6. You both now see the same bills, debts, and transactions!

### 7. Set Up Your Pay Schedule

1. Go to **Settings**
2. Set your **pay frequency** (weekly, biweekly, monthly)
3. Set your **next pay date**
4. This helps Claude give better paycheck planning advice

## Deploying for Free (so your wife can access it)

### Option A: Vercel (recommended)

1. Push this project to a GitHub repo
2. Go to [vercel.com](https://vercel.com) and sign in with GitHub
3. Import your repo
4. Add your environment variables (NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY)
5. Click Deploy
6. You get a free URL like `finance-tracker-xxx.vercel.app`

### Option B: Run Locally on Your Network

```bash
npm run dev -- --hostname 0.0.0.0
```
Your wife can access it at `http://YOUR-IP:3000` on the same Wi-Fi.

## Tech Stack

- **Next.js 15** - React framework
- **Supabase** - Database, auth, and row-level security (free tier)
- **Tailwind CSS** - Styling
- **Lucide React** - Icons
- **TypeScript** - Type safety
