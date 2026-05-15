"use client";

import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import type { Debt, Profile } from "@/lib/types";
import Modal from "@/components/Modal";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useEffect, useState } from "react";

const DEBT_TYPE_LABELS: Record<Debt["type"], string> = {
  credit_card: "Credit Card",
  student_loan: "Student Loan",
  auto_loan: "Auto Loan",
  mortgage: "Mortgage",
  personal_loan: "Personal Loan",
  medical: "Medical",
  other: "Other",
};

export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    current_balance: "",
    original_balance: "",
    interest_rate: "",
    minimum_payment: "",
    due_day: "",
    type: "credit_card" as Debt["type"],
  });

  useEffect(() => { load(); }, []);

  async function load() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (!prof?.household_id) return;
    setProfile(prof);

    const { data } = await supabase
      .from("debts").select("*")
      .eq("household_id", prof.household_id)
      .eq("is_active", true)
      .order("current_balance", { ascending: false });

    setDebts(data || []);
    setLoading(false);
  }

  function openEdit(debt: Debt) {
    setEditingId(debt.id);
    setForm({
      name: debt.name,
      current_balance: String(debt.current_balance),
      original_balance: debt.original_balance ? String(debt.original_balance) : "",
      interest_rate: String(debt.interest_rate),
      minimum_payment: String(debt.minimum_payment),
      due_day: debt.due_day ? String(debt.due_day) : "",
      type: debt.type,
    });
    setModalOpen(true);
  }

  function openAdd() {
    setEditingId(null);
    setForm({ name: "", current_balance: "", original_balance: "", interest_rate: "", minimum_payment: "", due_day: "", type: "credit_card" });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.household_id) return;

    const supabase = createClient();
    const payload = {
      household_id: profile.household_id,
      name: form.name,
      current_balance: parseFloat(form.current_balance),
      original_balance: form.original_balance ? parseFloat(form.original_balance) : null,
      interest_rate: form.interest_rate ? parseFloat(form.interest_rate) : 0,
      minimum_payment: form.minimum_payment ? parseFloat(form.minimum_payment) : 0,
      due_day: form.due_day ? parseInt(form.due_day) : null,
      type: form.type,
    };

    if (editingId) {
      await supabase.from("debts").update(payload).eq("id", editingId);
    } else {
      await supabase.from("debts").insert(payload);
    }

    setModalOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    await supabase.from("debts").update({ is_active: false }).eq("id", id);
    setDebts((prev) => prev.filter((d) => d.id !== id));
  }

  const totalDebt = debts.reduce((sum, d) => sum + Number(d.current_balance), 0);
  const totalMinPayments = debts.reduce((sum, d) => sum + Number(d.minimum_payment), 0);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-muted">Loading...</div></div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Debts</h1>
          <p className="text-muted">
            Total: {formatCurrency(totalDebt)} · Min payments: {formatCurrency(totalMinPayments)}/mo
          </p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover">
          <Plus size={18} /> Add Debt
        </button>
      </div>

      {/* Debt Cards */}
      {debts.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-8 text-center text-muted">
          No debts tracked yet. Add your debts to start planning payoff!
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {debts.map((debt) => {
            const progress = debt.original_balance
              ? ((debt.original_balance - debt.current_balance) / debt.original_balance) * 100
              : 0;
            return (
              <div key={debt.id} className="bg-card rounded-xl border border-border p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-lg">{debt.name}</h3>
                    <span className="text-xs bg-gray-100 text-muted px-2 py-0.5 rounded-full">
                      {DEBT_TYPE_LABELS[debt.type]}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(debt)} className="p-1 text-muted hover:text-primary"><Pencil size={16} /></button>
                    <button onClick={() => handleDelete(debt.id)} className="p-1 text-muted hover:text-danger"><Trash2 size={16} /></button>
                  </div>
                </div>
                <p className="text-2xl font-bold text-danger mb-2">{formatCurrency(debt.current_balance)}</p>
                {debt.original_balance && (
                  <>
                    <div className="w-full bg-gray-200 rounded-full h-3 mb-1">
                      <div className="bg-success rounded-full h-3 transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
                    </div>
                    <p className="text-xs text-muted mb-2">
                      {progress.toFixed(1)}% paid off · Started at {formatCurrency(debt.original_balance)}
                    </p>
                  </>
                )}
                <div className="flex justify-between text-sm text-muted">
                  <span>{debt.interest_rate}% APR</span>
                  <span>Min: {formatCurrency(debt.minimum_payment)}/mo</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Debt Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit Debt" : "Add Debt"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Chase Sapphire" className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Debt["type"] })} className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
              {Object.entries(DEBT_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Current Balance</label>
            <input type="number" step="0.01" value={form.current_balance} onChange={(e) => setForm({ ...form, current_balance: e.target.value })} required placeholder="0.00" className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Original Balance <span className="text-muted font-normal">(optional)</span></label>
            <input type="number" step="0.01" value={form.original_balance} onChange={(e) => setForm({ ...form, original_balance: e.target.value })} placeholder="0.00" className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">APR %</label>
              <input type="number" step="0.01" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} placeholder="0.00" className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Min Payment</label>
              <input type="number" step="0.01" value={form.minimum_payment} onChange={(e) => setForm({ ...form, minimum_payment: e.target.value })} placeholder="0.00" className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <button type="submit" className="w-full py-2 px-4 bg-primary text-white rounded-lg hover:bg-primary-hover font-medium">
            {editingId ? "Update Debt" : "Add Debt"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
