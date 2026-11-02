"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Banknote,
  BookOpen,
  ChartPie,
  ClipboardList,
  Coins,
  FileText,
  GraduationCap,
  HandCoins,
  History,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  ReceiptText,
  ScrollText,
  Settings,
  Shield,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { Role } from "@/lib/enums";
import { can } from "@/lib/permissions";
import { NAV_PAGES, type NavSection } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/logo";

const NAV_ICONS: Record<string, typeof LayoutDashboard> = {
  "/": LayoutDashboard,
  "/students": GraduationCap,
  "/classes": BookOpen,
  "/staff": Users,
  "/finance": Landmark,
  "/finance/fees": ClipboardList,
  "/finance/outstanding": HandCoins,
  "/finance/receivables": ReceiptText,
  "/finance/income": Banknote,
  "/finance/expenses": Receipt,
  "/finance/salaries": Coins,
  "/finance/advances": Wallet,
  "/finance/profit-loss": ChartPie,
  "/finance/ledger": ScrollText,
  "/reports": FileText,
  "/users": Shield,
  "/audit": History,
  "/settings": Settings,
};

const SECTIONS: NavSection[] = ["Overview", "Academics", "Finance", "Administration"];

export function ShellChrome({
  user,
  schoolName,
  children,
}: {
  user: { name: string; email: string; role: Role };
  schoolName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Accountants are redirected from the finance overview, so it is hidden for them.
  const items = NAV_PAGES.filter(
    (item) => can(user.role, item.permission) && !(item.href === "/finance" && !can(user.role, "finance.analytics")),
  );

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/finance") return pathname === "/finance";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      {open ? (
        <button
          className="no-print fixed inset-0 z-30 bg-navy/30 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        />
      ) : null}
      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-white shadow-card transition-transform lg:inset-y-4 lg:left-4 lg:w-64 lg:translate-x-0 lg:rounded-3xl",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <BrandLogo />
            {schoolName && schoolName !== "NCCS" ? (
              <p className="mt-1.5 truncate text-xs text-slate-500">{schoolName}</p>
            ) : null}
          </div>
          <button className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(false)} aria-label="Close sidebar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {SECTIONS.map((section) => {
            const sectionItems = items.filter((item) => item.section === section);
            if (!sectionItems.length) return null;
            return (
              <div key={section} className="mt-3">
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{section}</p>
                <div className="space-y-0.5">
                  {sectionItems.map((item) => {
                    const Icon = NAV_ICONS[item.href] ?? ClipboardList;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                          active ? "bg-peach font-semibold text-orange" : "text-slate-600 hover:bg-slate-50 hover:text-navy",
                        )}
                      >
                        <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-orange" : "text-slate-400")} />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>
        {can(user.role, "fees.record") ? (
          <div className="brand-gradient mx-3 mb-3 hidden rounded-2xl p-4 text-white [@media(min-height:900px)]:block">
            <p className="text-sm font-semibold">Collect a fee</p>
            <p className="mt-1 text-xs text-white/80">Record a payment and the student, class and finance pages update together.</p>
            <Link
              href="/finance/fees?action=pay"
              onClick={() => setOpen(false)}
              className="mt-3 inline-flex h-9 items-center rounded-xl bg-white px-3 text-xs font-semibold text-navy hover:bg-white/90"
            >
              Record payment
            </Link>
          </div>
        ) : null}
        <div className="border-t border-slate-100 px-3 py-3">
          <form action="/api/auth/logout" method="post">
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-navy">
              <LogOut className="h-[18px] w-[18px] text-slate-400" />
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <header className="no-print sticky top-0 z-20 flex items-center gap-3 bg-[#efebe5]/80 px-4 py-3 backdrop-blur-md sm:px-6 lg:ml-[17rem] lg:px-6">
        <button className="rounded-xl bg-white p-2 shadow-card lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        {children}
      </header>
    </>
  );
}
