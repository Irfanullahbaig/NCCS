import type { Role } from "@/lib/enums";

export type Permission =
  | "dashboard.view"
  | "students.view"
  | "students.create"
  | "students.edit"
  | "students.delete"
  | "staff.view"
  | "staff.create"
  | "staff.edit"
  | "staff.delete"
  | "classes.view"
  | "classes.create"
  | "classes.edit"
  | "classes.delete"
  | "fees.view"
  | "fees.record"
  | "fees.void"
  | "fees.waive"
  | "finance.view"
  | "finance.create"
  | "finance.edit"
  | "finance.void"
  | "finance.analytics"
  | "reports.view"
  | "reports.export"
  | "salaries.view"
  | "salaries.record"
  | "backup.manage"
  | "data.import"
  | "users.manage"
  | "settings.manage"
  | "audit.view";

const ALL: Permission[] = [
  "dashboard.view",
  "students.view",
  "students.create",
  "students.edit",
  "students.delete",
  "staff.view",
  "staff.create",
  "staff.edit",
  "staff.delete",
  "classes.view",
  "classes.create",
  "classes.edit",
  "classes.delete",
  "fees.view",
  "fees.record",
  "fees.void",
  "fees.waive",
  "finance.view",
  "finance.create",
  "finance.edit",
  "finance.void",
  "finance.analytics",
  "reports.view",
  "reports.export",
  "salaries.view",
  "salaries.record",
  "backup.manage",
  "data.import",
  "users.manage",
  "settings.manage",
  "audit.view",
];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL,
  PRINCIPAL: [
    "dashboard.view",
    "students.view",
    "students.create",
    "students.edit",
    "staff.view",
    "staff.create",
    "staff.edit",
    "classes.view",
    "fees.view",
    "fees.waive",
    "finance.view",
    "finance.analytics",
    "reports.view",
    "reports.export",
    "salaries.view",
  ],
  // Everything Admin has except managing user accounts and their roles.
  ACCOUNTANT: ALL.filter((permission) => permission !== "users.manage"),
};

export function can(role: Role, permission: Permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canAny(role: Role, permissions: Permission[]) {
  return permissions.some((permission) => can(role, permission));
}
