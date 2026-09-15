"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Banknote,
  BookOpen,
  ClipboardList,
  Coins,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Search,
  Settings,
  Shield,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { can } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "@/components/search";
import { BrandLogo } from "@/components/logo";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission: Parameters<typeof can>[1];
  indent?: boolean;
};

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard.view" },
  { href: "/students", label: "Students", icon: GraduationCap, permission: "students.view" },
  { href: "/classes", label: "Classes & Programs", icon: BookOpen, permission: "classes.view" },
  { href: "/staff", label: "Staff / Teachers", icon: Users, permission: "staff.view" },
  { href: "/finance", label: "Finance analytics", icon: Wallet, permission: "finance.analytics" },
  { href: "/finance/income", label: "Income", icon: Banknote, permission: "finance.view", indent: true },
  { href: "/finance/expenses", label: "Expenses", icon: Receipt, permission: "finance.view", indent: true },
  { href: "/finance/fees", label: "Student Fees", icon: ClipboardList, permission: "fees.view", indent: true },
  { href: "/finance/salaries", label: "Teacher Salaries", icon: Coins, permission: "salaries.view", indent: true },
  { href: "/finance/outstanding", label: "Outstanding", icon: ClipboardList, permission: "fees.view", indent: true },
  { href: "/reports", label: "Reports", icon: ClipboardList, permission: "reports.view" },
  { href: "/users", label: "Users", icon: Shield, permission: "users.manage" },
  { href: "/audit", label: "Audit Log", icon: ClipboardList, permission: "audit.view" },
  { href: "/settings", label: "Settings", icon: Settings, permission: "settings.manage" },
];

export function AppShell({
  user,
  schoolName,
  children,
}: {
  user: { name: string; email: string; role: Role };
  schoolName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((item) => can(user.role, item.permission));

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/finance") return pathname === "/finance";
    if (href === "/finance/income") return pathname === "/finance/income" || pathname.startsWith("/finance/income/");
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="min-h-screen bg-surface">
      {open ? (
        <button
          className="fixed inset-0 z-30 bg-navy/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close menu"
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-navy text-white transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="border-b border-white/10 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <BrandLogo />
            <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close sidebar">
              <X className="h-5 w-5" />
            </button>
          </div>
          {schoolName && schoolName !== "NCCS" ? (
            <p className="mt-2 truncate text-xs text-white/60">{schoolName}</p>
          ) : null}
        </div>
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition",
                  item.indent && can(user.role, "finance.analytics") && "ml-4 py-1 text-[13px]",
                  active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-4 py-3">
          <form action="/api/auth/logout" method="post">
            <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-white/70 hover:bg-white/5 hover:text-white">
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
          <button className="rounded-xl p-2 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <BrandLogo compact className="hidden w-28 sm:inline-flex lg:hidden" />
          <div className="relative hidden max-w-xl flex-1 md:block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <GlobalSearch />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-navy">{user.name}</p>
              <p className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-semibold text-white">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
