import type { Role } from "@prisma/client";

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
  | "finance.view"
  | "finance.create"
  | "finance.void"
  | "finance.analytics"
  | "reports.view"
  | "reports.export"
  | "salaries.view"
  | "salaries.record"
  | "backup.manage"
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
  "finance.view",
  "finance.create",
  "finance.void",
  "finance.analytics",
  "reports.view",
  "reports.export",
  "salaries.view",
  "salaries.record",
  "backup.manage",
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
    "finance.view",
    "finance.analytics",
    "reports.view",
    "reports.export",
    "salaries.view",
  ],
  ACCOUNTANT: [
    "dashboard.view",
    "students.view",
    "students.create",
    "staff.view",
    "staff.create",
    "staff.edit",
    "classes.view",
    "fees.view",
    "fees.record",
    "finance.view",
    "finance.create",
    "reports.view",
    "reports.export",
    "salaries.view",
    "salaries.record",
  ],
};

export function can(role: Role, permission: Permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canAny(role: Role, permissions: Permission[]) {
  return permissions.some((permission) => can(role, permission));
}
