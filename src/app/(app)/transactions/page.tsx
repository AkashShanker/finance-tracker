"use client";

import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { getTodayString, parseLocalDate } from "@/lib/timezone";
import type { Transaction, Category, Profile, TrackedAccount } from "@/lib/types";
import Modal from "@/components/Modal";
import { Plus, Trash2, Pencil, ChevronDown, ChevronUp, CreditCard } from "lucide-react";
import { useEffect, useState, useMemo } from "react";

type DatePreset = "all" | "this_week" | "this_month" | "this_year" | "custom";

function getDateRange(preset: DatePreset, customStart: string, customEnd: string): { start: string; end: string } | null {
  if (preset === "all") return null;
  if (preset === "custom") {
    return customStart && customEnd ? { start: customStart, end: customEnd } : null;
  }
  const today = new Date(getTodayString() + "T00:00:00");
  let start: Date;
  if (preset === "this_week") {
    const day = today.getDay();
    start = new Date(today);
    start.setDate(today.getDate() - day);
  } else if (preset === "this_month") {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
  } else {
    start = new Date(today.getFullYear(), 0, 1);
  }
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(today) };
}

interface CategorySummary {
  category_id: string | null;
  name: string;
  icon: string;
  total: number;
  count: number;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<TrackedAccount[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showSummary, setShowSummary] = useState(false);

