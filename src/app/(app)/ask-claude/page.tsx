"use client";

import { createClient } from "@/lib/supabase/client";
import { formatCurrency, getOrdinalDay } from "@/lib/format";
import type { Bill, Debt, Transaction, Profile, HouseholdMember } from "@/lib/types";
import { MessageSquare, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

const PROMPT_TEMPLATES = [
  {
    label: "Next Paycheck Plan",
    prompt: (ctx: string) =>
      `I need help planning my next paycheck. Here's my current financial situation:\n\n${ctx}\n\nBased on my bills, debts, and spending, can you suggest how I should allocate my next paycheck? Prioritize bills due soon, minimum debt payments, and essential expenses.`,
  },
  {
    label: "Bill Reminders",
    prompt: (ctx: string) =>
      `Here are my current bills and financial situation:\n\n${ctx}\n\nWhich bills are coming up soon? Are there any I should be worried about? Give me a quick reminder list.`,
  },
  {
    label: "Debt Payoff Strategy",
    prompt: (ctx: string) =>
      `Here's my current debt situation:\n\n${ctx}\n\nCan you suggest a debt payoff strategy? Compare avalanche (highest interest first) vs snowball (smallest balance first) methods for my specific debts and recommend which is better for me.`,
  },
  {
    label: "Monthly Budget Review",
    prompt: (ctx: string) =>
      `Here's my financial data for this month:\n\n${ctx}\n\nCan you review my spending and give me a brief budget analysis? Where am I overspending? Where can I cut back?`,
  },
  {
    label: "Custom Question",
    prompt: (ctx: string) =>
      `Here's my current financial situation:\n\n${ctx}\n\n[YOUR QUESTION HERE]`,
  },
];

export default function AskClaudePage() {
  const [context, setContext] = useState("");
  const [selectedPrompt, setSelectedPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => { buildContext(); }, []);

  async function buildContext() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles").select("*").eq("id", user.id).single();
    if (!profile?.household_id) {
      setLoading(false);
      return;
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    const monthStart = startOfMonth.toISOString().split("T")[0];

    const [txRes, billsRes, debtsRes, membersRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("*, category:categories(name)")
        .eq("household_id", profile.household_id)
        .gte("date", monthStart)
        .order("date", { ascending: false }),
      supabase
        .from("bills").select("*")
        .eq("household_id", profile.household_id)
        .eq("is_active", true)
        .order("due_day"),
      supabase
        .from("debts").select("*")
        .eq("household_id", profile.household_id)
        .eq("is_active", true)
        .order("current_balance", { ascending: false }),
      supabase
        .from("household_members").select("*")
        .eq("household_id", profile.household_id)
        .eq("is_active", true)
        .order("created_at"),
    ]);

    const transactions: Transaction[] = txRes.data || [];
    const bills: Bill[] = billsRes.data || [];
    const debts: Debt[] = debtsRes.data || [];

    const totalIncome = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpenses = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    let ctx = `=== MONTHLY SUMMARY (${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}) ===\n`;
    ctx += `Income: ${formatCurrency(totalIncome)}\n`;
    ctx += `Expenses: ${formatCurrency(totalExpenses)}\n`;
    ctx += `Net: ${formatCurrency(totalIncome - totalExpenses)}\n`;

    const hMembers: HouseholdMember[] = membersRes.data || [];
    if (hMembers.length > 0) {
      ctx += `\n=== HOUSEHOLD MEMBERS ===\n`;
      hMembers.forEach((m) => {
        ctx += `- ${m.name}`;
        if (m.pay_frequency) ctx += ` (paid ${m.pay_frequency}`;
        if (m.next_pay_date) ctx += `, next: ${m.next_pay_date}`;
        if (m.pay_frequency) ctx += `)`;
        ctx += `\n`;
      });
    }

    if (bills.length > 0) {
      ctx += `\n=== BILLS (${bills.length} active) ===\n`;
      bills.forEach((b) => {
        const dueInfo = b.due_day ? `due on the ${getOrdinalDay(b.due_day)}` : b.next_due_date ? `next due ${b.next_due_date}` : "no set date";
        ctx += `- ${b.name}: ${formatCurrency(b.amount)} ${dueInfo} (${b.schedule_type || b.frequency})${b.is_autopay ? " [autopay]" : ""}${b.paid_by === "wife" ? " [wife pays]" : ""}\n`;
      });
      ctx += `Total monthly bills: ${formatCurrency(bills.reduce((s, b) => s + Number(b.amount), 0))}\n`;
    }

    if (debts.length > 0) {
      ctx += `\n=== DEBTS (${debts.length} active) ===\n`;
      debts.forEach((d) => {
        ctx += `- ${d.name} (${d.type}): ${formatCurrency(d.current_balance)} balance, ${d.interest_rate}% APR, min payment ${formatCurrency(d.minimum_payment)}/mo\n`;
      });
      ctx += `Total debt: ${formatCurrency(debts.reduce((s, d) => s + Number(d.current_balance), 0))}\n`;
      ctx += `Total minimum payments: ${formatCurrency(debts.reduce((s, d) => s + Number(d.minimum_payment), 0))}/mo\n`;
    }

    if (transactions.length > 0) {
      ctx += `\n=== RECENT TRANSACTIONS ===\n`;
      transactions.slice(0, 20).forEach((t) => {
        const catName = t.category?.name || "Uncategorized";
        ctx += `- ${t.date}: ${t.type === "income" ? "+" : "-"}${formatCurrency(t.amount)} ${catName}${t.description ? ` (${t.description})` : ""}\n`;
      });
    }

    setContext(ctx);
    setLoading(false);
  }

  function getFullPrompt(template: typeof PROMPT_TEMPLATES[0]) {
    return template.prompt(context);
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function openInClaude(text: string) {
    const encoded = encodeURIComponent(text);
    window.open(`https://claude.ai/new?q=${encoded}`, "_blank");
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-muted">Loading...</div></div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="text-primary" /> Ask Claude
        </h1>
        <p className="text-muted">
          Get AI-powered financial advice using your data. Choose a prompt below
          to open Claude with your financial context.
        </p>
      </div>

      {/* Prompt Templates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PROMPT_TEMPLATES.map((template) => (
          <button
            key={template.label}
            onClick={() => setSelectedPrompt(template.label)}
            className={`text-left p-4 rounded-xl border transition-all ${
              selectedPrompt === template.label
                ? "border-primary bg-blue-50 ring-2 ring-primary/20"
                : "border-border bg-card hover:border-primary/50"
            }`}
          >
            <p className="font-medium">{template.label}</p>
          </button>
        ))}
      </div>

      {/* Selected Prompt Preview */}
      {selectedPrompt && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{selectedPrompt}</h2>
            <button
              onClick={buildContext}
              className="flex items-center gap-1 text-sm text-muted hover:text-primary"
            >
              <RefreshCw size={14} /> Refresh data
            </button>
          </div>

          <pre className="bg-gray-50 p-4 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
            {getFullPrompt(PROMPT_TEMPLATES.find((t) => t.label === selectedPrompt)!)}
          </pre>

          <div className="flex gap-3">
            <button
              onClick={() =>
                openInClaude(
                  getFullPrompt(PROMPT_TEMPLATES.find((t) => t.label === selectedPrompt)!)
                )
              }
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover"
            >
              <ExternalLink size={18} /> Open in Claude
            </button>
            <button
              onClick={() =>
                copyToClipboard(
                  getFullPrompt(PROMPT_TEMPLATES.find((t) => t.label === selectedPrompt)!)
                )
              }
              className="flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg hover:bg-gray-50"
            >
              <Copy size={18} /> {copied ? "Copied!" : "Copy to Clipboard"}
            </button>
          </div>
        </div>
      )}

      {/* Raw Context */}
      <details className="bg-card rounded-xl border border-border">
        <summary className="p-4 cursor-pointer font-medium text-muted hover:text-foreground">
          View raw financial data being sent
        </summary>
        <pre className="p-4 pt-0 text-sm overflow-x-auto whitespace-pre-wrap text-muted">
          {context || "No financial data yet. Add transactions, bills, and debts first."}
        </pre>
      </details>
    </div>
  );
}
