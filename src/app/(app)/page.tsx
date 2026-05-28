"use client";

import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import { getTodayString } from "@/lib/timezone";
import { getUpcomingPaydays, getNextDueDate, getBillEvents, advanceBillDate } from "@/lib/payday";
import type { Profile, Bill, Transaction, HouseholdMember, TrackedAccount, SnapshotBalance } from "@/lib/types";
import Modal from "@/components/Modal";
import {
  TrendingUp,
  TrendingDown,
  Receipt,
  AlertTriangle,
  Check,
  Download,
} from "lucide-react";
import { useEffect, useState } from "react";
import { format, addDays, isBefore, startOfDay } from "date-fns";

interface BillEvent {
  date: Date;
  billId: string;
  name: string;
  amount: number;
  is_autopay: boolean;
  paid_by: string;
}

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [monthlyExpenses, setMonthlyExpenses] = useState(0);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [allMonthTransactions, setAllMonthTransactions] = useState<Transaction[]>([]);
  const [trackedAccounts, setTrackedAccounts] = useState<TrackedAccount[]>([]);
  const [latestBalances, setLatestBalances] = useState<SnapshotBalance[]>([]);
  const [loading, setLoading] = useState(true);

  // Paid tracking
  const [paidKeys, setPaidKeys] = useState<Set<string>>(new Set());

  // Pay modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payingBill, setPayingBill] = useState<Bill | null>(null);
  const [payingDate, setPayingDate] = useState<Date | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [paying, setPaying] = useState(false);
  const [paySuccess, setPaySuccess] = useState("");

  // Undo modal
  const [undoModalOpen, setUndoModalOpen] = useState(false);
  const [undoEvent, setUndoEvent] = useState<BillEvent | null>(null);
  const [undoing, setUndoing] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: prof } = await supabase
      .from("profiles").select("*").eq("id", user.id).single();
    if (!prof?.household_id) {
      setProfile(prof);
      setLoading(false);
      return;
    }
    setProfile(prof);

    const todayStr = getTodayString(prof.timezone);
    const monthStart = todayStr.slice(0, 7) + "-01";

    const [incomeRes, expenseRes, billsRes, recentRes, membersRes, txRes, accountsRes, snapshotRes, allMonthTxRes] =
      await Promise.all([
        supabase.from("transactions").select("amount").eq("household_id", prof.household_id).eq("type", "income").gte("date", monthStart),
        supabase.from("transactions").select("amount").eq("household_id", prof.household_id).eq("type", "expense").gte("date", monthStart),
        supabase.from("bills").select("*").eq("household_id", prof.household_id).eq("is_active", true).order("due_day"),
        supabase.from("transactions").select("*, category:categories(*)").eq("household_id", prof.household_id).order("date", { ascending: false }).limit(5),
        supabase.from("household_members").select("*").eq("household_id", prof.household_id).eq("is_active", true).order("created_at"),
        supabase.from("transactions").select("description, date").eq("household_id", prof.household_id).eq("type", "expense").like("description", "Bill:%"),
        supabase.from("tracked_accounts").select("*").eq("household_id", prof.household_id).eq("is_active", true).order("sort_order"),
        supabase.from("snapshots").select("*, balances:snapshot_balances(*)").eq("household_id", prof.household_id).order("date", { ascending: false }).limit(1),
        supabase.from("transactions").select("*, category:categories(*)").eq("household_id", prof.household_id).gte("date", monthStart).order("date", { ascending: false }),
      ]);

    setMonthlyIncome((incomeRes.data || []).reduce((sum, t) => sum + Number(t.amount), 0));
    setMonthlyExpenses((expenseRes.data || []).reduce((sum, t) => sum + Number(t.amount), 0));
    setBills(billsRes.data || []);
    setRecentTransactions(recentRes.data || []);
    setMembers(membersRes.data || []);
    setAllMonthTransactions(allMonthTxRes.data || []);
    setTrackedAccounts(accountsRes.data || []);
    setLatestBalances(snapshotRes.data?.[0]?.balances || []);

    // Build paid keys — extract bill ID from description "[uuid]", fallback to name match
    const fetchedBills = billsRes.data || [];
    const keys = new Set<string>();
    for (const tx of txRes.data || []) {
      const desc = tx.description?.replace(/^Bill:\s*/, "") || "";
      const idMatch = desc.match(/\[([0-9a-f-]{36})\]/);
      const billId = idMatch
        ? idMatch[1]
        : fetchedBills.find((b: Bill) => b.name === desc.split(" — ")[0].trim())?.id;
      if (billId && tx.date) {
        keys.add(`${billId}|${tx.date}`);
      }
    }
    setPaidKeys(keys);
    setLoading(false);
  }

  function getMemberName(memberId: string | null): string {
    if (!memberId || memberId === "shared") return "Shared";
    const member = members.find((m) => m.id === memberId);
    return member?.name || "Unknown";
  }

  // Build paydays per member
  const memberPaydays = new Map<string, Date[]>();
  for (const m of members) {
    if (m.next_pay_date && m.pay_frequency) {
      memberPaydays.set(m.id, getUpcomingPaydays(m.next_pay_date, m.pay_frequency, 26));
    }
  }

  const fallbackPaydays = profile?.next_pay_date
    ? getUpcomingPaydays(profile.next_pay_date, profile.pay_frequency || "biweekly", 26)
    : [];

  function getPaydaysForBill(bill: Bill): Date[] {
    if (bill.paid_by && memberPaydays.has(bill.paid_by)) {
      return memberPaydays.get(bill.paid_by)!;
    }
    return fallbackPaydays;
  }

  // Upcoming events (next 10 days)
  const activeBills = bills.filter((b) => b.is_active);
  const today = startOfDay(new Date());

  const upcomingEvents: BillEvent[] = activeBills.flatMap((bill) => {
    const pd = getPaydaysForBill(bill);
    return getBillEvents(
      [{ ...bill, paid_by: bill.paid_by || "shared" }],
      pd,
      10
    );
  }).sort((a, b) => a.date.getTime() - b.date.getTime());

  function isEventPaid(billId: string, date: Date): boolean {
    return paidKeys.has(`${billId}|${format(date, "yyyy-MM-dd")}`);
  }

  function isEventOverdue(billId: string, date: Date): boolean {
    return !isEventPaid(billId, date) && isBefore(date, today);
  }

  function exportCSV() {
    const todayStr = format(today, "yyyy-MM-dd");
    const rows: string[] = [];
    const esc = (v: string | number | null | undefined) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };

    // Section 1: Summary
    rows.push("=== FINANCIAL SUMMARY ===");
    rows.push(`Report Date,${todayStr}`);
    rows.push(`Monthly Income,${monthlyIncome.toFixed(2)}`);
    rows.push(`Monthly Bills Paid,${billExpenses.toFixed(2)}`);
    rows.push(`Other Spending,${otherSpending.toFixed(2)}`);
    rows.push(`Total Expenses,${monthlyExpenses.toFixed(2)}`);
    rows.push(`Net Income,${(monthlyIncome - monthlyExpenses).toFixed(2)}`);
    rows.push("");

    // Section 2: Account Balances (from latest snapshot)
    if (latestBalances.length > 0) {
      rows.push("=== ACCOUNT BALANCES (Latest Snapshot) ===");
      rows.push("Account,Type,Balance");
      const assets = latestBalances.filter(b => b.account_type === "asset");
      const debtBals = latestBalances.filter(b => b.account_type === "debt");
      for (const b of assets) rows.push(`${esc(b.account_name)},Asset,${Number(b.balance).toFixed(2)}`);
      for (const b of debtBals) rows.push(`${esc(b.account_name)},Debt,${Number(b.balance).toFixed(2)}`);
      const totalAssets = assets.reduce((s, b) => s + Number(b.balance), 0);
      const totalDebtBal = debtBals.reduce((s, b) => s + Number(b.balance), 0);
      rows.push(`Total Assets,,${totalAssets.toFixed(2)}`);
      rows.push(`Total Debt,,${totalDebtBal.toFixed(2)}`);
      rows.push(`Net Worth,,${(totalAssets - totalDebtBal).toFixed(2)}`);
      rows.push("");
    }

    // Section 3: Bills (upcoming 30 days)
    const billEvents30: BillEvent[] = activeBills.flatMap((bill) => {
      const pd = getPaydaysForBill(bill);
      return getBillEvents([{ ...bill, paid_by: bill.paid_by || "shared" }], pd, 30, profile?.timezone, 7);
    }).sort((a, b) => a.date.getTime() - b.date.getTime());

    if (billEvents30.length > 0) {
      rows.push("=== UPCOMING BILLS (Next 30 Days + 7 Day Lookback) ===");
      rows.push("Bill Name,Due Date,Amount,Paid By,Status,Autopay,Schedule Type");
      for (const evt of billEvents30) {
        const bill = bills.find(b => b.id === evt.billId);
        const paid = isEventPaid(evt.billId, evt.date);
        const overdue = isEventOverdue(evt.billId, evt.date);
        const status = paid ? "Paid" : overdue ? "OVERDUE" : "Upcoming";
        rows.push(`${esc(evt.name)},${format(evt.date, "yyyy-MM-dd")},${evt.amount.toFixed(2)},${esc(getMemberName(evt.paid_by))},${status},${evt.is_autopay ? "Yes" : "No"},${bill?.schedule_type || ""}`);
      }
      rows.push("");
    }

    // Section 5: This month's transactions
    if (allMonthTransactions.length > 0) {
      rows.push("=== TRANSACTIONS THIS MONTH ===");
      rows.push("Date,Type,Description,Category,Amount");
      for (const tx of allMonthTransactions) {
        const cat = tx.category ? `${tx.category.icon} ${tx.category.name}` : "";
        rows.push(`${tx.date},${tx.type},${esc(tx.description || "")},${esc(cat)},${Number(tx.amount).toFixed(2)}`);
      }
      rows.push("");
    }

    // Section 6: Household members & pay schedules
    if (members.length > 0) {
      rows.push("=== HOUSEHOLD MEMBERS ===");
      rows.push("Name,Pay Frequency,Next Payday");
      for (const m of members) {
        let nextPayday = "";
        if (m.next_pay_date && m.pay_frequency) {
          const pds = getUpcomingPaydays(m.next_pay_date, m.pay_frequency, 1, profile?.timezone);
          if (pds.length > 0) nextPayday = format(pds[0], "yyyy-MM-dd");
        }
        rows.push(`${esc(m.name)},${m.pay_frequency || ""},${nextPayday}`);
      }
    }

    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fintracker-report-${todayStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Pay modal
  function openPay(event: BillEvent) {
    const bill = bills.find((b) => b.id === event.billId);
    if (!bill) return;

    setPayingBill(bill);
    setPayingDate(event.date);
    setPayAmount(String(bill.amount));
    setPayNotes("");
    setPaySuccess("");
    setPayModalOpen(true);
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!payingBill || !profile?.household_id) return;
    setPaying(true);
    setPaySuccess("");

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setPaySuccess("Error: Not logged in"); setPaying(false); return; }

      const amount = parseFloat(payAmount);
      const payDate = payingDate ? format(payingDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");

      const { error: txError } = await supabase.from("transactions").insert({
        household_id: profile.household_id,
        user_id: user.id,
        amount,
        type: "expense",
        description: `Bill: ${payingBill.name} [${payingBill.id}]${payNotes ? ` — ${payNotes}` : ""}`,
        date: payDate,
      });

      if (txError) { setPaySuccess(`Error: ${txError.message}`); setPaying(false); return; }

      // Advance bill date from the event date being paid, not getNextDueDate()
      // (getNextDueDate auto-skips past overdue dates which would double-advance)
      if (payingDate) {
        const pd = getPaydaysForBill(payingBill);
        let advancedDate: string | null = null;
        if (payingBill.schedule_type === "every_payday" || payingBill.schedule_type === "every_other_payday") {
          const step = payingBill.schedule_type === "every_other_payday" ? 2 : 1;
          const futurePd = pd.filter((d) => d.getTime() > payingDate.getTime());
          if (futurePd.length >= step) advancedDate = format(futurePd[step - 1], "yyyy-MM-dd");
        } else {
          advancedDate = format(advanceBillDate(payingDate, payingBill.schedule_type, payingBill.custom_interval_days), "yyyy-MM-dd");
        }
        if (advancedDate) {
          await supabase.from("bills").update({ next_due_date: advancedDate }).eq("id", payingBill.id);
        }
      }

      setPaidKeys((prev) => { const next = new Set(prev); next.add(`${payingBill.id}|${payDate}`); return next; });
      setPaying(false);
      setPaySuccess(`Paid ${formatCurrency(amount)} for ${payingBill.name}`);
      load();
    } catch (err) {
      setPaying(false);
      setPaySuccess(`Error: ${err instanceof Error ? err.message : "Something went wrong"}`);
    }
  }

  // Undo
  function openUndo(event: BillEvent) {
    setUndoEvent(event);
    setUndoModalOpen(true);
  }

  async function handleUndo() {
    if (!undoEvent || !profile?.household_id) return;
    setUndoing(true);
    try {
      const supabase = createClient();
      const bill = bills.find((b) => b.id === undoEvent.billId);
      const dateStr = format(undoEvent.date, "yyyy-MM-dd");

      // Try matching by bill ID first, then fall back to name
      let matchingTx: { id: string }[] | null = null;
      if (bill) {
        const { data } = await supabase
          .from("transactions").select("id")
          .eq("household_id", profile.household_id).eq("type", "expense").eq("date", dateStr)
          .like("description", `%[${bill.id}]%`).limit(1);
        matchingTx = data;
      }
      if ((!matchingTx || matchingTx.length === 0) && bill) {
        const { data } = await supabase
          .from("transactions").select("id")
          .eq("household_id", profile.household_id).eq("type", "expense").eq("date", dateStr)
          .like("description", `Bill: ${bill.name}%`).limit(1);
        matchingTx = data;
      }

      if (matchingTx && matchingTx.length > 0) {
        await supabase.from("transactions").delete().eq("id", matchingTx[0].id);
      }

      if (bill) {
        await supabase.from("bills").update({ next_due_date: dateStr }).eq("id", bill.id);
      }

      setPaidKeys((prev) => { const next = new Set(prev); next.delete(`${undoEvent.billId}|${dateStr}`); return next; });
      setUndoModalOpen(false);
      setUndoEvent(null);
      load();
    } catch (err) {
      console.error("Undo error:", err);
    } finally {
      setUndoing(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-muted">Loading...</div></div>;
  }

  const totalBills = activeBills.reduce((sum, b) => sum + Number(b.amount), 0);
  // Split expenses: bill payments vs other spending
  const billExpenses = allMonthTransactions
    .filter((t) => t.type === "expense" && (t.description?.startsWith("Bill:") || t.description?.startsWith("Skipped:")))
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const otherSpending = monthlyExpenses - billExpenses;
  const netIncome = monthlyIncome - monthlyExpenses;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Welcome back{profile?.display_name ? `, ${profile.display_name}` : ""}
          </h1>
          <p className="text-sm text-muted mt-0.5">Here&apos;s your financial overview</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-hover text-sm font-medium transition-colors"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard title="Income" amount={monthlyIncome} icon={<TrendingUp className="text-emerald-400" size={20} />} color="text-emerald-500 dark:text-emerald-400" bg="bg-emerald-50/80 dark:bg-emerald-500/10" />
        <SummaryCard title="Bills Paid" amount={billExpenses} icon={<Receipt className="text-amber-400" size={20} />} color="text-amber-500 dark:text-amber-400" bg="bg-amber-50/80 dark:bg-amber-500/10" />
        <SummaryCard title="Other Spending" amount={otherSpending} icon={<TrendingDown className="text-rose-400" size={20} />} color="text-rose-400" bg="bg-rose-50/80 dark:bg-rose-500/10" />
        <SummaryCard title="Total Expenses" amount={monthlyExpenses} icon={<TrendingDown className="text-muted" size={20} />} color="text-foreground" bg="bg-accent" />
      </div>

      {/* Net Income Banner */}
      <div className={`px-4 py-3 rounded-2xl border ${netIncome >= 0 ? "bg-emerald-50/50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20" : "bg-rose-50/50 dark:bg-rose-500/10 border-rose-100 dark:border-rose-500/20"}`}>
        <div className="flex items-center gap-2">
          {netIncome < 0 && <AlertTriangle className="text-rose-400" size={18} />}
          <span className="text-sm font-medium text-muted">
            Net this month: <span className={`font-semibold ${netIncome >= 0 ? "text-emerald-500 dark:text-emerald-400" : "text-rose-400"}`}>{formatCurrency(netIncome)}</span>
          </span>
        </div>
      </div>

      {/* Upcoming Bills — interactive with pay/undo */}
      <div className="bg-card-alpha backdrop-blur-sm rounded-2xl border border-border shadow-[var(--shadow)] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-4">Upcoming Bills</h2>
        {upcomingEvents.length === 0 ? (
          <p className="text-muted text-sm">No bills due in the next 10 days</p>
        ) : (
          <div className="space-y-2">
            {upcomingEvents.map((evt, i) => {
              const paid = isEventPaid(evt.billId, evt.date);
              const overdue = isEventOverdue(evt.billId, evt.date);
              return (
                <div
                  key={`${evt.billId}-${i}`}
                  className={`flex items-center justify-between rounded-lg p-3 ${
                    paid ? "bg-emerald-50 dark:bg-emerald-500/10" : overdue ? "bg-rose-50 dark:bg-rose-500/10" : "bg-accent"
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-medium ${paid ? "line-through text-muted" : ""}`}>{evt.name}</span>
                      <span className="text-xs text-muted">{format(evt.date, "EEE, MMM d")}</span>
                      {evt.is_autopay && (
                        <span className="text-xs bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full">Autopay</span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5">{getMemberName(evt.paid_by)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`font-semibold ${paid ? "line-through text-muted" : ""}`}>
                      {formatCurrency(evt.amount)}
                    </span>
                    {paid ? (
                      <button
                        onClick={() => openUndo(evt)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-lg text-sm font-medium hover:bg-emerald-200 dark:hover:bg-emerald-500/30 transition-colors"
                        title="Click to undo payment"
                      >
                        <Check size={14} /> Paid
                      </button>
                    ) : overdue ? (
                      <button
                        onClick={() => openPay(evt)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-danger text-white rounded-lg hover:opacity-90 text-sm font-medium"
                      >
                        <Check size={14} /> Pay
                      </button>
                    ) : (
                      <button
                        onClick={() => openPay(evt)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-hover text-sm font-medium"
                      >
                        <Check size={14} /> Pay
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Transactions */}
      <div className="bg-card-alpha backdrop-blur-sm rounded-2xl border border-border shadow-[var(--shadow)] p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-4">Recent Transactions</h2>
        {recentTransactions.length === 0 ? (
          <p className="text-muted text-sm">No transactions yet</p>
        ) : (
          <div className="space-y-3">
            {recentTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {tx.category?.icon} {tx.description || tx.category?.name || "Transaction"}
                  </p>
                  <p className="text-sm text-muted">{tx.date}</p>
                </div>
                <span className={`font-semibold ${tx.type === "income" ? "text-emerald-500 dark:text-emerald-400" : "text-rose-400"}`}>
                  {tx.type === "income" ? "+" : "-"}{formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pay Modal */}
      <Modal
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        title={paySuccess ? (paySuccess.startsWith("Error") ? "Payment Failed" : "Payment Recorded") : `Pay: ${payingBill?.name || ""}`}
      >
        {paySuccess ? (
          <div className="space-y-4">
            <div className={`${paySuccess.startsWith("Error") ? "bg-rose-50 dark:bg-rose-500/10 text-danger" : "bg-emerald-50 dark:bg-emerald-500/10 text-success"} p-4 rounded-lg text-center`}>
              <Check size={32} className="mx-auto mb-2" />
              <p className="font-medium">{paySuccess}</p>
            </div>
            <button onClick={() => setPayModalOpen(false)} className="w-full py-2 px-4 bg-primary text-white rounded-lg hover:bg-primary-hover font-medium">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handlePay} className="space-y-4">
            <div className="bg-accent rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Bill</span>
                <span className="font-medium">{payingBill?.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Due Date</span>
                <span>{payingDate ? format(payingDate, "MMM d, yyyy") : "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Paid By</span>
                <span>{getMemberName(payingBill?.paid_by || null)}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Amount Paid</label>
              <input
                type="number"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-lg font-semibold"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Notes <span className="text-muted font-normal">(optional)</span></label>
              <input type="text" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="e.g. Paid extra this month" className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>

            <button type="submit" disabled={paying} className="w-full py-2 px-4 bg-success text-white rounded-lg hover:opacity-90 font-medium disabled:opacity-50">
              {paying ? "Recording..." : `Mark Paid — ${formatCurrency(parseFloat(payAmount || "0"))}`}
            </button>
          </form>
        )}
      </Modal>

      {/* Undo Payment Modal */}
      <Modal
        open={undoModalOpen}
        onClose={() => { setUndoModalOpen(false); setUndoEvent(null); }}
        title="Undo Payment"
      >
        <div className="space-y-4">
          <p className="text-sm">
            Are you sure you want to undo the payment for <strong>{undoEvent ? bills.find((b) => b.id === undoEvent.billId)?.name : ""}</strong> on{" "}
            <strong>{undoEvent ? format(undoEvent.date, "MMM d, yyyy") : ""}</strong>?
          </p>
          <p className="text-sm text-muted">This will delete the expense transaction and reset the bill&apos;s due date.</p>
          <div className="flex gap-3">
            <button onClick={() => { setUndoModalOpen(false); setUndoEvent(null); }} className="flex-1 py-2 px-4 border border-border rounded-lg hover:bg-accent font-medium">
              Cancel
            </button>
            <button onClick={handleUndo} disabled={undoing} className="flex-1 py-2 px-4 bg-danger text-white rounded-lg hover:opacity-90 font-medium disabled:opacity-50">
              {undoing ? "Undoing..." : "Undo Payment"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SummaryCard({ title, amount, icon, color, bg }: { title: string; amount: number; icon: React.ReactNode; color: string; bg: string }) {
  return (
    <div className="bg-card-alpha backdrop-blur-sm rounded-2xl border border-border shadow-[var(--shadow)] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-medium text-muted uppercase tracking-wider">{title}</span>
        <div className={`p-2 rounded-xl ${bg}`}>{icon}</div>
      </div>
      <p className={`text-2xl font-semibold tracking-tight ${color}`}>{formatCurrency(amount)}</p>
    </div>
  );
}
