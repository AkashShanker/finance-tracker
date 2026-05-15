"use client";

import { createClient } from "@/lib/supabase/client";
import type { Profile, Household, HouseholdMember, TrackedAccount } from "@/lib/types";
import { Copy, Users, User, Plus, Trash2, Pencil, X, Check, GripVertical, AlertTriangle, Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TIMEZONE_OPTIONS } from "@/lib/timezone";

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [accounts, setAccounts] = useState<TrackedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");

  // Profile form
  const [form, setForm] = useState({
    display_name: "",
    pay_frequency: "biweekly" as Profile["pay_frequency"],
    next_pay_date: "",
    timezone: "America/New_York",
  });

  // Add member
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editMemberName, setEditMemberName] = useState("");
  const [editMemberEmail, setEditMemberEmail] = useState("");
  const [editMemberPayFreq, setEditMemberPayFreq] = useState<string>("");
  const [editMemberPayDate, setEditMemberPayDate] = useState("");

  // Join household
  const [joinCode, setJoinCode] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinMessage, setJoinMessage] = useState("");

  // Transfer ownership
  const [transferTo, setTransferTo] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferMessage, setTransferMessage] = useState("");

  // Delete account
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  // Add account
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccount, setNewAccount] = useState({ name: "", account_type: "asset" as "asset" | "debt", owner_member_id: "" });

  useEffect(() => { load(); }, []);

  async function load() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    if (!prof) return;
    setProfile(prof);
    setForm({
      display_name: prof.display_name || "",
      pay_frequency: prof.pay_frequency || "biweekly",
      next_pay_date: prof.next_pay_date || "",
      timezone: prof.timezone || "America/New_York",
    });

    if (prof.household_id) {
      const [householdRes, membersRes, accountsRes] = await Promise.all([
        supabase.from("households").select("*").eq("id", prof.household_id).single(),
        supabase.from("household_members").select("*").eq("household_id", prof.household_id).order("created_at"),
        supabase.from("tracked_accounts").select("*").eq("household_id", prof.household_id).order("sort_order"),
      ]);
      setHousehold(householdRes.data);
      setMembers(membersRes.data || []);
      setAccounts(accountsRes.data || []);
    }
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({
      display_name: form.display_name || null,
      pay_frequency: form.pay_frequency,
      next_pay_date: form.next_pay_date || null,
      timezone: form.timezone,
    }).eq("id", profile.id);

    // Also sync pay schedule to the user's household_member record
    const myMember = members.find((m) => m.profile_id === profile.id);
    if (myMember) {
      await supabase.from("household_members").update({
        pay_frequency: form.pay_frequency,
        next_pay_date: form.next_pay_date || null,
      }).eq("id", myMember.id);
    }

    setMessage(error ? "Failed to save: " + error.message : "Settings saved!");
    setSaving(false);
    load();
    setTimeout(() => setMessage(""), 3000);
  }

  // ---- MEMBERS ----
  async function addMember() {
    if (!newMemberName.trim() || !profile?.household_id) return;
    const supabase = createClient();
    await supabase.from("household_members").insert({
      household_id: profile.household_id,
      name: newMemberName.trim(),
      email: newMemberEmail.trim().toLowerCase() || null,
    });
    setNewMemberName("");
    setNewMemberEmail("");
    load();
  }

  async function updateMember(id: string) {
    if (!editMemberName.trim()) return;
    const supabase = createClient();
    await supabase.from("household_members").update({
      name: editMemberName.trim(),
      email: editMemberEmail.trim().toLowerCase() || null,
      pay_frequency: editMemberPayFreq || null,
      next_pay_date: editMemberPayDate || null,
    }).eq("id", id);
    setEditingMemberId(null);
    load();
  }

  async function deleteMember(id: string) {
    const supabase = createClient();
    await supabase.from("household_members").delete().eq("id", id);
    load();
  }

  // ---- TRACKED ACCOUNTS ----
  async function addAccount() {
    if (!newAccount.name.trim() || !profile?.household_id) return;
    const supabase = createClient();
    const maxSort = accounts.reduce((max, a) => Math.max(max, a.sort_order), 0);
    await supabase.from("tracked_accounts").insert({
      household_id: profile.household_id,
      name: newAccount.name.trim(),
      account_type: newAccount.account_type,
      owner_member_id: newAccount.owner_member_id || null,
      sort_order: maxSort + 1,
    });
    setNewAccount({ name: "", account_type: "asset", owner_member_id: "" });
    setShowAddAccount(false);
    load();
  }

  async function toggleAccount(id: string, is_active: boolean) {
    const supabase = createClient();
    await supabase.from("tracked_accounts").update({ is_active: !is_active }).eq("id", id);
    setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, is_active: !a.is_active } : a));
  }

  async function deleteAccount(id: string) {
    const supabase = createClient();
    await supabase.from("tracked_accounts").delete().eq("id", id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }

  async function copyInviteCode() {
    if (!household?.invite_code) return;
    await navigator.clipboard.writeText(household.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function joinHousehold() {
    if (!joinCode.trim() || !profile) return;
    setJoinLoading(true);
    setJoinMessage("");

    const supabase = createClient();
    const { data: result, error } = await supabase.rpc("join_household_by_code", {
      p_user_id: profile.id,
      p_invite_code: joinCode.trim(),
    });

    if (error) {
      setJoinMessage("Failed: " + error.message);
      setJoinLoading(false);
      return;
    }

    if (result?.error) {
      setJoinMessage(result.error);
      setJoinLoading(false);
      return;
    }

    setJoinMessage("Joined household successfully! Reloading...");
    setJoinCode("");
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }

  async function transferOwnership() {
    if (!transferTo || !profile) return;
    setTransferring(true);
    setTransferMessage("");

    const supabase = createClient();
    const { data: result, error } = await supabase.rpc("transfer_household_ownership", {
      p_current_owner_id: profile.id,
      p_new_owner_id: transferTo,
    });

    if (error || result?.error) {
      setTransferMessage("Failed: " + (error?.message || result?.error));
    } else {
      setTransferMessage("Ownership transferred!");
      setTransferTo("");
      load();
    }
    setTransferring(false);
    setTimeout(() => setTransferMessage(""), 3000);
  }

  const isOwner = household?.owner_id === profile?.id;

  async function handleDeleteAccount() {
    if (!profile) return;
    setDeleting(true);
    const supabase = createClient();

    if (isOwner) {
      const { data: result, error } = await supabase.rpc("delete_household", {
        p_user_id: profile.id,
      });
      if (error || result?.error) {
        alert("Failed: " + (error?.message || result?.error));
        setDeleting(false);
        return;
      }
    } else {
      const { data: result, error } = await supabase.rpc("delete_my_account", {
        p_user_id: profile.id,
      });
      if (error || result?.error) {
        alert("Failed: " + (error?.message || result?.error));
        setDeleting(false);
        return;
      }
    }

    await supabase.auth.signOut();
    router.push("/login");
  }

  function getMemberName(id: string | null) {
    if (!id) return "Shared";
    return members.find((m) => m.id === id)?.name || "Unknown";
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-muted">Loading...</div></div>;
  }

  const activeMembers = members.filter((m) => m.is_active);
  const assetAccounts = accounts.filter((a) => a.account_type === "asset");
  const debtAccounts = accounts.filter((a) => a.account_type === "debt");

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Profile */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><User size={20} /> Profile</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Display Name</label>
            <input type="text" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Your name" className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Pay Frequency</label>
            <select value={form.pay_frequency} onChange={(e) => setForm({ ...form, pay_frequency: e.target.value as Profile["pay_frequency"] })} className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="weekly">Weekly</option>
              <option value="biweekly">Biweekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Next Pay Date</label>
            <input type="date" value={form.next_pay_date} onChange={(e) => setForm({ ...form, next_pay_date: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 flex items-center gap-1"><Globe size={14} /> Timezone</label>
            <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary">
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted mt-1">Used for date calculations across the app</p>
          </div>
          {message && (
            <div className={`text-sm p-2 rounded-lg ${message.includes("Failed") ? "bg-red-50 text-danger" : "bg-green-50 text-success"}`}>{message}</div>
          )}
          <button type="submit" disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 font-medium">
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </form>
      </div>

      {/* Join Household */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="text-lg font-semibold mb-2">Join a Household</h2>
        <p className="text-sm text-muted mb-3">
          Have an invite code from a family member? Enter it to switch to their household and share finances.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Enter invite code"
            className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono tracking-widest"
            onKeyDown={(e) => e.key === "Enter" && joinHousehold()}
          />
          <button
            onClick={joinHousehold}
            disabled={!joinCode.trim() || joinLoading}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 text-sm font-medium"
          >
            {joinLoading ? "Joining..." : "Join"}
          </button>
        </div>
        {joinMessage && (
          <div className={`text-sm p-2 rounded-lg mt-2 ${joinMessage.includes("success") ? "bg-green-50 text-success" : "bg-red-50 text-danger"}`}>
            {joinMessage}
          </div>
        )}
      </div>

      {/* Household Members */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Users size={20} /> Household Members</h2>
        <p className="text-sm text-muted mb-3">Add everyone in your household. They don&apos;t need an account — you can track bills and entries on their behalf.</p>

        <div className="space-y-2 mb-4">
          {activeMembers.map((m) => (
            <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
              {editingMemberId === m.id ? (
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted">Editing Member</span>
                    <button onClick={() => setEditingMemberId(null)} className="p-1 text-muted hover:text-foreground"><X size={16} /></button>
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-0.5">Name</label>
                    <input
                      type="text"
                      value={editMemberName}
                      onChange={(e) => setEditMemberName(e.target.value)}
                      placeholder="Name"
                      className="w-full px-2 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-0.5">Email <span className="font-normal">(for auto-linking on signup)</span></label>
                    <input
                      type="email"
                      value={editMemberEmail}
                      onChange={(e) => setEditMemberEmail(e.target.value)}
                      placeholder="Email address"
                      className="w-full px-2 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-muted mb-0.5">Pay Frequency</label>
                      <select
                        value={editMemberPayFreq}
                        onChange={(e) => setEditMemberPayFreq(e.target.value)}
                        className="w-full px-2 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">Not set</option>
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Biweekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-muted mb-0.5">Next Pay Date</label>
                      <input
                        type="date"
                        value={editMemberPayDate}
                        onChange={(e) => setEditMemberPayDate(e.target.value)}
                        className="w-full px-2 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => updateMember(m.id)} className="px-4 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-hover text-sm font-medium">
                      Save Member
                    </button>
                    <button onClick={() => setEditingMemberId(null)} className="px-4 py-1.5 border border-border rounded-lg text-sm hover:bg-gray-50">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium">
                      {m.name[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{m.name}</p>
                      {m.email && <p className="text-xs text-muted">{m.email}</p>}
                      {m.pay_frequency && (
                        <p className="text-xs text-muted">
                          Paid {m.pay_frequency}{m.next_pay_date ? ` · next: ${m.next_pay_date}` : ""}
                        </p>
                      )}
                      {m.profile_id === profile?.id && (
                        <span className="text-xs text-primary">You (has login)</span>
                      )}
                      {m.profile_id && m.profile_id !== profile?.id && (
                        <span className="text-xs text-success">Has login</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setEditingMemberId(m.id); setEditMemberName(m.name); setEditMemberEmail(m.email || ""); setEditMemberPayFreq(m.pay_frequency || ""); setEditMemberPayDate(m.next_pay_date || ""); }} className="p-1 text-muted hover:text-primary"><Pencil size={14} /></button>
                    {m.profile_id !== profile?.id && (
                      <button onClick={() => deleteMember(m.id)} className="p-1 text-muted hover:text-danger"><Trash2 size={14} /></button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              placeholder="Name (e.g. spouse, kid)"
              className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              onKeyDown={(e) => e.key === "Enter" && addMember()}
            />
            <button onClick={addMember} disabled={!newMemberName.trim()} className="px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 text-sm">
              <Plus size={16} />
            </button>
          </div>
          {newMemberName.trim() && (
            <input
              type="email"
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
              placeholder="Email (optional — for auto-linking on signup)"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              onKeyDown={(e) => e.key === "Enter" && addMember()}
            />
          )}
        </div>
      </div>

      {/* Tracked Accounts */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Tracked Accounts</h2>
            <p className="text-sm text-muted">Accounts you track in History snapshots. Toggle off dormant ones.</p>
          </div>
          <button onClick={() => setShowAddAccount(!showAddAccount)} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-hover text-sm">
            <Plus size={14} /> Add
          </button>
        </div>

        {showAddAccount && (
          <div className="bg-blue-50 rounded-lg p-3 mb-4 space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Account Name</label>
              <input type="text" value={newAccount.name} onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })} placeholder="e.g. Wife's 401K" className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select value={newAccount.account_type} onChange={(e) => setNewAccount({ ...newAccount, account_type: e.target.value as "asset" | "debt" })} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white">
                  <option value="asset">Asset</option>
                  <option value="debt">Debt</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Owner</label>
                <select value={newAccount.owner_member_id} onChange={(e) => setNewAccount({ ...newAccount, owner_member_id: e.target.value })} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white">
                  <option value="">Shared</option>
                  {activeMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addAccount} disabled={!newAccount.name.trim()} className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm disabled:opacity-50">Add Account</button>
              <button onClick={() => setShowAddAccount(false)} className="px-3 py-1.5 border border-border rounded-lg text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Asset accounts */}
        <h3 className="text-sm font-medium text-success mb-2">Assets</h3>
        <div className="space-y-1 mb-4">
          {assetAccounts.length === 0 ? (
            <p className="text-sm text-muted">No asset accounts yet</p>
          ) : (
            assetAccounts.map((a) => (
              <AccountRow key={a.id} account={a} getMemberName={getMemberName} onToggle={toggleAccount} onDelete={deleteAccount} />
            ))
          )}
        </div>

        {/* Debt accounts */}
        <h3 className="text-sm font-medium text-danger mb-2">Debts</h3>
        <div className="space-y-1">
          {debtAccounts.length === 0 ? (
            <p className="text-sm text-muted">No debt accounts yet</p>
          ) : (
            debtAccounts.map((a) => (
              <AccountRow key={a.id} account={a} getMemberName={getMemberName} onToggle={toggleAccount} onDelete={deleteAccount} />
            ))
          )}
        </div>
      </div>

      {/* Household Invite */}
      {household && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-lg font-semibold mb-3">Invite Code</h2>
          <div className="flex items-center gap-2 mb-2">
            <code className="bg-gray-100 px-3 py-2 rounded-lg font-mono text-lg tracking-widest">{household.invite_code}</code>
            <button onClick={copyInviteCode} className="flex items-center gap-1 px-3 py-2 text-sm border border-border rounded-lg hover:bg-gray-50">
              <Copy size={14} /> {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-muted">Share this code with household members. They enter it during signup to join and get their own login.</p>
          {isOwner ? (
            <div className="mt-3 pt-3 border-t border-border space-y-2">
              <p className="text-xs text-primary font-medium">You are the household owner (admin).</p>
              <div>
                <label className="block text-xs text-muted mb-1">Transfer ownership to</label>
                <div className="flex gap-2">
                  <select
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                    className="flex-1 px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select a member...</option>
                    {members
                      .filter((m) => m.profile_id && m.profile_id !== profile?.id)
                      .map((m) => (
                        <option key={m.id} value={m.profile_id!}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={transferOwnership}
                    disabled={!transferTo || transferring}
                    className="px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 text-sm font-medium"
                  >
                    {transferring ? "..." : "Transfer"}
                  </button>
                </div>
                {members.filter((m) => m.profile_id && m.profile_id !== profile?.id).length === 0 && (
                  <p className="text-xs text-muted mt-1">No other members with a login yet. They need to sign up first.</p>
                )}
                {transferMessage && (
                  <p className={`text-xs mt-1 ${transferMessage.includes("Failed") ? "text-danger" : "text-success"}`}>
                    {transferMessage}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted mt-1">Household managed by {members.find((m) => m.profile_id === household?.owner_id)?.name || "owner"}.</p>
          )}
        </div>
      )}

      {/* Danger Zone */}
      <div className="bg-card rounded-xl border border-red-200 p-5">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2 text-danger">
          <AlertTriangle size={20} /> Danger Zone
        </h2>

        {isOwner ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              You are the <strong>household owner</strong>. Deleting your account will permanently remove the entire household, including all bills, debts, history, tracked accounts, and all member accounts. This cannot be undone.
            </p>
            <div>
              <label className="block text-sm font-medium mb-1">
                Type <span className="font-mono text-danger">delete everything</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="delete everything"
                className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>
            <button
              onClick={handleDeleteAccount}
              disabled={deleteConfirm !== "delete everything" || deleting}
              className="px-4 py-2 bg-danger text-white rounded-lg hover:opacity-90 disabled:opacity-30 text-sm font-medium"
            >
              {deleting ? "Deleting..." : "Delete Household & All Data"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              This will remove your login and unlink you from the household. Your name, assigned bills, and other household data will remain so the owner can still manage them. This cannot be undone.
            </p>
            <div>
              <label className="block text-sm font-medium mb-1">
                Type <span className="font-mono text-danger">delete my account</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="delete my account"
                className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
            </div>
            <button
              onClick={handleDeleteAccount}
              disabled={deleteConfirm !== "delete my account" || deleting}
              className="px-4 py-2 bg-danger text-white rounded-lg hover:opacity-90 disabled:opacity-30 text-sm font-medium"
            >
              {deleting ? "Deleting..." : "Delete My Account"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AccountRow({
  account, getMemberName, onToggle, onDelete,
}: {
  account: TrackedAccount;
  getMemberName: (id: string | null) => string;
  onToggle: (id: string, is_active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${account.is_active ? "bg-gray-50" : "bg-gray-50 opacity-50"}`}>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${account.is_active ? (account.account_type === "asset" ? "bg-success" : "bg-danger") : "bg-gray-300"}`} />
        <span className="text-sm font-medium">{account.name}</span>
        <span className="text-xs text-muted">({getMemberName(account.owner_member_id)})</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onToggle(account.id, account.is_active)}
          className={`text-xs px-2 py-0.5 rounded ${account.is_active ? "bg-green-100 text-green-700" : "bg-gray-200 text-muted"}`}
        >
          {account.is_active ? "Active" : "Dormant"}
        </button>
        <button onClick={() => onDelete(account.id)} className="p-1 text-muted hover:text-danger"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}