  const [form, setForm] = useState({
    amount: "",
    type: "expense" as "income" | "expense",
    category_id: "",
    description: "",
    date: getTodayString(),
    payment_method_id: "",
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

    let txRes = await supabase
      .from("transactions")
      .select("*, category:categories(*), payment_method:tracked_accounts(*)")
      .eq("household_id", prof.household_id)
      .order("date", { ascending: false })
      .limit(500);

    if (txRes.error) {
      txRes = await supabase
        .from("transactions")
        .select("*, category:categories(*)")
        .eq("household_id", prof.household_id)
        .order("date", { ascending: false })
        .limit(500);
    }

    const [catRes, acctRes] = await Promise.all([
      supabase
        .from("categories")
        .select("*")
        .eq("household_id", prof.household_id)
        .order("name"),
      supabase
        .from("tracked_accounts")
        .select("*")
        .eq("household_id", prof.household_id)
        .eq("is_active", true)
        .order("sort_order"),
    ]);

    setTransactions(txRes.data || []);
    setCategories(catRes.data || []);
    setAccounts(acctRes.data || []);
    setLoading(false);
  }

  function openAdd() {
    setEditingTx(null);
    setForm({
      amount: "",
      type: "expense",
      category_id: "",
      description: "",
      date: getTodayString(),
      payment_method_id: "",
    });
    setModalOpen(true);
  }

  function openEdit(tx: Transaction) {
    setEditingTx(tx);
    setForm({
      amount: String(tx.amount),
      type: tx.type,
      category_id: tx.category_id || "",
      description: tx.description || "",
      date: tx.date,
      payment_method_id: tx.payment_method_id || "",
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.household_id) return;
    const supabase = createClient();

    const payload: Record<string, unknown> = {
      amount: parseFloat(form.amount),
      type: form.type,
      category_id: form.category_id || null,
      description: form.description || null,
      date: form.date,
    };
    if (form.payment_method_id) {
      payload.payment_method_id = form.payment_method_id;
    }

    if (editingTx) {
      const res = await supabase
        .from("transactions")
        .update(payload)
        .eq("id", editingTx.id);
      if (res.error && form.payment_method_id) {
        delete payload.payment_method_id;
        await supabase.from("transactions").update(payload).eq("id", editingTx.id);
      }
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const res = await supabase.from("transactions").insert({
        ...payload,
        household_id: profile.household_id,
        user_id: user.id,
      });
      if (res.error && form.payment_method_id) {
        delete payload.payment_method_id;
        await supabase.from("transactions").insert({
          ...payload,
          household_id: profile.household_id,
          user_id: user.id,
        });
      }
    }

    setModalOpen(false);
    setEditingTx(null);
    load();
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    await supabase.from("transactions").delete().eq("id", id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }

  const dateRange = useMemo(
    () => getDateRange(datePreset, customStart, customEnd),
    [datePreset, customStart, customEnd]
  );

  const filtered = useMemo(() => {
    let result = transactions;
    if (filterType !== "all") {
      result = result.filter((t) => t.type === filterType);
    }
    if (dateRange) {
      result = result.filter((t) => t.date >= dateRange.start && t.date <= dateRange.end);
    }
    return result;
  }, [transactions, filterType, dateRange]);

  const categorySummary = useMemo((): CategorySummary[] => {
    const map = new Map<string, CategorySummary>();
    for (const tx of filtered) {
      if (tx.type !== "expense") continue;
      const key = tx.category_id || "__none__";
      const existing = map.get(key);
      if (existing) {
        existing.total += Number(tx.amount);
        existing.count += 1;
      } else {
        map.set(key, {
          category_id: tx.category_id,
          name: tx.category?.name || "Uncategorized",
          icon: tx.category?.icon || "📦",
          total: Number(tx.amount),
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const totalExpenses = useMemo(
    () => categorySummary.reduce((sum, c) => sum + c.total, 0),
    [categorySummary]
  );

  const filteredCategories = categories.filter((c) => c.type === form.type);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-muted">Loading...</div></div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transactions</h1>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
        >
          <Plus size={18} /> Add
        </button>
      </div>

      {/* Type Filter */}
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

      {/* Date Range Filter */}
      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {([
            ["all", "All Time"],
            ["this_week", "This Week"],
            ["this_month", "This Month"],
            ["this_year", "This Year"],
            ["custom", "Custom"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setDatePreset(key as DatePreset)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                datePreset === key
                  ? "bg-primary text-white"
                  : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {datePreset === "custom" && (
          <div className="flex gap-3 items-center">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="text-muted text-sm">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )}
      </div>

      {/* Category Expense Summary (collapsible) */}
      {filtered.some((t) => t.type === "expense") && (
        <div className="bg-card rounded-xl border border-border">
          <button
            onClick={() => setShowSummary(!showSummary)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <div className="flex items-center gap-3">
              <span className="font-semibold">Expense Summary</span>
              <span className="text-sm text-muted">
                {formatCurrency(totalExpenses)} across {categorySummary.length} {categorySummary.length === 1 ? "category" : "categories"}
              </span>
            </div>
            {showSummary ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          {showSummary && (
            <div className="border-t border-border divide-y divide-border">
              {categorySummary.map((cat) => (
                <div key={cat.category_id || "__none__"} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span>{cat.icon}</span>
                    <span className="font-medium">{cat.name}</span>
                    <span className="text-sm text-muted">({cat.count})</span>
                  </div>
                  <span className="font-semibold text-danger">{formatCurrency(cat.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Transaction List */}
      <div className="bg-card rounded-xl border border-border divide-y divide-border">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted">
            No transactions found for this period.
          </div>
        ) : (
          <>
            <div className="px-4 py-2 text-sm text-muted bg-gray-50 rounded-t-xl">
              {filtered.length} transaction{filtered.length !== 1 ? "s" : ""}
            </div>
            {filtered.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between p-4 hover:bg-gray-50 group">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(tx)}>
                  <p className="font-medium truncate">
                    {tx.category?.icon}{" "}
                    {tx.description || tx.category?.name || "Transaction"}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <span>{formatDate(tx.date)}</span>
                    {tx.payment_method && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <CreditCard size={12} />
                          {tx.payment_method.name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-semibold ${
                      tx.type === "income" ? "text-success" : "text-danger"
                    }`}
                  >
                    {tx.type === "income" ? "+" : "-"}
                    {formatCurrency(tx.amount)}
                  </span>
                  <button
                    onClick={() => openEdit(tx)}
                    className="p-1 text-muted hover:text-primary rounded"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(tx.id)}
                    className="p-1 text-muted hover:text-danger rounded"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Add / Edit Transaction Modal */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingTx(null); }}
        title={editingTx ? "Edit Transaction" : "Add Transaction"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
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
          {form.type === "expense" && accounts.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Paid With <span className="text-muted font-normal">(optional)</span>
              </label>
              <select
                value={form.payment_method_id}
                onChange={(e) => setForm({ ...form, payment_method_id: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select card / account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}
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
            {editingTx ? "Save Changes" : "Add Transaction"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
