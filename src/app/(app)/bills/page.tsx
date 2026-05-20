"use client";

import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import type { Bill, Profile, HouseholdMember, Debt } from "@/lib/types";
import { getUpcomingPaydays, getNextDueDate, daysUntil, formatDueDate, getBillEvents, advanceBillDate, reverseBillDate } from "@/lib/payday";
import type { ScheduleType } from "@/lib/payday";
import Modal from "@/components/Modal";
import { Plus, Trash2, Pencil, ToggleLeft, ToggleRight, Calendar, List, ArrowRightLeft, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, isSameMonth, isToday, isBefore, startOfDay } from "date-fns";

type ViewMode = "calendar" | "list";

const EMPTY_FORM = {
  name: "",
  amount: "",
  due_day: "",
  next_due_date: "",
  frequency: "monthly" as Bill["frequency"],
  schedule_type: "monthly" as Bill["schedule_type"],
  custom_interval_days: "" as string,
  paid_by: "" as string,
  debt_id: "" as string,
  category: "other",
  is_autopay: false,
};

const SCHEDULE_LABELS: Record<string, string> = {
  monthly: "Monthly",
  biweekly: "Biweekly (every 2 weeks)",
  weekly: "Weekly",
  quarterly: "Quarterly (every 3 months)",
  yearly: "Yearly",
  every_payday: "Every payday",
  every_other_payday: "Every other payday",
  custom: "Custom interval",
};

