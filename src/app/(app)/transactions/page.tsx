"use client";

import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Transaction, Category, Profile } from "@/lib/types";
import Modal from "@/components/Modal";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");

  const [form, setForm] = useState({
    amount: "",
    type: "expense" as "income" | "expense",
    category_id: "",
    description: "",
    date: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (!prof?.household_id) return;
    setProfile(prof);

    const [txRes, catRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("*, category:categories(*)")
        .eq("household_id", prof.household_id)
        .order("date", { ascending: false })
        .limit(100),
      supabase
        .from("categories")
        .select("*")
        .eq("household_id", prof.household_id)
        .order("name"),
    ]);

    setTransactions(txRes.data || []);
    setCategories(catRes.data || []);
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.household_id) return;

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("transactions").insert({
      household_id: profile.household_id,
      user_id: user.id,
      amount: parseFloat(form.amount),
      type: form.type,
      category_id: form.category_id || null,
      description: form.description || null,
      date: form.date,
    });

    setForm({
      amount: "",
      type: "expense",
      category_id: "",
      description: "",
      date: new Date().toISOString().split("T")[0],
    });
    setModalOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    await supabase.from("transactions").delete().eq("id", id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }

  const filtered =
    filterType === "all"
      ? transactions
      : transactions.filter((t) => t.type === filterType);

  const filteredCategories = categories.filter((c) => c.type === form.type);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-muted">Loading...</div></div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
        >
          <Plus size={18} /> Add
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(["all", "income", "expense"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${
              filterType === t
                ? "bg-primary text-white"
                : "bg-card border border-border hover:bg-gray-50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Transaction List */}
      <div className="bg-card rounded-xl border border-border divide-y divide-border">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted">
            No transactions yet. Add your first one!
          </div>
        ) : (
          filtered.map((tx) => (
            <div key={tx.id} className="flex items-center justify-between p-4">
              <div className="flex-1">
                <p className="font-medium">
                  {tx.category?.icon}{" "}
                  {tx.description || tx.category?.name || "Transaction"}
                </p>
                <p className="text-sm text-muted">{formatDate(tx.date)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`font-semibold ${
                    tx.type === "income" ? "text-success" : "text-danger"
                  }`}
                >
                  {tx.type === "income" ? "+" : "-"}
                  {formatCurrency(tx.amount)}
                </span>
                <button
                  onClick={() => handleDelete(tx.id)}
                  className="p-1 text-muted hover:text-danger rounded"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Transaction Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Transaction"
      >
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="flex gap-2">
            {(["expense", "income"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setForm({ ...form, type: t, category_id: "" })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize ${
                  form.type === t
                    ? t === "income"
                      ? "bg-success text-white"
                      : "bg-danger text-white"
                    : "bg-gray-100"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Amount</label>
            <input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
              placeholder="0.00"
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select category</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Description <span className="text-muted font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What was this for?"
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 px-4 bg-primary text-white rounded-lg hover:bg-primary-hover font-medium"
          >
            Add Transaction
          </button>
        </form>
      </Modal>
    </div>
  );
}
