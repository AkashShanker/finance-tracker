"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Receipt,
  Settings,
  LogOut,
  Menu,
  X,
  History,
  BarChart3,
  Copy,
  Check,
  Sun,
  Moon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/bills", label: "Bills", icon: Receipt },
  { href: "/history", label: "History", icon: History },
  { href: "/charts", label: "Charts", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

function stringToColor(str: string): string {
  const colors = [
    "bg-indigo-500", "bg-emerald-500", "bg-violet-500", "bg-rose-500",
    "bg-amber-500", "bg-cyan-500", "bg-pink-500", "bg-teal-500",
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function formatInviteCode(code: string): string {
  const upper = code.toUpperCase();
  if (upper.length <= 4) return upper;
  return upper.slice(0, 4) + "-" + upper.slice(4);
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [householdName, setHouseholdName] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    setDarkMode(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleDarkMode() {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserEmail(user.email || "");
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name, household_id")
        .eq("id", user.id)
        .single();
      if (prof) {
        setUserName(prof.display_name);
        if (prof.household_id) {
          const { data: household } = await supabase
            .from("households")
            .select("name, invite_code")
            .eq("id", prof.household_id)
            .single();
          if (household) {
            setHouseholdName(household.name);
            setInviteCode(household.invite_code);
          }
        }
      }
    }
    loadUser();
  }, []);

  function copyInviteCode() {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const initials = getInitials(userName, userEmail);
  const avatarColor = stringToColor(userEmail || "user");
  const displayName = userName || userEmail.split("@")[0];

  const navContent = (
    <>
      <div className="px-5 py-6">
        <h1 className="text-lg font-semibold text-white tracking-tight">FinTracker</h1>
      </div>
      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
              }`}
            >
              <item.icon size={18} strokeWidth={isActive ? 2 : 1.5} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/[0.06]">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className={`w-8 h-8 rounded-full ${avatarColor} flex items-center justify-center text-white text-xs font-semibold shrink-0`}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-white truncate">{displayName}</p>
            {userName && <p className="text-[11px] text-gray-500 truncate">{userEmail}</p>}
          </div>
        </div>

        {inviteCode && (
          <button
            onClick={copyInviteCode}
            className="flex items-center gap-2 px-3 py-1.5 w-full text-left group rounded-md hover:bg-white/5 transition-colors"
            title="Click to copy invite code"
          >
            <span className="text-[11px] text-gray-500 truncate">
              {householdName || "Household"}: <span className="font-mono text-gray-400 tracking-wider">{formatInviteCode(inviteCode)}</span>
            </span>
            {codeCopied ? (
              <Check size={11} className="text-emerald-400 shrink-0" />
            ) : (
              <Copy size={11} className="text-gray-600 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
            )}
          </button>
        )}

        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-gray-400 hover:bg-white/5 hover:text-gray-200 w-full transition-all duration-150 mt-1"
        >
          <LogOut size={16} strokeWidth={1.5} />
          <span className="text-[13px]">Sign Out</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 p-2 bg-sidebar text-white rounded-lg shadow-lg md:hidden"
      >
        <Menu size={22} />
      </button>

      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 bg-sidebar flex flex-col transition-transform duration-200 md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-5 right-4 text-gray-400 hover:text-white"
        >
          <X size={20} />
        </button>
        {navContent}
      </aside>

      <aside className="hidden md:flex md:flex-col md:w-60 md:h-screen md:sticky md:top-0 bg-sidebar overflow-y-auto">
        {navContent}
      </aside>
    </>
  );
}
