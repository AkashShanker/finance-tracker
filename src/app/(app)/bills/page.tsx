"use client";

import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import type { Bill, Profile, HouseholdMember, Debt } from "@/lib/types";
import { getUpcomingPaydays, getNextDueDate, daysUntil, formatDueDate, getBillEvents } from "@/lib/payday";
import Modal from "@/components/Modal";
import { Plus, Trash2, Pencil, ToggleLeft, ToggleRight, Calendar, List, ArrowRightLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, isSameMonth, isToday } from "date-fns";

type ViewMode = "list" | "calendar";

const EMPTY_FORM = {
  name: "",
  amount: "",
  due_day: "",
  next_due_date: "",
  frequency: "monthly" as Bill["frequency"],
  schedule_type: "monthly" as Bill["schedule_type"],
  paid_by: "" as string,
  debt_id: "" as string,
  category: "other",
  is_autopay: false,
};

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [calMonth, setCalMonth] = useState(new Date());
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => { load(); }, []);

  async function load() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: prof } = await supabase
      .from("profiles").select("*").eq("id", user.id).single();
    if (!prof?.household_id) return;
    setProfile(prof);

    const [billsRes, membersRes, debtsRes] = await Promise.all([
      supabase.from("bills").select("*").eq("household_id", prof.household_id).order("due_day"),
      supabase.from("household_members").select("*").eq("household_id", prof.household_id).eq("is_active", true).order("created_at"),
      supabase.from("debts").select("*").eq("household_id", prof.household_id).eq("is_active", true).order("name"),
    ]);

    setBills(billsRes.data || []);
    setMembers(membersRes.data || []);
    setDebts(debtsRes.data || []);
    setLoading(false);
  }

  function getMemberName(memberId: string | null): string {
    if (!memberId) return "Shared";
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
      paid_by: form.paid_by || null,
      debt_id: form.debt_id || null,
      category: form.category,
      is_autopay: form.is_autopay,
    };

    if (editingId) {
      await supabase.from("bills").update(payload).eq("id", editingId);
    } else {
      await supabase.from("bills").insert(payload);
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

  // Build paydays per member (for member-specific bill scheduling)
  const memberPaydays = new Map<string, Date[]>();
  for (const m of members) {
    if (m.next_pay_date && m.pay_frequency) {
      memberPaydays.set(m.id, getUpcomingPaydays(m.next_pay_date, m.pay_frequency, 26));
    }
  }

  // Fallback: use logged-in user's profile pay schedule for bills with no member or member without pay info
  const fallbackPaydays = profile?.next_pay_date
    ? getUpcomingPaydays(profile.next_pay_date, profile.pay_frequency || "biweekly", 26)
    : [];

  // Helper: get the right paydays for a bill based on who pays it
  function getPaydaysForBill(bill: Bill): Date[] {
    if (bill.paid_by && memberPaydays.has(bill.paid_by)) {
      return memberPaydays.get(bill.paid_by)!;
    }
    return fallbackPaydays;
  }

  // Combined paydays for calendar (all members' paydays merged + deduplicated)
  const allPaydays = Array.from(
    new Set([...fallbackPaydays, ...Array.from(memberPaydays.values()).flat()].map((d) => d.getTime()))
  ).map((t) => new Date(t)).sort((a, b) => a.getTime() - b.getTime());

  const activeBills = bills.filter((b) => b.is_active);
  const inactiveBills = bills.filter((b) => !b.is_active);

  // Group by member
  const billsByMember = new Map<string, Bill[]>();
  const sharedBills: Bill[] = [];

  const memberIds = new Set(members.map((m) => m.id));

  for (const bill of activeBills) {
    if (!bill.paid_by || !memberIds.has(bill.paid_by)) {
      // No owner, or old string value like "you"/"wife" — treat as shared
      sharedBills.push(bill);
    } else {
      const existing = billsByMember.get(bill.paid_by) || [];
      existing.push(bill);
      billsByMember.set(bill.paid_by, existing);
    }
  }

  // Calendar events — compute per bill using the assigned member's paydays
  const calEvents = activeBills.flatMap((bill) => {
    const pd = getPaydaysForBill(bill);
    return getBillEvents(
      [{ ...bill, paid_by: bill.paid_by || "shared" }],
      pd,
      90
    );
  }).sort((a, b) => a.date.getTime() - b.date.getTime());

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-muted">Loading...</div></div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Bills</h1>
          {allPaydays.length === 0 && (
            <p className="text-warning text-sm">Set pay dates for members in Settings for smart scheduling</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setViewMode("list")} className={`p-2 rounded-md ${viewMode === "list" ? "bg-white shadow-sm" : ""}`}>
              <List size={18} />
            </button>
            <button onClick={() => setViewMode("calendar")} className={`p-2 rounded-md ${viewMode === "calendar" ? "bg-white shadow-sm" : ""}`}>
              <Calendar size={18} />
            </button>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover">
            <Plus size={18} /> Add Bill
          </button>
        </div>
      </div>

      {viewMode === "list" ? (
        <div className="space-y-6">
          {/* Bills grouped by member */}
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

          {/* Shared / unassigned bills */}
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

          {/* Inactive */}
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
      ) : (
        <CalendarView
          calMonth={calMonth}
          setCalMonth={setCalMonth}
          calEvents={calEvents}
          paydays={allPaydays}
          getMemberName={getMemberName}
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
            <label className="block text-sm font-medium mb-1">Schedule Type</label>
            <select value={form.schedule_type} onChange={(e) => setForm({ ...form, schedule_type: e.target.value as Bill["schedule_type"] })} className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="monthly">Fixed day of month</option>
              <option value="every_payday">Every payday</option>
              <option value="every_other_payday">Every other payday</option>
              <option value="weekly">Weekly</option>
              <option value="custom">Custom date</option>
            </select>
          </div>

          {form.schedule_type === "monthly" && (
            <div>
              <label className="block text-sm font-medium mb-1">Due Day of Month</label>
              <input type="number" min="1" max="31" value={form.due_day} onChange={(e) => setForm({ ...form, due_day: e.target.value })} placeholder="15" className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          )}

          {(form.schedule_type === "custom" || form.schedule_type === "weekly") && (
            <div>
              <label className="block text-sm font-medium mb-1">Next Due Date</label>
              <input type="date" value={form.next_due_date} onChange={(e) => setForm({ ...form, next_due_date: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          )}

          {form.schedule_type === "monthly" && (
            <div>
              <label className="block text-sm font-medium mb-1">Frequency</label>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Bill["frequency"] })} className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
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
    </div>
  );
}

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
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Autopay</span>
                    )}
                    <span className="text-xs bg-gray-100 text-muted px-2 py-0.5 rounded-full">
                      {bill.schedule_type === "every_payday" ? "Every payday" :
                       bill.schedule_type === "every_other_payday" ? "Alt. payday" :
                       bill.schedule_type === "weekly" ? "Weekly" :
                       bill.frequency}
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

              {/* Inline reassign dropdown */}
              {reassigningId === bill.id && (
                <div className="mt-2 flex items-center gap-2 bg-gray-50 p-2 rounded-lg">
                  <span className="text-sm text-muted">Move to:</span>
                  {members.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { onReassign(bill.id, m.id); setReassigningId(null); }}
                      disabled={bill.paid_by === m.id}
                      className={`text-sm px-3 py-1 rounded-lg ${
                        bill.paid_by === m.id
                          ? "bg-primary text-white"
                          : "bg-white border border-border hover:border-primary"
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
                        : "bg-white border border-border hover:border-primary"
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

/* ==================== CALENDAR VIEW ==================== */

function CalendarView({
  calMonth, setCalMonth, calEvents, paydays, getMemberName,
}: {
  calMonth: Date;
  setCalMonth: (d: Date) => void;
  calEvents: ReturnType<typeof getBillEvents>;
  paydays: Date[];
  getMemberName: (id: string | null) => string;
}) {
  const monthStart = startOfMonth(calMonth);
  const monthEnd = endOfMonth(calMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startDayOfWeek = getDay(monthStart);

  const paddedDays: (Date | null)[] = [
    ...Array(startDayOfWeek).fill(null),
    ...days,
  ];

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCalMonth(subMonths(calMonth, 1))} className="px-3 py-1 text-sm border border-border rounded-lg hover:bg-gray-50">
          &larr; Prev
        </button>
        <h2 className="text-lg font-semibold">{format(calMonth, "MMMM yyyy")}</h2>
        <button onClick={() => setCalMonth(addMonths(calMonth, 1))} className="px-3 py-1 text-sm border border-border rounded-lg hover:bg-gray-50">
          Next &rarr;
        </button>
      </div>

      <div className="grid grid-cols-7 mb-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-border">
        {paddedDays.map((day, i) => {
          if (!day) {
            return <div key={`empty-${i}`} className="bg-gray-50 min-h-[80px]" />;
          }

          const dayEvents = calEvents.filter((e) => isSameDay(e.date, day));
          const isPayday = paydays.some((pd) => isSameDay(pd, day));
          const today = isToday(day);

          return (
            <div key={day.toISOString()} className={`bg-white min-h-[80px] p-1 ${today ? "ring-2 ring-primary ring-inset" : ""}`}>
              <div className="flex items-center justify-between mb-0.5">
                <span className={`text-xs font-medium ${today ? "text-primary" : !isSameMonth(day, calMonth) ? "text-gray-300" : "text-foreground"}`}>
                  {format(day, "d")}
                </span>
                {isPayday && (
                  <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded">PAY</span>
                )}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((evt, j) => (
                  <div
                    key={`${evt.billId}-${j}`}
                    className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate ${
                      evt.is_autopay ? "bg-green-50 text-green-700" : "bg-blue-50 text-blue-700"
                    }`}
                    title={`${evt.name}: ${formatCurrency(evt.amount)} (${getMemberName(evt.paid_by)})`}
                  >
                    {evt.name.length > 12 ? evt.name.slice(0, 12) + "…" : evt.name}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-4 mt-3 text-xs text-muted">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-blue-50 border border-blue-200 rounded" /> Bills
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-50 border border-green-200 rounded" /> Autopay
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded">PAY</span> Payday
        </div>
      </div>
    </div>
  );
}
