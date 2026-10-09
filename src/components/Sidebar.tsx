"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, ArrowLeftRight, Users, FileText, Plane, CreditCard,
  Building2, Truck, Ticket, Wallet, RotateCcw, UserCheck, Megaphone,
  Banknote, Landmark, TrendingUp, Package, Scale, User,
  CalendarCheck, Settings, Menu, X, ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/receivables", label: "Receivables", icon: FileText },
  { href: "/trips", label: "Trip PnL", icon: Plane },
  { href: "/payables", label: "Payables", icon: CreditCard },
  { href: "/hotels", label: "Hotels", icon: Building2 },
  { href: "/transport", label: "Transport", icon: Truck },
  { href: "/ticketing", label: "Ticketing", icon: Ticket },
  { href: "/advances", label: "Supplier Advances", icon: Wallet },
  { href: "/refunds", label: "Refunds", icon: RotateCcw },
  { href: "/payroll", label: "Payroll & Commissions", icon: UserCheck },
  { href: "/expenses", label: "Office & Marketing", icon: Megaphone },
  { href: "/petty-cash", label: "Petty Cash", icon: Banknote },
  { href: "/bank", label: "Bank Accounts", icon: Landmark },
  { href: "/cashflow", label: "Cash Flow", icon: TrendingUp },
  { href: "/assets", label: "Assets", icon: Package },
  { href: "/liabilities", label: "Liabilities", icon: Scale },
  { href: "/owner", label: "Owner Account", icon: User },
  { href: "/monthly-closing", label: "Monthly Closing", icon: CalendarCheck },
  { href: "/sales-team", label: "Sales Team", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/settings/security", label: "Security", icon: ShieldCheck },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function logout() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md bg-slate-800 text-white"
        onClick={() => setOpen(!open)}
        aria-label="Toggle menu"
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-slate-100 flex flex-col transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="p-4 border-b border-slate-700 flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-white overflow-hidden shrink-0 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.jpg"
              alt="Pacific Trips"
              className="w-full h-full object-contain p-1"
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold tracking-tight truncate">
              Pacific Trips
            </h1>
            <p className="text-[10px] text-slate-400 truncate">
              Lahore · PKR · Confidential
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {nav.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-emerald-600/20 text-emerald-400 font-medium"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                )}
              >
                <Icon size={16} className="shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          onClick={logout}
          disabled={signingOut}
          className="mx-2 mb-2 text-left text-sm text-red-400 hover:bg-red-500/10 rounded-lg px-3 py-2 disabled:opacity-50"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>

        <div className="p-3 border-t border-slate-700 text-[10px] text-slate-500">
          Every transaction · No amount too small
        </div>
      </aside>
    </>
  );
}