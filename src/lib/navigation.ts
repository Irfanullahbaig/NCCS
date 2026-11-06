import type { Permission } from "@/lib/permissions";

export type NavSection = "Overview" | "Academics" | "Finance" | "Administration";

export type NavPage = {
  href: string;
  label: string;
  permission: Permission;
  section: NavSection;
  indent?: boolean;
  /** Extra words people may type to find this page from global search. */
  keywords: string[];
};

export const NAV_PAGES: NavPage[] = [
  { href: "/dashboard", section: "Overview", label: "Dashboard", permission: "dashboard.view", keywords: ["home", "overview", "summary"] },
  { href: "/students", section: "Academics", label: "Students", permission: "students.view", keywords: ["pupils", "admission", "enrolment", "scholarship"] },
  { href: "/classes", section: "Academics", label: "Classes", permission: "classes.view", keywords: ["grade", "section", "program", "subjects", "course"] },
  { href: "/staff", section: "Academics", label: "Staff / Teachers", permission: "staff.view", keywords: ["teacher", "faculty", "employee", "hr"] },
  { href: "/finance", section: "Finance", label: "Finance overview", permission: "finance.view", keywords: ["money", "accounts", "analytics"] },
  { href: "/finance/accounts", section: "Finance", label: "Accounts (AR & Bank)", permission: "finance.view", indent: true, keywords: ["accounts receivable", "bank", "balance", "journal", "double entry", "debit", "credit", "trial balance", "mark as paid"] },
  { href: "/finance/fees", section: "Finance", label: "Student Fees", permission: "fees.view", indent: true, keywords: ["fee", "fees", "tuition", "late fee", "fine", "payment", "collect"] },
  { href: "/finance/outstanding", section: "Finance", label: "Fee collection / outstanding", permission: "fees.view", indent: true, keywords: ["fees", "defaulters", "dues", "unpaid", "pending", "overdue", "balance"] },
  { href: "/finance/receivables", section: "Finance", label: "Receivables", permission: "fees.view", indent: true, keywords: ["receivable", "expected income", "due", "owed", "unpaid", "balance", "accounts receivable"] },
  { href: "/finance/income", section: "Finance", label: "Income", permission: "finance.view", indent: true, keywords: ["receipts", "revenue", "earning"] },
  { href: "/finance/expenses", section: "Finance", label: "Expenses", permission: "finance.view", indent: true, keywords: ["spending", "bills", "utilities", "rent"] },
  { href: "/finance/salaries", section: "Finance", label: "Payroll", permission: "salaries.view", indent: true, keywords: ["salary", "salaries", "pay", "wages"] },
  { href: "/finance/advances", section: "Finance", label: "Advance salary", permission: "salaries.view", indent: true, keywords: ["advance", "loan"] },
  { href: "/finance/profit-loss", section: "Finance", label: "Profit & Loss", permission: "finance.analytics", indent: true, keywords: ["p&l", "profit", "loss", "net"] },
  { href: "/finance/ledger", section: "Finance", label: "Transactions / Ledger", permission: "finance.view", indent: true, keywords: ["transactions", "ledger", "history", "cash book"] },
  { href: "/reports", section: "Overview", label: "Reports", permission: "reports.view", keywords: ["export", "csv", "print", "progress"] },
  { href: "/users", section: "Administration", label: "Users", permission: "users.manage", keywords: ["accounts", "login", "roles", "password"] },
  { href: "/audit", section: "Administration", label: "Audit Log", permission: "audit.view", keywords: ["activity", "history", "changes", "log"] },
  { href: "/settings", section: "Administration", label: "Settings", permission: "settings.manage", keywords: ["school profile", "backup", "restore", "late fee settings", "academic year"] },
];
