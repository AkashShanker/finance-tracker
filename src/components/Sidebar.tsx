"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Receipt,
  CreditCard,
  MessageSquare,
  Settings,
  LogOut,
  Menu,
  X,
  History,
  BarChart3,
  CalendarDays,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/bills", label: "Bills", icon: Receipt },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/debts", label: "Debts", icon: CreditCard },
  { href: "/history", label: "History", icon: History },
  { href: "/charts", label: "Charts", icon: BarChart3 },
  { href: "/ask-claude", label: "Ask Claude", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const navContent = (
    <>
      <div className="p-6">
        <h1 className="text-xl font-bold text-white">💰 FinTracker</h1>
      </div>
      <nav className="flex-1 px-3">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg mb-1 transition-colors ${
                isActive
                  ? "bg-primary text-white"
                  : "text-slate-300 hover:bg-sidebar-hover hover:text-white"
              }`}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-3">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-sidebar-hover hover:text-white w-full transition-colors"
        >
          <LogOut size={20} />
          <span>Sign Out</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 p-2 bg-sidebar text-white rounded-lg md:hidden"
      >
        <Menu size={24} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar flex flex-col transition-transform md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 text-slate-300 hover:text-white"
        >
          <X size={24} />
        </button>
        {navContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-64 md:min-h-screen bg-sidebar">
        {navContent}
      </aside>
    </>
  );
}
