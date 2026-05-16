"use client";

import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import type { Bill, Debt, Profile, HouseholdMember } from "@/lib/types";
import { getUpcomingPaydays, getNextDueDate, getBillEvents, advanceBillDate } from "@/lib/payday";
import type { ScheduleType } from "@/lib/payday";
import Modal from "@/components/Modal";
import { Check, ChevronLeft, ChevronRight, List, Calendar as CalendarIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  isToday,
  addDays,
  isBefore,
  startOfDay,
} from "date-fns";

interface BillEvent {
  date: Date;
  billId: string;
  name: string;
  amount: number;
  is_autopay: boolean;
  paid_by: string;
}

export default function CalendarPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [calMonth, setCalMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<"calendar" | "upcoming">("calendar");

  // Paid tracking: set of "billId|YYYY-MM-DD" keys
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

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    if (!prof?.household_id) return;
    setProfile(prof);

    const [billsRes, membersRes, debtsRes, txRes] = await Promise.all([
      supabase
        .from("bills")
        .select("*")
        .eq("household_id", prof.household_id)
        .eq("is_active", true)
        .order("due_day"),
      supabase
        .from("household_members")
        .select("*")
        .eq("household_id", prof.household_id)
        .eq("is_active", true)
        .order("created_at"),
      supabase
        .from("debts")
        .select("*")
        .eq("household_id", prof.household_id)
        .eq("is_active", true)
        .order("name"),
      // Fetch bill payment transactions to track paid status
      supabase
        .from("transactions")
        .select("description, date")
        .eq("household_id", prof.household_id)
        .eq("type", "expense")
        .like("description", "Bill:%"),
    ]);

    setBills(billsRes.data || []);
    setMembers(membersRes.data || []);
    setDebts(debtsRes.data || []);

    // Build paid keys from existing transactions
    // Transaction description format: "Bill: {bill_name}" or "Bill: {bill_name} — notes"
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

  // Build paydays per member
  const memberPaydays = new Map<string, Date[]>();
  for (const m of members) {
    if (m.next_pay_date && m.pay_frequency) {
      memberPaydays.set(
        m.id,
        getUpcomingPaydays(m.next_pay_date, m.pay_frequency, 26)
      );
    }
  }

  const fallbackPaydays = profile?.next_pay_date
    ? getUpcomingPaydays(
        profile.next_pay_date,
        profile.pay_frequency || "biweekly",
        26
      )
    : [];

  function getPaydaysForBill(bill: Bill): Date[] {
    if (bill.paid_by && memberPaydays.has(bill.paid_by)) {
      return memberPaydays.get(bill.paid_by)!;
    }
    return fallbackPaydays;
  }

  // All paydays merged for calendar badges
  const allPaydays = Array.from(
    new Set(
      [
        ...fallbackPaydays,
        ...Array.from(memberPaydays.values()).flat(),
      ].map((d) => d.getTime())
    )
  )
    .map((t) => new Date(t))
    .sort((a, b) => a.getTime() - b.getTime());

  // All calendar events
  const calEvents: BillEvent[] = bills
    .flatMap((bill) => {
      const pd = getPaydaysForBill(bill);
      return getBillEvents(
        [{ ...bill, paid_by: bill.paid_by || "shared" }],
        pd,
        120
      );
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Undo a payment: delete the matching transaction, revert bill next_due_date
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

      // Find and delete the matching transaction
      const { data: matchingTx } = await supabase
        .from("transactions")
        .select("id")
        .eq("household_id", profile.household_id)
        .eq("type", "expense")
        .eq("date", dateStr)
        .like("description", `Bill: ${bill?.name || ""}%`)
        .limit(1);

      if (matchingTx && matchingTx.length > 0) {
        const { error: delError } = await supabase
          .from("transactions")
          .delete()
          .eq("id", matchingTx[0].id);

        if (delError) {
          console.error("Failed to delete transaction:", delError);
        }
      }

      // Revert bill's next_due_date back to the event date
      if (bill) {
        await supabase
          .from("bills")
          .update({ next_due_date: dateStr })
          .eq("id", bill.id);
      }

      // Remove from local paid set
      setPaidKeys((prev) => {
        const next = new Set(prev);
        next.delete(`${undoEvent.billId}|${dateStr}`);
        return next;
      });

      setUndoModalOpen(false);
      setUndoEvent(null);
      load();
    } catch (err) {
      console.error("Undo error:", err);
    } finally {
      setUndoing(false);
    }
  }

  // Check if a bill event is paid
  function isEventPaid(billId: string, date: Date): boolean {
    return paidKeys.has(`${billId}|${format(date, "yyyy-MM-dd")}`);
  }

  // Check if an event is overdue (unpaid and date is before today)
  function isEventOverdue(billId: string, date: Date): boolean {
    const today = startOfDay(new Date());
    return !isEventPaid(billId, date) && isBefore(date, today);
  }

  function getMemberName(memberId: string | null): string {
    if (!memberId || memberId === "shared") return "Shared";
    const member = members.find((m) => m.id === memberId);
    return member?.name || "Unknown";
  }

  function getMemberColor(memberId: string | null): string {
    if (!memberId || memberId === "shared") return "bg-gray-100 text-gray-700";
    const idx = members.findIndex((m) => m.id === memberId);
    const colors = [
      "bg-blue-50 text-blue-700",
      "bg-purple-50 text-purple-700",
      "bg-orange-50 text-orange-700",
      "bg-teal-50 text-teal-700",
    ];
    return colors[idx % colors.length];
  }

  // Open pay modal
  function openPay(event: BillEvent) {
    const bill = bills.find((b) => b.id === event.billId);
    if (!bill) return;

    const linkedDebt = bill.debt_id
      ? debts.find((d) => d.id === bill.debt_id)
      : null;
    const suggestedBalance = linkedDebt
      ? Math.max(0, linkedDebt.current_balance - bill.amount)
      : null;

    setPayingBill(bill);
    setPayingDate(event.date);
    setPayAmount(String(bill.amount));
    setPayNewDebtBalance(
      suggestedBalance !== null ? suggestedBalance.toFixed(2) : ""
    );
    setPayNotes("");
    setPaySuccess("");
    setPayModalOpen(true);
  }

  // Handle mark as paid
  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!payingBill || !profile?.household_id) return;
    setPaying(true);
    setPaySuccess("");

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setPaySuccess("Error: Not logged in");
        setPaying(false);
        return;
      }

      const amount = parseFloat(payAmount);
      const payDate = payingDate
        ? format(payingDate, "yyyy-MM-dd")
        : format(new Date(), "yyyy-MM-dd");

      // 1. Create expense transaction
      const { error: txError } = await supabase.from("transactions").insert({
        household_id: profile.household_id,
        user_id: user.id,
        amount,
        type: "expense",
        description: `Bill: ${payingBill.name}${payNotes ? ` — ${payNotes}` : ""}`,
        date: payDate,
      });

      if (txError) {
        setPaySuccess(`Error recording transaction: ${txError.message}`);
        setPaying(false);
        return;
      }

      // 2. Advance bill's next_due_date
      const pd = getPaydaysForBill(payingBill);
      const nextDue = getNextDueDate(payingBill, pd);
      if (nextDue) {
        let advancedDate: string | null = null;

        if (
          payingBill.schedule_type === "every_payday" ||
          payingBill.schedule_type === "every_other_payday"
        ) {
          // For payday-linked bills, find the next payday after this one
          const step =
            payingBill.schedule_type === "every_other_payday" ? 2 : 1;
          const futurePd = pd.filter(
            (d) => d.getTime() > nextDue.getTime()
          );
          if (futurePd.length >= step) {
            advancedDate = format(futurePd[step - 1], "yyyy-MM-dd");
          }
        } else {
          // All fixed-interval types: use advanceBillDate
          const next = advanceBillDate(
            nextDue,
            payingBill.schedule_type,
            payingBill.custom_interval_days
          );
          advancedDate = format(next, "yyyy-MM-dd");
        }

        if (advancedDate) {
          const { error: billError } = await supabase
            .from("bills")
            .update({ next_due_date: advancedDate })
            .eq("id", payingBill.id);

          if (billError) {
            console.error("Failed to advance bill date:", billError);
          }
        }
      }

      // 3. Update linked debt balance if applicable
      if (payingBill.debt_id && payNewDebtBalance !== "") {
        const newBalance = parseFloat(payNewDebtBalance);
        const { error: debtError } = await supabase
          .from("debts")
          .update({ current_balance: newBalance })
          .eq("id", payingBill.debt_id);

        if (debtError) {
          console.error("Failed to update debt balance:", debtError);
        }
      }

      // Mark as paid locally for immediate UI update
      setPaidKeys((prev) => {
        const next = new Set(prev);
        next.add(`${payingBill.id}|${payDate}`);
        return next;
      });

      setPaying(false);
      setPaySuccess(
        `Paid ${formatCurrency(amount)} for ${payingBill.name}${payingBill.debt_id ? ` — debt updated to ${formatCurrency(parseFloat(payNewDebtBalance))}` : ""}`
      );

      // Reload data
      load();
    } catch (err) {
      console.error("Payment error:", err);
      setPaying(false);
      setPaySuccess(`Error: ${err instanceof Error ? err.message : "Something went wrong"}`);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  // Upcoming events list (next 30 days)
  const today = startOfDay(new Date());
  const upcomingEvents = calEvents.filter(
    (e) => e.date >= today && e.date <= addDays(today, 30)
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-muted">
            All bills and paydays in one place. Click a bill to mark it paid.
          </p>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode("calendar")}
            className={`p-2 rounded-md ${viewMode === "calendar" ? "bg-white shadow-sm" : ""}`}
          >
            <CalendarIcon size={18} />
          </button>
          <button
            onClick={() => setViewMode("upcoming")}
            className={`p-2 rounded-md ${viewMode === "upcoming" ? "bg-white shadow-sm" : ""}`}
          >
            <List size={18} />
          </button>
        </div>
      </div>

      {viewMode === "calendar" ? (
        <CalendarGrid
          calMonth={calMonth}
          setCalMonth={setCalMonth}
          calEvents={calEvents}
          paydays={allPaydays}
          getMemberName={getMemberName}
          getMemberColor={getMemberColor}
          onPayClick={openPay}
          onUndoClick={openUndo}
          bills={bills}
          debts={debts}
          isEventPaid={isEventPaid}
          isEventOverdue={isEventOverdue}
        />
      ) : (
        <UpcomingList
          events={upcomingEvents}
          getMemberName={getMemberName}
          getMemberColor={getMemberColor}
          onPayClick={openPay}
          onUndoClick={openUndo}
          bills={bills}
          debts={debts}
          isEventPaid={isEventPaid}
          isEventOverdue={isEventOverdue}
        />
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
            <button
              onClick={() => setPayModalOpen(false)}
              className="w-full py-2 px-4 bg-primary text-white rounded-lg hover:bg-primary-hover font-medium"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handlePay} className="space-y-4">
            {/* Bill info */}
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
              {payingBill?.is_autopay && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Autopay</span>
                  <span className="text-success font-medium">Enabled</span>
                </div>
              )}
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Amount Paid
              </label>
              <input
                type="number"
                step="0.01"
                value={payAmount}
                onChange={(e) => {
                  setPayAmount(e.target.value);
                  // Auto-recalculate suggested debt balance
                  if (payingBill?.debt_id) {
                    const debt = debts.find(
                      (d) => d.id === payingBill.debt_id
                    );
                    if (debt) {
                      const newBal = Math.max(
                        0,
                        debt.current_balance - parseFloat(e.target.value || "0")
                      );
                      setPayNewDebtBalance(newBal.toFixed(2));
                    }
                  }
                }}
                required
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-lg font-semibold"
              />
              {payAmount !== String(payingBill?.amount) && payingBill && (
                <p className="text-xs text-muted mt-1">
                  Usual amount: {formatCurrency(payingBill.amount)}
                  {parseFloat(payAmount) > payingBill.amount && (
                    <span className="text-success ml-1">
                      (+{formatCurrency(parseFloat(payAmount) - payingBill.amount)} extra)
                    </span>
                  )}
                </p>
              )}
            </div>

            {/* Debt section */}
            {payingBill?.debt_id && (() => {
              const linkedDebt = debts.find(
                (d) => d.id === payingBill.debt_id
              );
              if (!linkedDebt) return null;
              return (
                <div className="bg-red-50 rounded-lg p-3 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-danger">
                      Linked Debt: {linkedDebt.name}
                    </span>
                    <span className="text-danger font-semibold">
                      {formatCurrency(linkedDebt.current_balance)}
                    </span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      New Balance After Payment
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={payNewDebtBalance}
                      onChange={(e) =>
                        setPayNewDebtBalance(e.target.value)
                      }
                      className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <p className="text-xs text-muted mt-1">
                      Suggested: {formatCurrency(Math.max(0, linkedDebt.current_balance - parseFloat(payAmount || "0")))}
                      . Edit if interest or late charges changed the balance.
                    </p>
                  </div>
                  {parseFloat(payNewDebtBalance) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Remaining after payment</span>
                      <span className="font-semibold text-danger">
                        {formatCurrency(parseFloat(payNewDebtBalance))}
                      </span>
                    </div>
                  )}
                  {parseFloat(payNewDebtBalance) === 0 && (
                    <p className="text-success font-medium text-sm text-center">
                      This payment will pay off this debt completely!
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Notes <span className="text-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                placeholder="e.g. Paid extra this month, included late fee"
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <button
              type="submit"
              disabled={paying}
              className="w-full py-2 px-4 bg-success text-white rounded-lg hover:opacity-90 font-medium disabled:opacity-50"
            >
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
          <p className="text-sm text-muted">
            This will delete the expense transaction and set the bill&apos;s next due date back to this date.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => { setUndoModalOpen(false); setUndoEvent(null); }}
              className="flex-1 py-2 px-4 border border-border rounded-lg hover:bg-gray-50 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleUndo}
              disabled={undoing}
              className="flex-1 py-2 px-4 bg-danger text-white rounded-lg hover:opacity-90 font-medium disabled:opacity-50"
            >
              {undoing ? "Undoing..." : "Undo Payment"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ==================== CALENDAR GRID ==================== */

function CalendarGrid({
  calMonth,
  setCalMonth,
  calEvents,
  paydays,
  getMemberName,
  getMemberColor,
  onPayClick,
  onUndoClick,
  bills,
  debts,
  isEventPaid,
  isEventOverdue,
}: {
  calMonth: Date;
  setCalMonth: (d: Date) => void;
  calEvents: BillEvent[];
  paydays: Date[];
  getMemberName: (id: string | null) => string;
  getMemberColor: (id: string | null) => string;
  onPayClick: (event: BillEvent) => void;
  onUndoClick: (event: BillEvent) => void;
  bills: Bill[];
  debts: Debt[];
  isEventPaid: (billId: string, date: Date) => boolean;
  isEventOverdue: (billId: string, date: Date) => boolean;
}) {
  const monthStart = startOfMonth(calMonth);
  const monthEnd = endOfMonth(calMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  const paddedDays: (Date | null)[] = [
    ...Array(startDayOfWeek).fill(null),
    ...days,
  ];

  // Day detail expansion
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  return (
    <>
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setCalMonth(subMonths(calMonth, 1))}
            className="p-2 border border-border rounded-lg hover:bg-gray-50"
          >
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-lg font-semibold">
            {format(calMonth, "MMMM yyyy")}
          </h2>
          <button
            onClick={() => setCalMonth(addMonths(calMonth, 1))}
            className="p-2 border border-border rounded-lg hover:bg-gray-50"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 mb-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div
              key={d}
              className="text-center text-xs font-medium text-muted py-1"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-border">
          {paddedDays.map((day, i) => {
            if (!day) {
              return <div key={`empty-${i}`} className="bg-gray-50 min-h-[80px]" />;
            }

            const dayEvents = calEvents.filter((e) => isSameDay(e.date, day));
            const isPayday = paydays.some((pd) => isSameDay(pd, day));
            const todayFlag = isToday(day);
            const isSelected = selectedDay && isSameDay(day, selectedDay);
            const dayTotal = dayEvents.reduce(
              (sum, e) => sum + e.amount,
              0
            );

            return (
              <div
                key={day.toISOString()}
                onClick={() =>
                  dayEvents.length > 0
                    ? setSelectedDay(isSelected ? null : day)
                    : null
                }
                className={`bg-white min-h-[80px] p-1 ${todayFlag ? "ring-2 ring-primary ring-inset" : ""} ${isSelected ? "ring-2 ring-blue-400 ring-inset" : ""} ${dayEvents.length > 0 ? "cursor-pointer hover:bg-blue-50/50" : ""}`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span
                    className={`text-xs font-medium ${
                      todayFlag
                        ? "text-primary"
                        : !isSameMonth(day, calMonth)
                        ? "text-gray-300"
                        : "text-foreground"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                  {isPayday && (
                    <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded font-medium">
                      PAY
                    </span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map((evt, j) => {
                    const paid = isEventPaid(evt.billId, evt.date);
                    const overdue = isEventOverdue(evt.billId, evt.date);
                    return (
                      <div
                        key={`${evt.billId}-${j}`}
                        className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate ${
                          paid
                            ? "bg-green-100 text-green-700 line-through opacity-70"
                            : overdue
                            ? "bg-red-100 text-red-700 font-medium"
                            : evt.is_autopay
                            ? "bg-green-50 text-green-700"
                            : getMemberColor(evt.paid_by)
                        }`}
                        title={`${evt.name}: ${formatCurrency(evt.amount)} (${getMemberName(evt.paid_by)})${paid ? " ✓ Paid" : overdue ? " ⚠ Overdue" : ""}`}
                      >
                        {paid ? "✓ " : overdue ? "! " : ""}
                        {evt.name.length > (paid || overdue ? 10 : 12)
                          ? evt.name.slice(0, paid || overdue ? 10 : 12) + "…"
                          : evt.name}
                      </div>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <div className="text-[10px] text-muted">
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
                {dayTotal > 0 && dayEvents.length > 1 && (
                  <div className="text-[9px] text-muted mt-0.5 text-right">
                    {formatCurrency(dayTotal)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex gap-4 mt-3 text-xs text-muted flex-wrap">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-100 border border-green-300 rounded" />{" "}
            Paid
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-100 border border-red-300 rounded" />{" "}
            Overdue
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-50 border border-blue-200 rounded" />{" "}
            Upcoming
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-50 border border-green-200 rounded" />{" "}
            Autopay
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded">
              PAY
            </span>{" "}
            Payday
          </div>
        </div>
      </div>

      {/* Day Detail Panel */}
      {selectedDay && (
        <DayDetail
          day={selectedDay}
          events={calEvents.filter((e) => isSameDay(e.date, selectedDay))}
          getMemberName={getMemberName}
          getMemberColor={getMemberColor}
          onPayClick={onPayClick}
          onUndoClick={onUndoClick}
          bills={bills}
          debts={debts}
          isEventPaid={isEventPaid}
          isEventOverdue={isEventOverdue}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </>
  );
}

/* ==================== DAY DETAIL ==================== */

function DayDetail({
  day,
  events,
  getMemberName,
  getMemberColor,
  onPayClick,
  onUndoClick,
  bills,
  debts,
  isEventPaid,
  isEventOverdue,
  onClose,
}: {
  day: Date;
  events: BillEvent[];
  getMemberName: (id: string | null) => string;
  getMemberColor: (id: string | null) => string;
  onPayClick: (event: BillEvent) => void;
  onUndoClick: (event: BillEvent) => void;
  bills: Bill[];
  debts: Debt[];
  isEventPaid: (billId: string, date: Date) => boolean;
  isEventOverdue: (billId: string, date: Date) => boolean;
  onClose: () => void;
}) {
  const total = events.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">
          {format(day, "EEEE, MMMM d, yyyy")}
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted">
            Total: {formatCurrency(total)}
          </span>
          <button
            onClick={onClose}
            className="text-sm text-muted hover:text-foreground"
          >
            Close
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {events.map((evt, i) => {
          const bill = bills.find((b) => b.id === evt.billId);
          const linkedDebt = bill?.debt_id
            ? debts.find((d) => d.id === bill.debt_id)
            : null;
          const paid = isEventPaid(evt.billId, evt.date);
          const overdue = isEventOverdue(evt.billId, evt.date);

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
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${getMemberColor(evt.paid_by)}`}
                  >
                    {getMemberName(evt.paid_by)}
                  </span>
                  {evt.is_autopay && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      Autopay
                    </span>
                  )}
                  {linkedDebt && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                      Debt: {formatCurrency(linkedDebt.current_balance)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`font-semibold ${paid ? "line-through text-muted" : ""}`}>
                  {formatCurrency(evt.amount)}
                </span>
                {paid ? (
                  <button
                    onClick={() => onUndoClick(evt)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors"
                    title="Click to undo payment"
                  >
                    <Check size={14} /> Paid
                  </button>
                ) : overdue ? (
                  <button
                    onClick={() => onPayClick(evt)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-danger text-white rounded-lg hover:opacity-90 text-sm font-medium"
                  >
                    <Check size={14} /> Pay
                  </button>
                ) : (
                  <button
                    onClick={() => onPayClick(evt)}
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
    </div>
  );
}

/* ==================== UPCOMING LIST ==================== */

function UpcomingList({
  events,
  getMemberName,
  getMemberColor,
  onPayClick,
  onUndoClick,
  bills,
  debts,
  isEventPaid,
  isEventOverdue,
}: {
  events: BillEvent[];
  getMemberName: (id: string | null) => string;
  getMemberColor: (id: string | null) => string;
  onPayClick: (event: BillEvent) => void;
  onUndoClick: (event: BillEvent) => void;
  bills: Bill[];
  debts: Debt[];
  isEventPaid: (billId: string, date: Date) => boolean;
  isEventOverdue: (billId: string, date: Date) => boolean;
}) {
  // Group by date
  const grouped = new Map<string, BillEvent[]>();
  for (const evt of events) {
    const key = format(evt.date, "yyyy-MM-dd");
    const existing = grouped.get(key) || [];
    existing.push(evt);
    grouped.set(key, existing);
  }

  const totalUpcoming = events.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted">Next 30 days</span>
          <span className="font-semibold">
            Total: {formatCurrency(totalUpcoming)}
          </span>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-8 text-center text-muted">
          No upcoming bills in the next 30 days
        </div>
      ) : (
        Array.from(grouped.entries()).map(([dateKey, dayEvents]) => {
          const date = new Date(dateKey + "T00:00:00");
          const dayTotal = dayEvents.reduce((sum, e) => sum + e.amount, 0);
          const todayFlag = isToday(date);

          return (
            <div key={dateKey} className="bg-card rounded-xl border border-border overflow-hidden">
              <div
                className={`flex justify-between items-center px-4 py-2 border-b border-border ${todayFlag ? "bg-primary/5" : "bg-gray-50"}`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {format(date, "EEE, MMM d")}
                  </span>
                  {todayFlag && (
                    <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-full">
                      Today
                    </span>
                  )}
                </div>
                <span className="text-sm font-medium">
                  {formatCurrency(dayTotal)}
                </span>
              </div>
              <div className="divide-y divide-border">
                {dayEvents.map((evt, i) => {
                  const bill = bills.find((b) => b.id === evt.billId);
                  const linkedDebt = bill?.debt_id
                    ? debts.find((d) => d.id === bill.debt_id)
                    : null;
                  const paid = isEventPaid(evt.billId, evt.date);
                  const overdue = isEventOverdue(evt.billId, evt.date);

                  return (
                    <div
                      key={`${evt.billId}-${i}`}
                      className={`flex items-center justify-between p-4 ${paid ? "bg-green-50/50" : overdue ? "bg-red-50/50" : ""}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-medium ${paid ? "line-through text-muted" : ""}`}>{evt.name}</span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${getMemberColor(evt.paid_by)}`}
                          >
                            {getMemberName(evt.paid_by)}
                          </span>
                          {evt.is_autopay && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                              Autopay
                            </span>
                          )}
                          {linkedDebt && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                              Balance: {formatCurrency(linkedDebt.current_balance)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`font-semibold ${paid ? "line-through text-muted" : ""}`}>
                          {formatCurrency(evt.amount)}
                        </span>
                        {paid ? (
                          <button
                            onClick={() => onUndoClick(evt)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors"
                            title="Click to undo payment"
                          >
                            <Check size={14} /> Paid
                          </button>
                        ) : overdue ? (
                          <button
                            onClick={() => onPayClick(evt)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-danger text-white rounded-lg hover:opacity-90 text-sm font-medium"
                          >
                            <Check size={14} /> Pay
                          </button>
                        ) : (
                          <button
                            onClick={() => onPayClick(evt)}
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
            </div>
          );
        })
      )}
    </div>
  );
}
