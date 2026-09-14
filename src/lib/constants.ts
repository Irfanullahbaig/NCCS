export const SCHOOL_NAME = "NCCS";
export const SCHOOL_FULL_NAME = "NCCS School & College";

export const ROLE_LABELS = {
  ADMIN: "Admin",
  PRINCIPAL: "Principal",
  ACCOUNTANT: "Accountant / HR",
} as const;

export const STUDENT_TYPE_LABELS = {
  SELF: "Self",
  SCHOLARSHIP: "Scholarship",
  NEED_BASED: "Need-Based",
} as const;

export const FEE_STATUS_LABELS = {
  PAID: "Paid",
  PARTIALLY_PAID: "Partially Paid",
  PENDING: "Pending",
  OVERDUE: "Overdue",
  WAIVED: "Waived",
} as const;

export const PAYMENT_METHOD_LABELS = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  ONLINE: "Online",
  OTHER: "Other",
} as const;

export const INCOME_CATEGORY_LABELS = {
  STUDENT_FEE: "Student Fee",
  ADMISSION_FEE: "Admission Fee",
  REGISTRATION_FEE: "Registration Fee",
  TRANSPORT_FEE: "Transport Fee",
  OTHER_INCOME: "Other Income",
} as const;

export const EXPENSE_CATEGORY_LABELS = {
  SALARIES: "Salaries",
  UTILITIES: "Utilities",
  RENT: "Rent",
  MAINTENANCE: "Maintenance",
  SUPPLIES: "Supplies",
  TRANSPORT: "Transport",
  OTHER_EXPENSES: "Other Expenses",
} as const;

export const GENDER_LABELS = {
  MALE: "Male",
  FEMALE: "Female",
  OTHER: "Other",
} as const;

export const EMPLOYMENT_LABELS = {
  ACTIVE: "Active",
  ON_LEAVE: "On Leave",
  RESIGNED: "Resigned",
  TERMINATED: "Terminated",
} as const;

export const STUDENT_STATUS_LABELS = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  GRADUATED: "Graduated",
  SUSPENDED: "Suspended",
} as const;

export const SALARY_STATUS_LABELS = {
  PAID: "Paid",
  PARTIALLY_PAID: "Partially Paid",
  PENDING: "Pending",
} as const;

export const FEE_STATUS_STYLES: Record<string, string> = {
  PAID: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  PARTIALLY_PAID: "bg-amber-50 text-amber-700 ring-amber-600/20",
  PENDING: "bg-slate-100 text-slate-700 ring-slate-500/20",
  OVERDUE: "bg-rose-50 text-rose-700 ring-rose-600/20",
  WAIVED: "bg-sky-50 text-sky-700 ring-sky-600/20",
};
