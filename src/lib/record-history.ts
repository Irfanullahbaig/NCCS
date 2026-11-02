import { db } from "@/lib/db";
import { EXPENSE_CATEGORY_LABELS, INCOME_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatPKR } from "@/lib/utils";

/** Who created and changed a financial entry, with the before/after values from the audit log. */

export type HistoryEntry = {
  id: string;
  at: string;
  user: string;
  action: string;
  reason: string | null;
  changes: Array<{ field: string; from: string; to: string }>;
};

const FIELD_LABELS: Record<string, string> = {
  amount: "Amount",
  date: "Date",
  paymentDate: "Payment date",
  paymentMethod: "Method",
  referenceNumber: "Reference",
  notes: "Notes",
  category: "Category",
  source: "Source",
  paidTo: "Paid to",
  description: "Description",
  studentId: "Student",
  classId: "Class",
  month: "Fee month",
  year: "Fee year",
  expectedAmount: "Fee",
  waivedAmount: "Discount",
  remainingAmount: "Balance",
};

const MONEY = new Set(["amount", "expectedAmount", "waivedAmount", "remainingAmount"]);

function show(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (MONEY.has(field)) return formatPKR(Number(value));
  if ((field === "date" || field === "paymentDate") && typeof value === "string") return value.slice(0, 10);
  const text = String(value);
  if (field === "paymentMethod") return PAYMENT_METHOD_LABELS[text as keyof typeof PAYMENT_METHOD_LABELS] ?? text;
  if (field === "category") {
    return INCOME_CATEGORY_LABELS[text as keyof typeof INCOME_CATEGORY_LABELS] ?? EXPENSE_CATEGORY_LABELS[text as keyof typeof EXPENSE_CATEGORY_LABELS] ?? text;
  }
  return text;
}

function parseDetails(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

function diff(details: Record<string, unknown>) {
  const before = (details.before ?? {}) as Record<string, unknown>;
  const after = (details.after ?? {}) as Record<string, unknown>;
  return Object.keys(after)
    .filter((field) => FIELD_LABELS[field] && show(field, before[field]) !== show(field, after[field]))
    .map((field) => ({ field: FIELD_LABELS[field], from: show(field, before[field]), to: show(field, after[field]) }));
}

export async function getRecordHistory(input: {
  entityIds: string[];
  createdAt: string;
  createdById: string | null;
  updatedAt: string;
  updatedById: string | null;
}) {
  const ids = input.entityIds.filter(Boolean);
  const logsRes = await db().from("AuditLog").select("*").in("entityId", ids).order("createdAt", { ascending: true });
  if (logsRes.error) throw logsRes.error;
  const logs = logsRes.data ?? [];

  const userIds = [...new Set([input.createdById, input.updatedById, ...logs.map((log) => log.userId)].filter((id): id is string => Boolean(id)))];
  const usersRes = userIds.length ? await db().from("User").select("id, name").in("id", userIds) : { data: [], error: null };
  if (usersRes.error) throw usersRes.error;
  const names = new Map((usersRes.data ?? []).map((user) => [user.id, user.name]));
  const nameOf = (id: string | null) => (id ? names.get(id) ?? "Unknown user" : "System");

  const entries: HistoryEntry[] = logs.map((log) => {
    const details = parseDetails(log.details);
    return {
      id: log.id,
      at: log.createdAt,
      user: nameOf(log.userId),
      // Deleting marks the entry voided, so show it in the words the screens use.
      action: String(log.action ?? "").replaceAll("_", " ").toLowerCase().replace("voided", "deleted"),
      reason: typeof details.reason === "string" ? details.reason : null,
      changes: diff(details),
    };
  });

  return {
    createdBy: nameOf(input.createdById),
    createdAt: input.createdAt,
    editedBy: input.updatedAt !== input.createdAt ? nameOf(input.updatedById) : null,
    editedAt: input.updatedAt !== input.createdAt ? input.updatedAt : null,
    entries,
  };
}
