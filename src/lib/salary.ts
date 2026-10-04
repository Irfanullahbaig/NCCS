import type { PaymentMethod, SalaryStatus } from "@/lib/enums";
import { db, newId, nowIso } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { nextExpenseId } from "@/lib/ids";
import { currentMonthYear, fullName } from "@/lib/utils";

export const ADVANCE_NOTE_PREFIX = "[ADVANCE]";

export function isAdvancePayment(notes?: string | null) {
  return Boolean(notes?.startsWith(ADVANCE_NOTE_PREFIX));
}

export function isAdvanceExpense(description?: string | null) {
  return Boolean(description?.toLowerCase().startsWith("advance salary"));
}

export function stripAdvancePrefix(notes?: string | null) {
  if (!notes) return "";
  return notes.startsWith(ADVANCE_NOTE_PREFIX) ? notes.slice(ADVANCE_NOTE_PREFIX.length).trim() : notes;
}

function deriveSalaryStatus(expected: number, paid: number): { remaining: number; status: SalaryStatus } {
  const remaining = Math.max(0, Math.round(expected) - Math.round(paid));
  if (remaining <= 0 && expected > 0) return { remaining: 0, status: "PAID" };
  if (paid > 0) return { remaining, status: "PARTIALLY_PAID" };
  return { remaining, status: "PENDING" };
}

export async function recalculateSalaryRecord(salaryRecordId: string) {
  const record = await db().from("SalaryRecord").select("*").eq("id", salaryRecordId).maybeSingle();
  if (record.error) throw record.error;
  if (!record.data) throw new Error("Salary record not found");

  const payments = await db()
    .from("SalaryPayment")
    .select("amount")
    .eq("salaryRecordId", salaryRecordId)
    .is("voidedAt", null);
  if (payments.error) throw payments.error;

  const paid = (payments.data ?? []).reduce((sum, payment) => sum + payment.amount, 0);
  const derived = deriveSalaryStatus(record.data.expectedAmount, paid);
  const updated = await db()
    .from("SalaryRecord")
    .update({
      paidAmount: paid,
      remainingAmount: derived.remaining,
      status: derived.status,
      updatedAt: nowIso(),
    })
    .eq("id", salaryRecordId)
    .select()
    .single();
  if (updated.error) throw updated.error;
  return updated.data;
}

export async function ensureSalaryRecord(input: {
  staffId: string;
  month?: number;
  year?: number;
  userId?: string | null;
}) {
  const { month, year } = input.month && input.year ? { month: input.month, year: input.year } : currentMonthYear();
  const staff = await db().from("Staff").select("*").eq("id", input.staffId).maybeSingle();
  if (staff.error) throw staff.error;
  if (!staff.data) throw new Error("Teacher not found");

  const existing = await db()
    .from("SalaryRecord")
    .select("*")
    .eq("staffId", input.staffId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (existing.data.paidAmount === 0 && existing.data.expectedAmount !== staff.data.salaryAmount) {
      const derived = deriveSalaryStatus(staff.data.salaryAmount, 0);
      const updated = await db()
        .from("SalaryRecord")
        .update({
          expectedAmount: staff.data.salaryAmount,
          remainingAmount: derived.remaining,
          status: derived.status,
          updatedAt: nowIso(),
          updatedById: input.userId ?? null,
        })
        .eq("id", existing.data.id)
        .select()
        .single();
      if (updated.error) throw updated.error;
      return updated.data;
    }
    return existing.data;
  }

  const expected = Math.max(0, staff.data.salaryAmount);
  const derived = deriveSalaryStatus(expected, 0);
  const stamp = nowIso();
  const created = await db()
    .from("SalaryRecord")
    .insert({
      id: newId(),
      staffId: staff.data.id,
      month,
      year,
      expectedAmount: expected,
      paidAmount: 0,
      remainingAmount: derived.remaining,
      status: derived.status,
      createdAt: stamp,
      updatedAt: stamp,
      createdById: input.userId ?? null,
      updatedById: input.userId ?? null,
    })
    .select()
    .single();
  if (created.error) throw created.error;
  return created.data;
}

export async function ensureCurrentMonthSalaries(userId?: string | null) {
  const { month, year } = currentMonthYear();
  const staff = await db()
    .from("Staff")
    .select("id")
    .in("employmentStatus", ["ACTIVE", "ON_LEAVE"])
    .gt("salaryAmount", 0);
  if (staff.error) throw staff.error;
  for (const member of staff.data ?? []) {
    await ensureSalaryRecord({ staffId: member.id, month, year, userId });
  }
}

