"use client";

import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import type { Snapshot, SnapshotBalance } from "@/lib/types";
import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from "recharts";

interface ChartData {
  date: string;
  label: string;
  netWorth: number;
  totalAssets: number;
  totalDebt: number;
  ccDebt: number;
  [key: string]: string | number;
}

const COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
  "#14b8a6", "#e11d48", "#a855f7", "#0ea5e9", "#65a30d",
  "#d946ef",
];

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted">{entry.name}:</span>
          <span className="font-medium">{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ChartsPage() {
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [debtNames, setDebtNames] = useState<string[]>([]);
  const [assetNames, setAssetNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: prof } = await supabase
      .from("profiles").select("household_id").eq("id", user.id).single();
    if (!prof?.household_id) return;

    const { data: snaps } = await supabase
      .from("snapshots")
      .select("*, balances:snapshot_balances(*)")
      .eq("household_id", prof.household_id)
      .order("date", { ascending: true });

    if (!snaps || snaps.length === 0) {
      setLoading(false);
      return;
    }

    const allDebtNames = new Set<string>();
    const allAssetNames = new Set<string>();

    const data: ChartData[] = snaps.map((snap: Snapshot) => {
      const balances = snap.balances || [];
      const assets = balances.filter((b: SnapshotBalance) => b.account_type === "asset");
      const debts = balances.filter((b: SnapshotBalance) => b.account_type === "debt");

      const totalAssets = assets.reduce((s: number, b: SnapshotBalance) => s + Number(b.balance), 0);
      const totalDebt = debts.reduce((s: number, b: SnapshotBalance) => s + Number(b.balance), 0);
      const ccDebt = debts
        .filter((b: SnapshotBalance) =>
          b.account_name.includes("CC") ||
          b.account_name.includes("Card") ||
          b.account_name.includes("Slate") ||
          b.account_name.includes("Freedom")
        )
        .reduce((s: number, b: SnapshotBalance) => s + Number(b.balance), 0);

      const row: ChartData = {
        date: new Date(snap.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        label: snap.label || snap.date,
        netWorth: totalAssets - totalDebt,
        totalAssets,
        totalDebt,
        ccDebt,
      };

      balances.forEach((b: SnapshotBalance) => {
        row[b.account_name] = Number(b.balance);
        if (b.account_type === "debt") allDebtNames.add(b.account_name);
        if (b.account_type === "asset") allAssetNames.add(b.account_name);
      });

      return row;
    });

    setChartData(data);
    setDebtNames(Array.from(allDebtNames));
    setAssetNames(Array.from(allAssetNames));
    setLoading(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-muted">Loading...</div></div>;
  }

  if (chartData.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Charts</h1>
        <div className="bg-card rounded-xl border border-border p-8 text-center text-muted">
          No history data yet. Record payday snapshots in the History page first.
        </div>
      </div>
    );
  }

  const latest = chartData[chartData.length - 1];
  const first = chartData[0];
  const nwChange = latest.netWorth - first.netWorth;
  const debtChange = latest.totalDebt - first.totalDebt;

  const gridColor = "var(--border)";

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Charts</h1>
        <p className="text-muted">
          Tracking {chartData.length} snapshots · Net worth change:{" "}
          <span className={nwChange >= 0 ? "text-success font-medium" : "text-danger font-medium"}>
            {nwChange >= 0 ? "+" : ""}{formatCurrency(nwChange)}
          </span>
          {" · "}Debt change:{" "}
          <span className={debtChange <= 0 ? "text-success font-medium" : "text-danger font-medium"}>
            {debtChange <= 0 ? "" : "+"}{formatCurrency(debtChange)}
          </span>
        </p>
      </div>

      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="text-lg font-semibold mb-4">Net Worth Over Time</h2>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--muted)" />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} stroke="var(--muted)" />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="netWorth" name="Net Worth" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="text-lg font-semibold mb-4">Assets vs Total Debt</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--muted)" />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} stroke="var(--muted)" />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="totalAssets" name="Total Assets" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="totalDebt" name="Total Debt" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="text-lg font-semibold mb-4">Credit Card Debt</h2>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--muted)" />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}K`} stroke="var(--muted)" />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="ccDebt" name="CC Debt" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="text-lg font-semibold mb-4">Individual Debt Balances</h2>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--muted)" />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} stroke="var(--muted)" />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {debtNames.map((name, i) => (
              <Line key={name} type="monotone" dataKey={name} name={name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {assetNames.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-lg font-semibold mb-4">Asset Balances</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--muted)" />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} stroke="var(--muted)" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              {assetNames.map((name, i) => (
                <Bar key={name} dataKey={name} name={name} fill={COLORS[i % COLORS.length]} stackId="assets" />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
