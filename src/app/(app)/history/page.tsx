"use client";

import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { getTodayString } from "@/lib/timezone";
import type { Profile, Snapshot, SnapshotBalance, TrackedAccount } from "@/lib/types";
import Modal from "@/components/Modal";
import { Plus, Trash2, Pencil, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";

export default function HistoryPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [trackedAccounts, setTrackedAccounts] = useState<TrackedAccount[]>([]);
  const [ccAccountNames, setCcAccountNames] = useState<Set<string>>(new Set());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    date: getTodayString(),
    label: "",
    notes: "",
    balances: [] as Array<{ name: string; type: "asset" | "debt"; balance: string; sort_order: number }>,
  });

  useEffect(() => { load(); }, []);

  async function load() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: prof } = await supabase
      .from("profiles").select("*").eq("id", user.id).single();
    if (!prof?.household_id) return;
    setProfile(prof);

    const [snapsRes, accountsRes] = await Promise.all([
      supabase
        .from("snapshots")
        .select("*, balances:snapshot_balances(*)")
        .eq("household_id", prof.household_id)
        .order("date", { ascending: false }),
      supabase
        .from("tracked_accounts")
        .select("*")
        .eq("household_id", prof.household_id)
        .eq("is_active", true)
        .order("sort_order"),
    ]);

    setSnapshots(snapsRes.data || []);
    const allAccounts: TrackedAccount[] = accountsRes.data || [];
    setTrackedAccounts(allAccounts);
    setCcAccountNames(new Set(
      allAccounts
        .filter((a) => a.debt_category === "credit_card")
        .map((a) => a.name)
    ));
    setLoading(false);
  }

  function openModal() {
    const latest = snapshots.length > 0 ? snapshots[0] : null;

    const balances = trackedAccounts.map((a) => {
      const prevBal = latest?.balances?.find((b) => b.account_name === a.name);
      return {
        name: a.name,
        type: a.account_type,
        balance: prevBal ? String(prevBal.balance) : "",
        sort_order: a.sort_order,
      };
    });

    setEditingId(null);
    setForm({
      date: getTodayString(),
      label: "",
      notes: "",
      balances,
    });
    setModalOpen(true);
  }

  function openEdit(snap: Snapshot) {
    const balances = trackedAccounts.map((a) => {
      const existing = snap.balances?.find((b) => b.account_name === a.name);
      return {
        name: a.name,
        type: a.account_type,
        balance: existing ? String(existing.balance) : "",
        sort_order: a.sort_order,
      };
    });

    // Include any accounts in the snapshot that aren't in current tracked accounts
    const trackedNames = new Set(trackedAccounts.map((a) => a.name));
    for (const b of snap.balances || []) {
      if (!trackedNames.has(b.account_name)) {
        balances.push({
          name: b.account_name,
          type: b.account_type,
          balance: String(b.balance),
          sort_order: b.sort_order,
        });
      }
    }

    setEditingId(snap.id);
    setForm({
      date: snap.date,
      label: snap.label || "",
      notes: snap.notes || "",
      balances,
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.household_id) return;

    const supabase = createClient();

    const balanceRows = form.balances
      .filter((b) => b.balance !== "" && b.balance !== "0")
      .map((b) => ({
        snapshot_id: "", // filled below
        account_name: b.name,
        account_type: b.type,
        balance: parseFloat(b.balance),
        sort_order: b.sort_order,
      }));

    if (editingId) {
      // Update existing snapshot
      await supabase
        .from("snapshots")
        .update({ date: form.date, label: form.label || null, notes: form.notes || null })
        .eq("id", editingId);

      // Replace all balances: delete old, insert new
      await supabase.from("snapshot_balances").delete().eq("snapshot_id", editingId);
      if (balanceRows.length > 0) {
        await supabase.from("snapshot_balances").insert(
          balanceRows.map((b) => ({ ...b, snapshot_id: editingId }))
        );
      }
    } else {
      // Create new snapshot
      const { data: snapshot, error: snapError } = await supabase
        .from("snapshots")
        .insert({
          household_id: profile.household_id,
          date: form.date,
          label: form.label || null,
          notes: form.notes || null,
        })
        .select("id")
        .single();

      if (snapError || !snapshot) return;

      if (balanceRows.length > 0) {
        await supabase.from("snapshot_balances").insert(
          balanceRows.map((b) => ({ ...b, snapshot_id: snapshot.id }))
        );
      }
    }

    setModalOpen(false);
    setEditingId(null);
    load();
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    await supabase.from("snapshot_balances").delete().eq("snapshot_id", id);
    await supabase.from("snapshots").delete().eq("id", id);
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
  }

  function calcTotals(balances: SnapshotBalance[]) {
    const totalAssets = balances
      .filter((b) => b.account_type === "asset")
      .reduce((sum, b) => sum + Number(b.balance), 0);
    const totalDebt = balances
      .filter((b) => b.account_type === "debt")
      .reduce((sum, b) => sum + Number(b.balance), 0);
    const ccDebt = balances
      .filter((b) => b.account_type === "debt" && ccAccountNames.has(b.account_name))
      .reduce((sum, b) => sum + Number(b.balance), 0);
    return { totalAssets, totalDebt, netWorth: totalAssets - totalDebt, ccDebt };
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-muted">Loading...</div></div>;
  }

  const assetAccounts = form.balances.filter((b) => b.type === "asset");
  const debtAccounts = form.balances.filter((b) => b.type === "debt");

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">History Ledger</h1>
          <p className="text-muted">Record your balances every payday</p>
          {trackedAccounts.length === 0 && (
            <p className="text-warning text-sm">Set up tracked accounts in Settings first</p>
          )}
        </div>
        <button
          onClick={openModal}
          disabled={trackedAccounts.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50"
        >
          <Plus size={18} /> Record Payday
        </button>
      </div>

      {snapshots.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-8 text-center text-muted">
          No snapshots yet. Click &quot;Record Payday&quot; after each paycheck to start tracking.
        </div>
      ) : (
        <div className="space-y-3">
          {snapshots.map((snap, idx) => {
            const balances = snap.balances || [];
            const totals = calcTotals(balances);
            const prevSnap = snapshots[idx + 1];
            const prevTotals = prevSnap?.balances ? calcTotals(prevSnap.balances) : null;
            const nwChange = prevTotals ? totals.netWorth - prevTotals.netWorth : null;
            const isExpanded = expandedId === snap.id;

            return (
              <div key={snap.id} className="bg-card rounded-xl border border-border overflow-hidden">
                <div
                  onClick={() => setExpandedId(isExpanded ? null : snap.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpandedId(isExpanded ? null : snap.id); }}
                  className="w-full flex items-center justify-between p-4 hover:bg-accent text-left cursor-pointer"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{formatDate(snap.date)}</span>
                      {snap.label && <span className="text-sm text-muted">{snap.label}</span>}
                    </div>
                    <div className="flex gap-4 mt-1 text-sm flex-wrap">
                      <span>Net Worth: <strong className={totals.netWorth >= 0 ? "text-success" : "text-danger"}>{formatCurrency(totals.netWorth)}</strong></span>
                      {nwChange !== null && (
                        <span className={nwChange >= 0 ? "text-success" : "text-danger"}>
                          {nwChange >= 0 ? "+" : ""}{formatCurrency(nwChange)}
                        </span>
                      )}
                      <span className="text-muted">Debt: {formatCurrency(totals.totalDebt)}</span>
                      <span className="text-muted hidden sm:inline">CC: {formatCurrency(totals.ccDebt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(snap); }}
                      className="p-1 text-muted hover:text-primary"
                      title="Edit snapshot"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(snap.id); }}
                      className="p-1 text-muted hover:text-danger"
                      title="Delete snapshot"
                    >
                      <Trash2 size={16} />
                    </button>
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="font-medium text-success mb-2">Assets</h3>
                        <div className="space-y-1">
                          {balances.filter((b) => b.account_type === "asset").map((b) => (
                            <div key={b.id} className="flex justify-between text-sm">
                              <span>{b.account_name}</span>
                              <span className="font-medium">{formatCurrency(b.balance)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-sm font-semibold border-t border-border pt-1 mt-1">
                            <span>Total Assets</span>
                            <span className="text-success">{formatCurrency(totals.totalAssets)}</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h3 className="font-medium text-danger mb-2">Debts</h3>
                        <div className="space-y-1">
                          {balances.filter((b) => b.account_type === "debt").map((b) => (
                            <div key={b.id} className="flex justify-between text-sm">
                              <span>{b.account_name}</span>
                              <span className="font-medium">{formatCurrency(b.balance)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-sm font-semibold border-t border-border pt-1 mt-1">
                            <span>Total Debt</span>
                            <span className="text-danger">{formatCurrency(totals.totalDebt)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    {snap.notes && (
                      <p className="text-sm text-muted mt-3 italic">{snap.notes}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditingId(null); }} title={editingId ? "Edit Snapshot" : "Record Payday Snapshot"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Label</label>
              <input type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. May 15 payday" className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>

          {assetAccounts.length > 0 && (
            <div>
              <h3 className="font-medium text-success mb-2">Assets</h3>
              <div className="space-y-2">
                {assetAccounts.map((account) => (
                  <div key={account.name} className="flex items-center gap-3">
                    <label className="text-sm w-36 shrink-0">{account.name}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={account.balance}
                      onChange={(e) => {
                        setForm((prev) => ({
                          ...prev,
                          balances: prev.balances.map((b) =>
                            b.name === account.name ? { ...b, balance: e.target.value } : b
                          ),
                        }));
                      }}
                      placeholder="0.00"
                      className="flex-1 px-3 py-1.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {debtAccounts.length > 0 && (
            <div>
              <h3 className="font-medium text-danger mb-2">Debts</h3>
              <div className="space-y-2">
                {debtAccounts.map((account) => (
                  <div key={account.name} className="flex items-center gap-3">
                    <label className="text-sm w-44 shrink-0">{account.name}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={account.balance}
                      onChange={(e) => {
                        setForm((prev) => ({
                          ...prev,
                          balances: prev.balances.map((b) =>
                            b.name === account.name ? { ...b, balance: e.target.value } : b
                          ),
                        }));
                      }}
                      placeholder="0.00"
                      className="flex-1 px-3 py-1.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Notes <span className="text-muted font-normal">(optional)</span></label>
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything notable this period" className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>

          <button type="submit" className="w-full py-2 px-4 bg-primary text-white rounded-lg hover:bg-primary-hover font-medium">
            {editingId ? "Save Changes" : "Save Snapshot"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
