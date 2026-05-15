"use client";

import { createClient } from "@/lib/supabase/client";
import { formatCurrency, daysUntilDue, getOrdinalDay } from "@/lib/format";
import { getTodayString } from "@/lib/timezone";
import type { Profile, Bill, Debt, Transaction } from "@/lib/types";
import {
  TrendingUp,
  TrendingDown,
  CreditCard,
  Receipt,
  AlertTriangle,
} from "lucide-react";
import { useEffect, useState } from "react";

interface DashboardData {
  profile: Profile | null;
  monthlyIncome: number;
  monthlyExpenses: number;
  upcomingBills: Bill[];
  debts: Debt[];
  recentTransactions: Transaction[];
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    profile: null,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    upcomingBills: [],
    debts: [],
    recentTransactions: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (!profile?.household_id) {
        setData((d) => ({ ...d, profile }));
        setLoading(false);
        return;
      }

      const todayStr = getTodayString(profile.timezone);
      const monthStart = todayStr.slice(0, 7) + "-01";

      const [incomeRes, expenseRes, billsRes, debtsRes, recentRes] =
        await Promise.all([
          supabase
            .from("transactions")
            .select("amount")
            .eq("household_id", profile.household_id)
            .eq("type", "income")
            .gte("date", monthStart),
          supabase
            .from("transactions")
            .select("amount")
            .eq("household_id", profile.household_id)
            .eq("type", "expense")
            .gte("date", monthStart),
          supabase
            .from("bills")
            .select("*")
            .eq("household_id", profile.household_id)
            .eq("is_active", true)
            .order("due_day"),
          supabase
            .from("debts")
            .select("*")
            .eq("household_id", profile.household_id)
            .eq("is_active", true)
            .order("current_balance", { ascending: false }),
          supabase
            .from("transactions")
            .select("*, category:categories(*)")
            .eq("household_id", profile.household_id)
            .order("date", { ascending: false })
            .limit(5),
        ]);

      const monthlyIncome = (incomeRes.data || []).reduce(
        (sum, t) => sum + Number(t.amount),
        0
      );
      const monthlyExpenses = (expenseRes.data || []).reduce(
        (sum, t) => sum + Number(t.amount),
        0
      );

      setData({
        profile,
        monthlyIncome,
        monthlyExpenses,
        upcomingBills: billsRes.data || [],
        debts: debtsRes.data || [],
        recentTransactions: recentRes.data || [],
      });
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  const totalDebt = data.debts.reduce((sum, d) => sum + Number(d.current_balance), 0);
  const totalBills = data.upcomingBills.reduce((sum, b) => sum + Number(b.amount), 0);
  const netIncome = data.monthlyIncome - data.monthlyExpenses;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Welcome{data.profile?.display_name ? `, ${data.profile.display_name}` : ""}
        </h1>
        <p className="text-muted">Here&apos;s your financial overview</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Monthly Income"
          amount={data.monthlyIncome}
          icon={<TrendingUp className="text-success" size={24} />}
          color="text-success"
        />
        <SummaryCard
          title="Monthly Expenses"
          amount={data.monthlyExpenses}
          icon={<TrendingDown className="text-danger" size={24} />}
          color="text-danger"
        />
        <SummaryCard
          title="Monthly Bills"
          amount={totalBills}
          icon={<Receipt className="text-warning" size={24} />}
          color="text-warning"
        />
        <SummaryCard
          title="Total Debt"
          amount={totalDebt}
          icon={<CreditCard className="text-primary" size={24} />}
          color="text-primary"
        />
      </div>

      {/* Net Income Banner */}
      <div
        className={`p-4 rounded-xl border ${
          netIncome >= 0
            ? "bg-green-50 border-green-200"
            : "bg-red-50 border-red-200"
        }`}
      >
        <div className="flex items-center gap-2">
          {netIncome < 0 && <AlertTriangle className="text-danger" size={20} />}
          <span className="font-medium">
            Net this month:{" "}
            <span className={netIncome >= 0 ? "text-success" : "text-danger"}>
              {formatCurrency(netIncome)}
            </span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Bills */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-lg font-semibold mb-4">Upcoming Bills</h2>
          {data.upcomingBills.length === 0 ? (
            <p className="text-muted text-sm">No bills added yet</p>
          ) : (
            <div className="space-y-3">
              {data.upcomingBills.slice(0, 5).map((bill) => {
                const days = bill.due_day ? daysUntilDue(bill.due_day) : null;
                return (
                  <div
                    key={bill.id}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium">{bill.name}</p>
                      <p className="text-sm text-muted">
                        {bill.due_day ? `Due ${getOrdinalDay(bill.due_day)}` : bill.schedule_type === "every_payday" ? "Every payday" : "See schedule"}
                        {days !== null && (
                          <>
                            {" "}&middot;{" "}
                            {days === 0
                              ? "Today!"
                              : days <= 3
                              ? `${days} day${days > 1 ? "s" : ""} away`
                              : `in ${days} days`}
                          </>
                        )}
                        {bill.is_autopay && " · Autopay"}
                      </p>
                    </div>
                    <span className="font-semibold">
                      {formatCurrency(bill.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-lg font-semibold mb-4">Recent Transactions</h2>
          {data.recentTransactions.length === 0 ? (
            <p className="text-muted text-sm">No transactions yet</p>
          ) : (
            <div className="space-y-3">
              {data.recentTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium">
                      {tx.category?.icon} {tx.description || tx.category?.name || "Transaction"}
                    </p>
                    <p className="text-sm text-muted">{tx.date}</p>
                  </div>
                  <span
                    className={`font-semibold ${
                      tx.type === "income" ? "text-success" : "text-danger"
                    }`}
                  >
                    {tx.type === "income" ? "+" : "-"}
                    {formatCurrency(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Debt Overview */}
      {data.debts.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-lg font-semibold mb-4">Debt Overview</h2>
          <div className="space-y-3">
            {data.debts.map((debt) => {
              const progress = debt.original_balance
                ? ((debt.original_balance - debt.current_balance) /
                    debt.original_balance) *
                  100
                : 0;
              return (
                <div key={debt.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{debt.name}</span>
                    <span className="font-semibold">
                      {formatCurrency(debt.current_balance)}
                    </span>
                  </div>
                  {debt.original_balance && (
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-primary rounded-full h-2 transition-all"
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                  )}
                  <div className="flex justify-between text-xs text-muted mt-1">
                    <span>{debt.interest_rate}% APR</span>
                    {debt.original_balance && (
                      <span>{progress.toFixed(0)}% paid off</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  amount,
  icon,
  color,
}: {
  title: string;
  amount: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-muted">{title}</span>
        {icon}
      </div>
      <p className={`text-2xl font-bold ${color}`}>{formatCurrency(amount)}</p>
    </div>
  );
}