interface BillEvent {
  date: Date;
  billId: string;
  name: string;
  amount: number;
  is_autopay: boolean;
  paid_by: string;
}

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [calMonth, setCalMonth] = useState(new Date());

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

  useEffect(() => { load(); }, []);

  async function load() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: prof } = await supabase
      .from("profiles").select("*").eq("id", user.id).single();
    if (!prof?.household_id) return;
    setProfile(prof);

    const [billsRes, membersRes, debtsRes, txRes] = await Promise.all([
      supabase.from("bills").select("*").eq("household_id", prof.household_id).order("due_day"),
      supabase.from("household_members").select("*").eq("household_id", prof.household_id).eq("is_active", true).order("created_at"),
      supabase.from("debts").select("*").eq("household_id", prof.household_id).eq("is_active", true).order("name"),
      supabase.from("transactions").select("description, date").eq("household_id", prof.household_id).eq("type", "expense").like("description", "Bill:%"),
    ]);

    setBills(billsRes.data || []);
    setMembers(membersRes.data || []);
    setDebts(debtsRes.data || []);

    // Build paid keys from existing transactions
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

  function getMyMemberId(): string | null {
    return members.find((m) => m.profile_id === profile?.id)?.id || null;
  }

  function openAdd() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, paid_by: getMyMemberId() || "" });
    setModalOpen(true);
  }

  function openEdit(bill: Bill) {
    setEditingId(bill.id);
    setForm({
      name: bill.name,
      amount: String(bill.amount),
      due_day: bill.due_day ? String(bill.due_day) : "",
      next_due_date: bill.next_due_date || "",
      frequency: bill.frequency,
      schedule_type: bill.schedule_type || "monthly",
      custom_interval_days: bill.custom_interval_days ? String(bill.custom_interval_days) : "",
      paid_by: bill.paid_by || "",
      debt_id: bill.debt_id || "",
      category: bill.category || "other",
      is_autopay: bill.is_autopay,
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.household_id) return;

    const supabase = createClient();
    const payload = {
      household_id: profile.household_id,
      name: form.name,
      amount: parseFloat(form.amount),
      due_day: form.due_day ? parseInt(form.due_day) : null,
      next_due_date: form.next_due_date || null,
      frequency: form.frequency,
      schedule_type: form.schedule_type,
      custom_interval_days: form.custom_interval_days ? parseInt(form.custom_interval_days) : null,
      paid_by: form.paid_by || null,
      debt_id: form.debt_id || null,
      category: form.category,
      is_autopay: form.is_autopay,
    };

    if (editingId) {
      const { error } = await supabase.from("bills").update(payload).eq("id", editingId);
      if (error) {
        alert(`Failed to update bill: ${error.message}`);
        return;
      }
    } else {
      const { error } = await supabase.from("bills").insert(payload);
      if (error) {
        alert(`Failed to add bill: ${error.message}`);
        return;
      }
    }

    setModalOpen(false);
    load();
  }

  async function reassignBill(billId: string, newOwnerId: string | null) {
    const supabase = createClient();
    await supabase.from("bills").update({ paid_by: newOwnerId }).eq("id", billId);
    setBills((prev) =>
      prev.map((b) => b.id === billId ? { ...b, paid_by: newOwnerId } : b)
    );
  }

  async function toggleActive(bill: Bill) {
    const supabase = createClient();
    await supabase.from("bills").update({ is_active: !bill.is_active }).eq("id", bill.id);
    setBills((prev) => prev.map((b) => b.id === bill.id ? { ...b, is_active: !b.is_active } : b));
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    await supabase.from("bills").delete().eq("id", id);
    setBills((prev) => prev.filter((b) => b.id !== id));
  }

  // Build paydays per member — enough to cover the viewed calendar month + buffer
  const monthsAhead = Math.max(12, Math.ceil((endOfMonth(calMonth).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 30)) + 2);
  const paydayCount = monthsAhead * 3; // ~3 paydays per month for biweekly
  const memberPaydays = new Map<string, Date[]>();
  for (const m of members) {
    if (m.next_pay_date && m.pay_frequency) {
      memberPaydays.set(m.id, getUpcomingPaydays(m.next_pay_date, m.pay_frequency, paydayCount));
    }
  }

  const fallbackPaydays = profile?.next_pay_date
    ? getUpcomingPaydays(profile.next_pay_date, profile.pay_frequency || "biweekly", paydayCount)
    : [];

  function getPaydaysForBill(bill: Bill): Date[] {
    if (bill.paid_by && memberPaydays.has(bill.paid_by)) {
      return memberPaydays.get(bill.paid_by)!;
    }
    return fallbackPaydays;
  }

  // Combined paydays for calendar — keep member association for initials
  interface PaydayWithMember { date: Date; memberIds: string[] }
  const paydayMap = new Map<number, string[]>();
  for (const [memberId, pds] of memberPaydays.entries()) {
    for (const pd of pds) {
      const key = pd.getTime();
      const existing = paydayMap.get(key) || [];
      existing.push(memberId);
      paydayMap.set(key, existing);
    }
  }
  // Add fallback paydays (user's own) if not already covered by a member
  for (const pd of fallbackPaydays) {
    const key = pd.getTime();
    if (!paydayMap.has(key)) {
      paydayMap.set(key, []);
    }
  }
  const allPaydaysWithMembers: PaydayWithMember[] = Array.from(paydayMap.entries())
    .map(([time, mIds]) => ({ date: new Date(time), memberIds: mIds }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const allPaydays = allPaydaysWithMembers.map((p) => p.date);

  const activeBills = bills.filter((b) => b.is_active);
  const inactiveBills = bills.filter((b) => !b.is_active);

  // Group by member
  const billsByMember = new Map<string, Bill[]>();
  const sharedBills: Bill[] = [];
  const memberIds = new Set(members.map((m) => m.id));

  for (const bill of activeBills) {
    if (!bill.paid_by || !memberIds.has(bill.paid_by)) {
      sharedBills.push(bill);
    } else {
      const existing = billsByMember.get(bill.paid_by) || [];
      existing.push(bill);
      billsByMember.set(bill.paid_by, existing);
    }
  }

  // Calendar events — compute per bill, covering the viewed calendar month + buffer
  // lookbackDays ensures past unpaid bills show as overdue
  const calDaysAhead = Math.max(
    365,
    Math.ceil((endOfMonth(calMonth).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) + 31
  );
  const calLookback = Math.max(
    90,
    Math.ceil((new Date().getTime() - startOfMonth(calMonth).getTime()) / (1000 * 60 * 60 * 24)) + 31
  );
  const calEvents: BillEvent[] = activeBills.flatMap((bill) => {
    const pd = getPaydaysForBill(bill);
    return getBillEvents(
      [{ ...bill, paid_by: bill.paid_by || "shared" }],
      pd,
      calDaysAhead,
      undefined,
      calLookback
    );
  }).sort((a, b) => a.date.getTime() - b.date.getTime());

  // Overdue events for list view (past 30 days)
  const overdueEvents: BillEvent[] = activeBills.flatMap((bill) => {
    const pd = getPaydaysForBill(bill);
    return getBillEvents(
      [{ ...bill, paid_by: bill.paid_by || "shared" }],
      pd,
      0,
      undefined,
      30
    );
  })
    .filter((evt) => isBefore(evt.date, startOfDay(new Date())) && !paidKeys.has(`${evt.billId}|${format(evt.date, "yyyy-MM-dd")}`))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  // Paid/Overdue helpers
  function isEventPaid(billId: string, date: Date): boolean {
    return paidKeys.has(`${billId}|${format(date, "yyyy-MM-dd")}`);
  }

  function isEventOverdue(billId: string, date: Date): boolean {
    const today = startOfDay(new Date());
    return !isEventPaid(billId, date) && isBefore(date, today);
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPaySuccess("Error: Not logged in");
        setPaying(false);
        return;
      }

      const amount = parseFloat(payAmount);
      const payDate = payingDate
        ? format(payingDate, "yyyy-MM-dd")
        : format(new Date(), "yyyy-MM-dd");

      // 1. Find or create "Bills" category
      let billsCategoryId: string | null = null;
      const { data: existingCat } = await supabase
        .from("categories")
        .select("id")
        .eq("household_id", profile.household_id)
        .eq("name", "Bills")
        .eq("type", "expense")
        .single();

      if (existingCat) {
        billsCategoryId = existingCat.id;
      } else {
        const { data: newCat } = await supabase
          .from("categories")
          .insert({ household_id: profile.household_id, name: "Bills", type: "expense", icon: "🧾" })
          .select("id")
          .single();
        if (newCat) billsCategoryId = newCat.id;
      }

      // 2. Create expense transaction
      const { error: txError } = await supabase.from("transactions").insert({
        household_id: profile.household_id,
        user_id: user.id,
        amount,
        type: "expense",
        category_id: billsCategoryId,
        description: `Bill: ${payingBill.name}${payNotes ? ` — ${payNotes}` : ""}`,
        date: payDate,
      });

      if (txError) {
        setPaySuccess(`Error recording transaction: ${txError.message}`);
        setPaying(false);
        return;
      }

      // 3. Advance bill's next_due_date
      const pd = getPaydaysForBill(payingBill);
      const nextDue = getNextDueDate(payingBill, pd);
      if (nextDue) {
        let advancedDate: string | null = null;

        if (
          payingBill.schedule_type === "every_payday" ||
          payingBill.schedule_type === "every_other_payday"
        ) {
          const step = payingBill.schedule_type === "every_other_payday" ? 2 : 1;
          const futurePd = pd.filter((d) => d.getTime() > nextDue.getTime());
          if (futurePd.length >= step) {
            advancedDate = format(futurePd[step - 1], "yyyy-MM-dd");
          }
        } else {
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

      // Mark as paid locally
      setPaidKeys((prev) => {
        const next = new Set(prev);
        next.add(`${payingBill.id}|${payDate}`);
        return next;
      });

      setPaying(false);
      setPaySuccess(
        `Paid ${formatCurrency(amount)} for ${payingBill.name}${payingBill.debt_id ? ` — debt updated to ${formatCurrency(parseFloat(payNewDebtBalance))}` : ""}`
      );

      load();
    } catch (err) {
      console.error("Payment error:", err);
      setPaying(false);
      setPaySuccess(`Error: ${err instanceof Error ? err.message : "Something went wrong"}`);
    }
  }

  // Undo payment
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

  function getMemberColor(memberId: string | null): string {
    if (!memberId || memberId === "shared") return "bg-accent text-muted";
    const idx = members.findIndex((m) => m.id === memberId);
    const colors = [
      "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400",
      "bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400",
      "bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400",
      "bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400",
    ];
    return colors[idx % colors.length];
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-muted">Loading...</div></div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bills</h1>
          {allPaydays.length === 0 && (
            <p className="text-warning text-sm">Set pay dates for members in Settings for smart scheduling</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-accent rounded-lg p-0.5">
            <button onClick={() => setViewMode("calendar")} className={`p-2 rounded-md ${viewMode === "calendar" ? "bg-card shadow-sm" : ""}`} title="Calendar view">
              <Calendar size={18} />
            </button>
            <button onClick={() => setViewMode("list")} className={`p-2 rounded-md ${viewMode === "list" ? "bg-card shadow-sm" : ""}`} title="List view">
              <List size={18} />
            </button>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover">
            <Plus size={18} /> Add Bill
          </button>
        </div>
      </div>

      {/* List View — bill management */}
      {viewMode === "list" && (
        <div className="space-y-6">
              {overdueEvents.length > 0 && (
                <div className="bg-card rounded-xl border border-danger/30 overflow-hidden">
                  <div className="bg-rose-50 dark:bg-rose-500/10 px-4 py-3 border-b border-danger/20">
                    <h2 className="text-sm font-semibold text-danger uppercase tracking-wide">
                      Overdue Bills ({overdueEvents.length})
                    </h2>
                  </div>
                  <div className="divide-y divide-border">
                    {overdueEvents.map((evt, i) => {
                      const bill = bills.find((b) => b.id === evt.billId);
                      const linkedDebt = bill?.debt_id ? debts.find((d) => d.id === bill.debt_id) : null;
                      return (
                        <div key={`${evt.billId}-${i}`} className="flex items-center justify-between p-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{evt.name}</span>
                              <span className="text-xs text-danger font-medium">{format(evt.date, "MMM d")}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${getMemberColor(evt.paid_by)}`}>
                                {getMemberName(evt.paid_by)}
                              </span>
                              {linkedDebt && (
                                <span className="text-xs bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 px-2 py-0.5 rounded-full">
                                  Debt: {formatCurrency(linkedDebt.current_balance)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold">{formatCurrency(evt.amount)}</span>
                            <button
                              onClick={() => openPay(evt)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-danger text-white rounded-lg hover:opacity-90 text-sm font-medium"
                            >
                              <Check size={14} /> Pay
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {members.map((member) => {
                const memberBills = billsByMember.get(member.id) || [];
                if (memberBills.length === 0) return null;

                const mPaydays = memberPaydays.get(member.id) || fallbackPaydays;
                const sorted = sortBillsByDue(memberBills, mPaydays);
                const total = memberBills.reduce((sum, b) => sum + Number(b.amount), 0);

                return (
                  <BillSection
                    key={member.id}
                    title={`${member.name}${member.profile_id === profile?.id ? " (You)" : ""}`}
                    bills={sorted}
                    total={total}
                    paydays={mPaydays}
                    members={members}
                    myMemberId={getMyMemberId()}
                    onEdit={openEdit}
                    onToggle={toggleActive}
                    onDelete={handleDelete}
                    onReassign={reassignBill}
                    getMemberName={getMemberName}
                  />
                );
              })}

              {sharedBills.length > 0 && (
                <BillSection
                  title="Shared / Unassigned"
                  bills={sortBillsByDue(sharedBills, fallbackPaydays)}
                  total={sharedBills.reduce((sum, b) => sum + Number(b.amount), 0)}
                  paydays={fallbackPaydays}
                  members={members}
                  myMemberId={getMyMemberId()}
                  onEdit={openEdit}
                  onToggle={toggleActive}
                  onDelete={handleDelete}
                  onReassign={reassignBill}
                  getMemberName={getMemberName}
                />
              )}

              {activeBills.length === 0 && (
                <div className="bg-card rounded-xl border border-border p-8 text-center text-muted">
                  No bills yet. Add your first one!
                </div>
              )}

              {inactiveBills.length > 0 && (
                <div>
                  <h2 className="text-lg font-semibold mb-3 text-muted">Inactive</h2>
                  <div className="bg-card rounded-xl border border-border divide-y divide-border opacity-60">
                    {inactiveBills.map((bill) => (
                      <div key={bill.id} className="flex items-center justify-between p-4">
                        <div>
                          <p className="font-medium">{bill.name}</p>
                          <p className="text-sm text-muted">{formatCurrency(bill.amount)} · {getMemberName(bill.paid_by)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(bill)} className="p-1 text-muted hover:text-primary"><Pencil size={16} /></button>
                          <button onClick={() => toggleActive(bill)} className="p-1 text-muted"><ToggleLeft size={22} /></button>
                          <button onClick={() => handleDelete(bill.id)} className="p-1 text-muted hover:text-danger"><Trash2 size={16} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
        </div>
      )}

      {/* Calendar View */}
      {viewMode === "calendar" && (
        <CalendarGrid
          calMonth={calMonth}
          setCalMonth={setCalMonth}
          calEvents={calEvents}
          paydays={allPaydays}
          paydaysWithMembers={allPaydaysWithMembers}
          members={members}
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

      {/* Bill Form Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit Bill" : "Add Bill"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Bill Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Electric Bill" className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Amount</label>
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required placeholder="0.00" className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Paid By</label>
            <select value={form.paid_by} onChange={(e) => setForm({ ...form, paid_by: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">Shared / Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.profile_id === profile?.id ? " (You)" : ""}
                </option>
              ))}
            </select>
          </div>

          {debts.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">Linked Debt <span className="text-muted font-normal">(optional)</span></label>
              <select value={form.debt_id} onChange={(e) => setForm({ ...form, debt_id: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">None</option>
                {debts.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({formatCurrency(d.current_balance)})</option>
                ))}
              </select>
              <p className="text-xs text-muted mt-1">Link to a debt to auto-update balance when marked paid</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Frequency</label>
            <select value={form.schedule_type} onChange={(e) => setForm({ ...form, schedule_type: e.target.value as Bill["schedule_type"] })} className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="monthly">Monthly (fixed day)</option>
              <option value="biweekly">Biweekly (every 2 weeks)</option>
              <option value="weekly">Weekly</option>
              <option value="quarterly">Quarterly (every 3 months)</option>
              <option value="yearly">Yearly</option>
              <option value="every_payday">Every payday</option>
              <option value="every_other_payday">Every other payday</option>
              <option value="custom">Custom interval</option>
            </select>
          </div>

          {(form.schedule_type === "monthly" || form.schedule_type === "quarterly" || form.schedule_type === "yearly") && (
            <div>
              <label className="block text-sm font-medium mb-1">Due Day of Month</label>
              <input type="number" min="1" max="31" value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value })} placeholder="15" className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          )}

          {(form.schedule_type === "biweekly" || form.schedule_type === "weekly" || form.schedule_type === "custom") && (
            <div>
              <label className="block text-sm font-medium mb-1">Next Due Date</label>
              <input type="date" value={form.next_due_date} onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
              <p className="text-xs text-muted mt-1">We&apos;ll calculate future dates from this starting point</p>
            </div>
          )}

          {form.schedule_type === "custom" && (
            <div>
              <label className="block text-sm font-medium mb-1">Repeat Every (days)</label>
              <input type="number" min="1" max="365" value={form.custom_interval_days} onChange={(e) => setForm({ ...form, custom_interval_days: e.target.value })} placeholder="e.g. 14 for biweekly, 10 for every 10 days" className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
              <p className="text-xs text-muted mt-1">How many days between each occurrence</p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input type="checkbox" id="autopay" checked={form.is_autopay} onChange={(e) => setForm({ ...form, is_autopay: e.target.checked })} className="rounded" />
            <label htmlFor="autopay" className="text-sm">Autopay enabled</label>
          </div>

          <button type="submit" className="w-full py-2 px-4 bg-primary text-white rounded-lg hover:bg-primary-hover font-medium">
            {editingId ? "Save Changes" : "Add Bill"}
          </button>
        </form>
      </Modal>

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
              {payingBill?.is_autopay && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Autopay</span>
                  <span className="text-success font-medium">Enabled</span>
                </div>
              )}
            </div>

            {/* Amount */}
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
                    if (debt) {
                      const newBal = Math.max(0, debt.current_balance - parseFloat(e.target.value || "0"));
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
              const linkedDebt = debts.find((d) => d.id === payingBill.debt_id);
              if (!linkedDebt) return null;
              return (
                <div className="bg-rose-50 dark:bg-rose-500/10 rounded-lg p-3 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-danger">Linked Debt: {linkedDebt.name}</span>
                    <span className="text-danger font-semibold">{formatCurrency(linkedDebt.current_balance)}</span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">New Balance After Payment</label>
                    <input
                      type="number"
                      step="0.01"
                      value={payNewDebtBalance}
                      onChange={(e) => setPayNewDebtBalance(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <p className="text-xs text-muted mt-1">
                      Suggested: {formatCurrency(Math.max(0, linkedDebt.current_balance - parseFloat(payAmount || "0")))}. Edit if interest or late charges changed the balance.
                    </p>
                  </div>
                  {parseFloat(payNewDebtBalance) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Remaining after payment</span>
                      <span className="font-semibold text-danger">{formatCurrency(parseFloat(payNewDebtBalance))}</span>
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
              <label className="block text-sm font-medium mb-1">Notes <span className="text-muted font-normal">(optional)</span></label>
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
              className="flex-1 py-2 px-4 border border-border rounded-lg hover:bg-accent font-medium"
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

/* ==================== SORT HELPER ==================== */

function sortBillsByDue(bills: Bill[], paydays: Date[]): Bill[] {
  return [...bills].sort((a, b) => {
    const aDue = getNextDueDate(a, paydays);
    const bDue = getNextDueDate(b, paydays);
    if (!aDue) return 1;
    if (!bDue) return -1;
    return aDue.getTime() - bDue.getTime();
  });
}

/* ==================== BILL SECTION ==================== */

function BillSection({
  title, bills, total, paydays, members, myMemberId, onEdit, onToggle, onDelete, onReassign, getMemberName,
}: {
  title: string;
  bills: Bill[];
  total: number;
  paydays: Date[];
  members: HouseholdMember[];
  myMemberId: string | null;
  onEdit: (b: Bill) => void;
  onToggle: (b: Bill) => void;
  onDelete: (id: string) => void;
  onReassign: (billId: string, newOwnerId: string | null) => void;
  getMemberName: (id: string | null) => string;
}) {
  const [reassigningId, setReassigningId] = useState<string | null>(null);

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-sm text-muted">{formatCurrency(total)}/cycle</span>
      </div>
      <div className="bg-card rounded-xl border border-border divide-y divide-border">
        {bills.map((bill) => {
          const nextDue = getNextDueDate(bill, paydays);
          const days = nextDue ? daysUntil(nextDue) : null;

          return (
            <div key={bill.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium">{bill.name}</p>
                    {bill.is_autopay && (
                      <span className="text-xs bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full">Autopay</span>
                    )}
                    <span className="text-xs bg-accent text-muted px-2 py-0.5 rounded-full">
                      {bill.schedule_type === "every_payday" ? "Every payday" :
                       bill.schedule_type === "every_other_payday" ? "Alt. payday" :
                       bill.schedule_type === "custom" ? `Every ${bill.custom_interval_days || 30}d` :
                       SCHEDULE_LABELS[bill.schedule_type] || bill.schedule_type}
                    </span>
                  </div>
                  <p className="text-sm text-muted mt-0.5">
                    {nextDue ? (
                      <>
                        Due {formatDueDate(nextDue)}
                        {days !== null && (
                          <span className={
                            days === 0 ? " text-danger font-medium" :
                            days <= 3 ? " text-warning font-medium" : ""
                          }>
                            {days === 0 ? " · Today!" :
                             days === 1 ? " · Tomorrow" :
                             days <= 7 ? ` · ${days} days` :
                             ` · in ${days} days`}
                          </span>
                        )}
                      </>
                    ) : (
                      "No due date set"
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold mr-1">{formatCurrency(bill.amount)}</span>
                  <button
                    onClick={() => setReassigningId(reassigningId === bill.id ? null : bill.id)}
                    className="p-1 text-muted hover:text-primary"
                    title="Reassign to another member"
                  >
                    <ArrowRightLeft size={16} />
                  </button>
                  <button onClick={() => onEdit(bill)} className="p-1 text-muted hover:text-primary"><Pencil size={16} /></button>
                  <button onClick={() => onToggle(bill)} className="p-1 text-success"><ToggleRight size={22} /></button>
                  <button onClick={() => onDelete(bill.id)} className="p-1 text-muted hover:text-danger"><Trash2 size={16} /></button>
                </div>
              </div>

              {reassigningId === bill.id && (
                <div className="mt-2 flex items-center gap-2 bg-accent p-2 rounded-lg">
                  <span className="text-sm text-muted">Move to:</span>
                  {members.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { onReassign(bill.id, m.id); setReassigningId(null); }}
                      disabled={bill.paid_by === m.id}
                      className={`text-sm px-3 py-1 rounded-lg ${
                        bill.paid_by === m.id
                          ? "bg-primary text-white"
                          : "bg-card border border-border hover:border-primary"
                      }`}
                    >
                      {m.name}{m.id === myMemberId ? " (You)" : ""}
                    </button>
                  ))}
                  <button
                    onClick={() => { onReassign(bill.id, null); setReassigningId(null); }}
                    disabled={!bill.paid_by}
                    className={`text-sm px-3 py-1 rounded-lg ${
                      !bill.paid_by
                        ? "bg-primary text-white"
                        : "bg-card border border-border hover:border-primary"
                    }`}
                  >
                    Shared
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ==================== CALENDAR GRID ==================== */

function CalendarGrid({
  calMonth,
  setCalMonth,
  calEvents,
  paydays,
  paydaysWithMembers,
  members,
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
  paydaysWithMembers: { date: Date; memberIds: string[] }[];
  members: HouseholdMember[];
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

  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  return (
    <>
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setCalMonth(subMonths(calMonth, 1))}
            className="p-2 border border-border rounded-lg hover:bg-accent"
          >
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-lg font-semibold">
            {format(calMonth, "MMMM yyyy")}
          </h2>
          <button
            onClick={() => setCalMonth(addMonths(calMonth, 1))}
            className="p-2 border border-border rounded-lg hover:bg-accent"
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
              return <div key={`empty-${i}`} className="bg-accent min-h-[80px]" />;
            }

            const dayEvents = calEvents.filter((e) => isSameDay(e.date, day));
            const paydayEntry = paydaysWithMembers.find((p) => isSameDay(p.date, day));
            const isPayday = !!paydayEntry;
            const todayFlag = isToday(day);
            const isSelected = selectedDay && isSameDay(day, selectedDay);
            const dayTotal = dayEvents.reduce((sum, e) => sum + e.amount, 0);

            return (
              <div
                key={day.toISOString()}
                onClick={() =>
                  dayEvents.length > 0
                    ? setSelectedDay(isSelected ? null : day)
                    : null
                }
                className={`bg-card min-h-[80px] p-1 ${todayFlag ? "ring-2 ring-primary ring-inset" : ""} ${isSelected ? "ring-2 ring-blue-400 ring-inset" : ""} ${dayEvents.length > 0 ? "cursor-pointer hover:bg-accent" : ""}`}
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
                  {isPayday && paydayEntry && (
                    paydayEntry.memberIds.length > 0 ? (
                      paydayEntry.memberIds.map((mId) => {
                        const m = members.find((mem) => mem.id === mId);
                        const initials = m ? m.name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2) : "?";
                        return (
                          <span key={mId} className="text-[10px] bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-1 rounded font-medium">
                            {initials} Pay
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-[10px] bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-1 rounded font-medium">
                        PAY
                      </span>
                    )
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
                            ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 line-through opacity-70"
                            : overdue
                            ? "bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 font-medium"
                            : evt.is_autopay
                            ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
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
            <div className="w-3 h-3 bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/30 rounded" /> Paid
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-rose-100 dark:bg-rose-500/20 border border-rose-300 dark:border-rose-500/30 rounded" /> Overdue
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded" /> Upcoming
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded" /> Autopay
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-1 rounded">PAY</span> Payday
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
                paid ? "bg-emerald-50 dark:bg-emerald-500/10" : overdue ? "bg-rose-50 dark:bg-rose-500/10" : "bg-accent"
              }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`font-medium ${paid ? "line-through text-muted" : ""}`}>{evt.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getMemberColor(evt.paid_by)}`}>
                    {getMemberName(evt.paid_by)}
                  </span>
                  {evt.is_autopay && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      Autopay
                    </span>
                  )}
                  {linkedDebt && (
                    <span className="text-xs bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 px-2 py-0.5 rounded-full">
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
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-lg text-sm font-medium hover:bg-emerald-200 dark:hover:bg-emerald-500/30 transition-colors"
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