export async function recordSalaryPayment(input: {
  staffId: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: PaymentMethod;
  month?: number;
  year?: number;
  referenceNumber?: string | null;
  notes?: string | null;
  isAdvance?: boolean;
  userId: string;
}) {
  const amount = Math.round(input.amount);
  if (amount <= 0) throw new Error("Paid amount must be greater than zero");

  const staff = await db().from("Staff").select("*").eq("id", input.staffId).maybeSingle();
  if (staff.error) throw staff.error;
  if (!staff.data) throw new Error("Teacher not found");
  if (staff.data.salaryAmount <= 0) throw new Error("Set the teacher's monthly salary before recording a payment");

  const record = await ensureSalaryRecord({
    staffId: staff.data.id,
    month: input.month,
    year: input.year,
    userId: input.userId,
  });
  const live = await db().from("SalaryRecord").select("*").eq("id", record.id).single();
  if (live.error) throw live.error;
  if (amount > live.data.remainingAmount) {
    throw new Error(`Payment exceeds remaining salary of Rs. ${live.data.remainingAmount.toLocaleString("en-PK")}`);
  }

  const name = fullName(staff.data.firstName, staff.data.lastName);
  const stamp = nowIso();
  const kindLabel = input.isAdvance ? "Advance salary" : "Salary";
  const notes = input.isAdvance
    ? `${ADVANCE_NOTE_PREFIX} ${input.notes ?? ""}`.trim()
    : input.notes ?? null;
  const expense = await db()
    .from("ExpenseTransaction")
    .insert({
      id: newId(),
      expenseId: await nextExpenseId(input.paymentDate),
      date: nowIso(input.paymentDate),
      amount,
      category: "SALARIES",
      paidTo: name,
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber ?? null,
      description: `${kindLabel} ${live.data.month}/${live.data.year} — ${name}`,
      notes,
      createdAt: stamp,
      updatedAt: stamp,
      createdById: input.userId,
      updatedById: input.userId,
    })
    .select()
    .single();
  if (expense.error) throw expense.error;

  const payment = await db()
    .from("SalaryPayment")
    .insert({
      id: newId(),
      salaryRecordId: live.data.id,
      staffId: staff.data.id,
      amount,
      paymentDate: nowIso(input.paymentDate),
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber ?? null,
      notes,
      expenseTransactionId: expense.data.id,
      createdAt: stamp,
      updatedAt: stamp,
      createdById: input.userId,
      updatedById: input.userId,
    })
    .select()
    .single();
  if (payment.error) throw payment.error;

  await recalculateSalaryRecord(live.data.id);
  await writeAudit({
    userId: input.userId,
    action: "SALARY_PAYMENT_RECORDED",
    entityType: "SalaryPayment",
    entityId: payment.data.id,
    details: { staffId: input.staffId, amount, expenseId: expense.data.expenseId, advance: Boolean(input.isAdvance) },
  });
  return { payment: payment.data, expense: expense.data, salaryRecordId: live.data.id };
}

export async function updateSalaryPayment(input: {
  paymentId: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: PaymentMethod;
  referenceNumber?: string | null;
  notes?: string | null;
  userId: string;
}) {
  const amount = Math.round(input.amount);
  if (amount <= 0) throw new Error("Paid amount must be greater than zero");

  const payment = await db()
    .from("SalaryPayment")
    .select("*, salaryRecord:SalaryRecord(*)")
    .eq("id", input.paymentId)
    .maybeSingle();
  if (payment.error) throw payment.error;
  if (!payment.data || payment.data.voidedAt || !payment.data.salaryRecord) {
    throw new Error("Salary payment not found");
  }

  const otherPaid = payment.data.salaryRecord.paidAmount - payment.data.amount;
  const remainingIfRemoved = Math.max(0, payment.data.salaryRecord.expectedAmount - otherPaid);
  if (amount > remainingIfRemoved) {
    throw new Error(`Payment exceeds remaining salary of Rs. ${remainingIfRemoved.toLocaleString("en-PK")}`);
  }

  const stamp = nowIso();
  const payUpdate = await db()
    .from("SalaryPayment")
    .update({
      amount,
      paymentDate: nowIso(input.paymentDate),
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber ?? null,
      notes: input.notes ?? null,
      updatedAt: stamp,
      updatedById: input.userId,
    })
    .eq("id", payment.data.id);
  if (payUpdate.error) throw payUpdate.error;
  const expenseUpdate = await db()
    .from("ExpenseTransaction")
    .update({
      amount,
      date: nowIso(input.paymentDate),
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber ?? null,
      notes: input.notes ?? null,
      updatedAt: stamp,
      updatedById: input.userId,
    })
    .eq("id", payment.data.expenseTransactionId);
  if (expenseUpdate.error) throw expenseUpdate.error;
  await recalculateSalaryRecord(payment.data.salaryRecordId);
  await writeAudit({
    userId: input.userId,
    action: "SALARY_PAYMENT_EDITED",
    entityType: "SalaryPayment",
    entityId: payment.data.id,
    details: { amount },
  });
  return { ok: true as const, id: payment.data.id };
}

export async function voidSalaryPayment(input: { paymentId: string; reason: string; userId: string }) {
  const payment = await db().from("SalaryPayment").select("*").eq("id", input.paymentId).maybeSingle();
  if (payment.error) throw payment.error;
  if (!payment.data) throw new Error("Salary payment not found");
  if (payment.data.voidedAt) throw new Error("Payment is already voided");

  const stamp = nowIso();
  const voidFields = {
    voidedAt: stamp,
    voidedById: input.userId,
    voidReason: input.reason,
    updatedAt: stamp,
    updatedById: input.userId,
  };
  const payUpdate = await db().from("SalaryPayment").update(voidFields).eq("id", payment.data.id);
  if (payUpdate.error) throw payUpdate.error;
  const expenseUpdate = await db()
    .from("ExpenseTransaction")
    .update(voidFields)
    .eq("id", payment.data.expenseTransactionId);
  if (expenseUpdate.error) throw expenseUpdate.error;
  await recalculateSalaryRecord(payment.data.salaryRecordId);
  await writeAudit({
    userId: input.userId,
    action: "SALARY_PAYMENT_VOIDED",
    entityType: "SalaryPayment",
    entityId: payment.data.id,
    details: { reason: input.reason },
  });
}
