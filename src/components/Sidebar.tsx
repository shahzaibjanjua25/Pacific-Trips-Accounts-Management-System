"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Users,
  FileText,
  CreditCard,
  Building2,
  Truck,
  RotateCcw,
  UserCheck,
  Megaphone,
  Landmark,
  Package,
  Scale,
  CalendarCheck,
  Settings,
  Menu,
  X,
  ShieldCheck,
  BookOpen,
  LogOut,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useLoading } from "./LoadingProvider";

const nav = [
  { title: "Workspace", items: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
    { href: "/monthly-closing", label: "Monthly Closing", icon: CalendarCheck },
    { href: "/balance-sheet", label: "Balance Sheet", icon: BookOpen },
  ] },
  { title: "Money", items: [
    { href: "/personal-payments", label: "Personal/Family Payments", icon: CreditCard },
    { href: "/bank", label: "Bank Accounts", icon: Landmark },
    { href: "/receivables", label: "Receivables", icon: FileText },
    { href: "/payables", label: "Payables", icon: CreditCard },
    { href: "/refunds", label: "Refunds", icon: RotateCcw },
    { href: "/assets", label: "Assets", icon: Package },
    { href: "/liabilities", label: "Liabilities", icon: Scale },
  ] },
  { title: "Operations", items: [
    { href: "/clients", label: "Clients", icon: Users },
    { href: "/hotels", label: "Hotels", icon: Building2 },
    { href: "/transport", label: "Transport", icon: Truck },
    { href: "/expenses", label: "Office & Marketing", icon: Megaphone },
    { href: "/payroll", label: "Payroll & Commissions", icon: UserCheck },
    { href: "/sales-team", label: "Sales Team", icon: Users },
  ] },
  { title: "Administration", items: [
    { href: "/settings", label: "Settings", icon: Settings },
    { href: "/settings/security", label: "Security", icon: ShieldCheck },
  ] },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { run } = useLoading();
  const selectedPeriod = useSearchParams().get("period");
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);

  async function logout() {
    setSigningOut(true);
    setLogoutError(false);
    try {
      await run("Signing out…", async () => {
        const response = await fetch("/api/auth/logout", { method: "POST" });
        if (!response.ok) throw new Error("Sign out failed.");
        router.replace("/login");
        router.refresh();
      });
    } catch {
      setLogoutError(true);
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur lg:hidden">
        <button type="button"
          className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-800 hover:bg-slate-200"
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="workspace-sidebar">
          {open ? <X size={19} /> : <Menu size={19} />}
        </button>
        <div>
          <p className="text-sm font-semibold leading-tight text-slate-950">Pacific Trips</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">Finance workspace</p>
        </div>
      </header>

      {open && <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden" />}
      <aside
        id="workspace-sidebar"
        className={cn(
          "fixed bottom-0 left-0 top-16 z-40 flex w-64 flex-col border-r border-white/10 bg-[#101d28] text-slate-100 transition-transform duration-200 motion-reduce:transition-none lg:top-0",
          open ? "translate-x-0" : "invisible -translate-x-full lg:visible lg:translate-x-0"
        )}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.jpg"
              alt=""
              className="w-full h-full object-contain p-1"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">
              Pacific Trips
            </p>
            <p className="text-[10px] text-slate-400 truncate">
              Accounting workspace
            </p>
          </div>
        </div>

        <nav aria-label="Workspace" className="flex-1 space-y-5 overflow-y-auto px-3 py-5 [scrollbar-width:thin]">
          {nav.map((group) => (
            <div key={group.title}>
              <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{group.title}</p>
              <ul className="space-y-0.5">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href ||
                    (pathname.startsWith(href + "/") && href !== "/settings");
                  return (
                    <li key={href}>
                      <Link
                        href={selectedPeriod ? { pathname: href, query: { period: selectedPeriod } } : href}
                        onNavigate={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-9 items-center gap-3 rounded-lg px-3 py-1.5 text-[13px] transition-colors",
                          active ? "bg-emerald-300/15 font-semibold text-emerald-100"
                            : "text-slate-300 hover:bg-white/10 hover:text-white",
                        )}
                      >
                        <Icon size={16} className="shrink-0" aria-hidden />
                        <span className="flex-1">{label}</span>
                        {active && <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" aria-hidden />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {logoutError && <p role="alert" className="px-4 pb-2 text-xs text-red-300">Sign out failed. Try again.</p>}
        <button
          type="button"
          onClick={logout}
          disabled={signingOut}
          className="mx-3 mb-3 flex items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          <LogOut size={16} aria-hidden />
          {signingOut ? "Signing out…" : "Sign out"}
        </button>

        <div className="border-t border-white/10 px-5 py-3 text-[11px] text-slate-400">
          Lahore, Pakistan · PKR
        </div>
      </aside>
    </>
  );
}