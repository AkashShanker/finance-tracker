"use client";

import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import { getTodayString } from "@/lib/timezone";
import { getUpcomingPaydays, getNextDueDate, getBillEvents, advanceBillDate } from "@/lib/payday";
import type { Profile, Bill, Debt, Transaction, HouseholdMember } from "@/lib/types";
import Modal from "@/components/Modal";
import {
  TrendingUp,
  TrendingDown,
  CreditCard,
  Receipt,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
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
  const [debts, setDebts] = useState<Debt[]>([]);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [monthlyExpenses, setMonthlyExpenses] = useState(0);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [debtExpanded, setDebtExpanded] = useState(false);

  // Paid tracking
  const [paidKeys, setPaidKeys] = useState<Set<string>>(new Set());

  // Pay modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payingBill, setPayingBill] = useState<Bill | null>(null);
  const [payingDate, setPayingDate] = useState<Date | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payNewDebtBalance, setPayNewDebtBalance] = useState("");
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

    const [incomeRes, expenseRes, billsRes, debtsRes, recentRes, membersRes, txRes] =
      await Promise.all([
        supabase.from("transactions").select("amount").eq("household_id", prof.household_id).eq("type", "income").gte("date", monthStart),
        supabase.from("transactions").select("amount").eq("household_id", prof.household_id).eq("type", "expense").gte("date", monthStart),
        supabase.from("bills").select("*").eq("household_id", prof.household_id).eq("is_active", true).order("due_day"),
        supabase.from("debts").select("*").eq("household_id", prof.household_id).eq("is_active", true).order("current_balance", { ascending: false }),
        supabase.from("transactions").select("*, category:categories(*)").eq("household_id", prof.household_id).order("date", { ascending: false }).limit(5),
        supabase.from("household_members").select("*").eq("household_id", prof.household_id).eq("is_active", true).order("created_at"),
        supabase.from("transactions").select("description, date").eq("household_id", prof.household_id).eq("type", "expense").like("description", "Bill:%"),
      ]);

    setMonthlyIncome((incomeRes.data || []).reduce((sum, t) => sum + Number(t.amount), 0));
    setMonthlyExpenses((expenseRes.data || []).reduce((sum, t) => sum + Number(t.amount), 0));
    setBills(billsRes.data || []);
    setDebts(debtsRes.data || []);
    setRecentTransactions(recentRes.data || []);
    setMembers(membersRes.data || []);

    // Build paid keys
    const fetchedBills = billsRes.data || [];
    const keys = new Set<string>();
    for (const tx of txRes.data || []) {
      const billName = tx.description?.replace(/^Bill:\s*/, "").split(" — ")[0];
      const matchedBill = fetchedBills.find((b: Bill) => b.name === billName);
      if (matchedBill && tx.date) {
        keys.add(`${matchedBill.id}|${tx.date}`);
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

  // Pay modal
  function openPay(event: BillEvent) {
    const bill = bills.find((b) => b.id === event.billId);
    if (!bill) return;

    const linkedDebt = bill.debt_id ? debts.find((d) => d.id === bill.debt_id) : null;
    const suggestedBalance = linkedDebt ? Math.max(0, linkedDebt.current_balance - bill.amount) : null;

    setPayingBill(bill);
    setPayingDate(event.date);
    setPayAmount(String(bill.amount));
    setPayNewDebtBalance(suggestedBalance !== null ? suggestedBalance.toFixed(2) : "");
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
        description: `Bill: ${payingBill.name}${payNotes ? ` — ${payNotes}` : ""}`,
        date: payDate,
      });

      if (txError) { setPaySuccess(`Error: ${txError.message}`); setPaying(false); return; }

      // Advance bill date
      const pd = getPaydaysForBill(payingBill);
      const nextDue = getNextDueDate(payingBill, pd);
      if (nextDue) {
        let advancedDate: string | null = null;
        if (payingBill.schedule_type === "every_payday" || payingBill.schedule_type === "every_other_payday") {
          const step = payingBill.schedule_type === "every_other_payday" ? 2 : 1;
          const futurePd = pd.filter((d) => d.getTime() > nextDue.getTime());
          if (futurePd.length >= step) advancedDate = format(futurePd[step - 1], "yyyy-MM-dd");
        } else {
          advancedDate = format(advanceBillDate(nextDue, payingBill.schedule_type, payingBill.custom_interval_days), "yyyy-MM-dd");
        }
        if (advancedDate) {
          await supabase.from("bills").update({ next_due_date: advancedDate }).eq("id", payingBill.id);
        }
      }

      // Update linked debt
      if (payingBill.debt_id && payNewDebtBalance !== "") {
        await supabase.from("debts").update({ current_balance: parseFloat(payNewDebtBalance) }).eq("id", payingBill.debt_id);
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

      const { data: matchingTx } = await supabase
        .from("transactions").select("id")
        .eq("household_id", profile.household_id).eq("type", "expense").eq("date", dateStr)
        .like("description", `Bill: ${bill?.name || ""}%`).limit(1);

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

  const totalDebt = debts.reduce((sum, d) => sum + Number(d.current_balance), 0);
  const totalBills = activeBills.reduce((sum, b) => sum + Number(b.amount), 0);
  const netIncome = monthlyIncome - monthlyExpenses;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Welcome back{profile?.display_name ? `, ${profile.display_name}` : ""}
        </h1>
        <p className="text-sm text-muted mt-0.5">Here&apos;s your financial overview</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="Monthly Income" amount={monthlyIncome} icon={<TrendingUp className="text-emerald-400" size={20} />} color="text-emerald-500" bg="bg-emerald-50/80" />
        <SummaryCard title="Monthly Expenses" amount={monthlyExpenses} icon={<TrendingDown className="text-rose-400" size={20} />} color="text-rose-400" bg="bg-rose-50/80" />
        <SummaryCard title="Monthly Bills" amount={totalBills} icon={<Receipt className="text-amber-400" size={20} />} color="text-amber-500" bg="bg-amber-50/80" />
        <SummaryCard title="Total Debt" amount={totalDebt} icon={<CreditCard className="text-violet-400" size={20} />} color="text-violet-500" bg="bg-violet-50/80" />
      </div>

      {/* Net Income Banner */}
      <div className={`px-4 py-3 rounded-2xl border ${netIncome >= 0 ? "bg-emerald-50/50 border-emerald-100" : "bg-rose-50/50 border-rose-100"}`}>
        <div className="flex items-center gap-2">
          {netIncome < 0 && <AlertTriangle className="text-rose-400" size={18} />}
          <span className="text-sm font-medium text-gray-500">
            Net this month: <span className={`font-semibold ${netIncome >= 0 ? "text-emerald-500" : "text-rose-400"}`}>{formatCurrency(netIncome)}</span>
          </span>
        </div>
      </div>

      {/* Upcoming Bills — interactive with pay/undo */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/40 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Upcoming Bills</h2>
        {upcomingEvents.length === 0 ? (
          <p className="text-muted text-sm">No bills due in the next 10 days</p>
        ) : (
          <div className="space-y-2">
            {upcomingEvents.map((evt, i) => {
              const paid = isEventPaid(evt.billId, evt.date);
              const overdue = isEventOverdue(evt.billId, evt.date);
              const bill = bills.find((b) => b.id === evt.billId);
              const linkedDebt = bill?.debt_id ? debts.find((d) => d.id === bill.debt_id) : null;

              return (
                <div
                  key={`${evt.billId}-${i}`}
                  className={`flex items-center justify-between rounded-lg p-3 ${
                    paid ? "bg-green-50" : overdue ? "bg-red-50" : "bg-gray-50"
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-medium ${paid ? "line-through text-muted" : ""}`}>{evt.name}</span>
                      <span className="text-xs text-muted">{format(evt.date, "EEE, MMM d")}</span>
                      {evt.is_autopay && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Autopay</span>
                      )}
                      {linkedDebt && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                          Debt: {formatCurrency(linkedDebt.current_balance)}
                        </span>
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
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors"
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
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/40 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Recent Transactions</h2>
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
                <span className={`font-semibold ${tx.type === "income" ? "text-emerald-500" : "text-rose-400"}`}>
                  {tx.type === "income" ? "+" : "-"}{formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Debt Overview — collapsible */}
      {debts.length > 0 && (
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/40 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <button
            onClick={() => setDebtExpanded(!debtExpanded)}
            className="w-full flex items-center justify-between p-5 text-left"
          >
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Debt Overview</h2>
              <span className="text-xs text-muted font-medium">{formatCurrency(totalDebt)} total</span>
            </div>
            {debtExpanded ? <ChevronUp size={20} className="text-muted" /> : <ChevronDown size={20} className="text-muted" />}
          </button>
          {debtExpanded && (
            <div className="px-5 pb-5 space-y-3">
              {debts.map((debt) => {
                const progress = debt.original_balance
                  ? ((debt.original_balance - debt.current_balance) / debt.original_balance) * 100
                  : 0;
                return (
                  <div key={debt.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{debt.name}</span>
                      <span className="font-semibold">{formatCurrency(debt.current_balance)}</span>
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
                      {debt.original_balance && <span>{progress.toFixed(0)}% paid off · Started at {formatCurrency(debt.original_balance)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Pay Modal */}
      <Modal
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        title={paySuccess ? (paySuccess.startsWith("Error") ? "Payment Failed" : "Payment Recorded") : `Pay: ${payingBill?.name || ""}`}
      >
        {paySuccess ? (
          <div className="space-y-4">
            <div className={`${paySuccess.startsWith("Error") ? "bg-red-50 text-danger" : "bg-green-50 text-success"} p-4 rounded-lg text-center`}>
              <Check size={32} className="mx-auto mb-2" />
              <p className="font-medium">{paySuccess}</p>
            </div>
            <button onClick={() => setPayModalOpen(false)} className="w-full py-2 px-4 bg-primary text-white rounded-lg hover:bg-primary-hover font-medium">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handlePay} className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 space-y-1">
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
                onChange={(e) => {
                  setPayAmount(e.target.value);
                  if (payingBill?.debt_id) {
                    const debt = debts.find((d) => d.id === payingBill.debt_id);
                    if (debt) setPayNewDebtBalance(Math.max(0, debt.current_balance - parseFloat(e.target.value || "0")).toFixed(2));
                  }
                }}
                required
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-lg font-semibold"
              />
            </div>

            {payingBill?.debt_id && (() => {
              const linkedDebt = debts.find((d) => d.id === payingBill.debt_id);
              if (!linkedDebt) return null;
              return (
                <div className="bg-red-50 rounded-lg p-3 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-danger">Linked Debt: {linkedDebt.name}</span>
                    <span className="text-danger font-semibold">{formatCurrency(linkedDebt.current_balance)}</span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">New Balance After Payment</label>
                    <input type="number" step="0.01" value={payNewDebtBalance} onChange={(e) => setPayNewDebtBalance(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
                    <p className="text-xs text-muted mt-1">Edit if interest or late charges changed the balance.</p>
                  </div>
                </div>
              );
            })()}

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
            <button onClick={() => { setUndoModalOpen(false); setUndoEvent(null); }} className="flex-1 py-2 px-4 border border-border rounded-lg hover:bg-gray-50 font-medium">
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
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/40 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">{title}</span>
        <div className={`p-2 rounded-xl ${bg}`}>{icon}</div>
      </div>
      <p className={`text-2xl font-semibold tracking-tight ${color}`}>{formatCurrency(amount)}</p>
    </div>
  );
}
