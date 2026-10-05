import type { ExpenseCategory, FeeStatus, IncomeCategory, PaymentMethod } from "@/lib/enums";
import { db, newId, nowIso } from "@/lib/db";
import { LATE_FEE_AMOUNT } from "@/lib/constants";
import {
  calendarDateFromValue,
  currentMonthYear,
  feeDueDate,
  feeDueDateIso,
  isPastFeeDue,
  startOfDay,
} from "@/lib/utils";
import { nextExpenseId, nextIncomeId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";

export function deriveFeeStatus(input: {
  expected: number;
  paid: number;
  waived: number;
  fine?: number;
  dueDate: Date | string;
  now?: Date;
}): { remaining: number; status: FeeStatus } {
  const expected = Math.max(0, Math.round(input.expected));
  const paid = Math.max(0, Math.round(input.paid));
  const waived = Math.max(0, Math.round(input.waived));
  const fine = Math.max(0, Math.round(input.fine ?? 0));
  const remaining = Math.max(0, expected + fine - paid - waived);

  if (expected > 0 && waived >= expected && remaining <= 0) {
    return { remaining: 0, status: "WAIVED" };
  }
  if (remaining <= 0) {
    return { remaining: 0, status: "PAID" };
  }
  if (paid > 0) {
    return { remaining, status: "PARTIALLY_PAID" };
  }
  const now = startOfDay(input.now ?? new Date());
  const due = startOfDay(new Date(input.dueDate));
  if (due < now) {
    return { remaining, status: "OVERDUE" };
  }
  return { remaining, status: "PENDING" };
}

function paidOnTime(payments: Array<{ amount: number; paymentDate: Date | string; voidedAt?: string | null }>, year: number, month: number) {
  const due = feeDueDateIso(year, month);
  return payments
    .filter((payment) => !payment.voidedAt && calendarDateFromValue(payment.paymentDate) <= due)
    .reduce((sum, payment) => sum + payment.amount, 0);
}

export async function recalculateFeeRecord(feeRecordId: string) {
  const { data: record, error } = await db().from("FeeRecord").select("*").eq("id", feeRecordId).maybeSingle();
  if (error) throw error;
  if (!record) throw new Error("Fee record not found");

  const { data: payments, error: paymentError } = await db()
    .from("FeePayment")
    .select("amount")
    .eq("feeRecordId", feeRecordId)
    .is("voidedAt", null);
  if (paymentError) throw paymentError;

  const paid = (payments ?? []).reduce((sum, payment) => sum + payment.amount, 0);
  const derived = deriveFeeStatus({
    expected: record.expectedAmount,
    paid,
    waived: record.waivedAmount,
    fine: Number(record.fineAmount ?? 0),
    dueDate: feeDueDate(record.year, record.month),
  });

  const { data: updated, error: updateError } = await db()
    .from("FeeRecord")
    .update({
      paidAmount: paid,
      remainingAmount: derived.remaining,
      status: derived.status,
      updatedAt: nowIso(),
    })
    .eq("id", feeRecordId)
    .select()
    .single();
  if (updateError) throw updateError;
  return updated;
}

export async function applyLateFineToRecord(feeRecordId: string) {
  const { data: record, error } = await db().from("FeeRecord").select("*").eq("id", feeRecordId).maybeSingle();
  if (error) throw error;
  if (!record) return null;
  return applyLateFineOnRecord(record);
}

async function applyLateFineOnRecord(
  record: {
    id: string;
    status: string;
    waivedAmount: number;
    expectedAmount: number;
    paidAmount: number;
    remainingAmount: number;
    fineAmount?: number | null;
    month: number;
    year: number;
    payments?: Array<{ amount: number; paymentDate: Date | string; voidedAt?: string | null }>;
  },
) {
  if (record.waivedAmount >= record.expectedAmount) return record;
  if ((record.fineAmount ?? 0) >= LATE_FEE_AMOUNT) return record;
  if (!isPastFeeDue(record.year, record.month)) return record;

  let payments = record.payments;
  if (!payments) {
    const paymentsRes = await db()
      .from("FeePayment")
      .select("amount, paymentDate, voidedAt")
      .eq("feeRecordId", record.id);
    if (paymentsRes.error) throw paymentsRes.error;
    payments = paymentsRes.data ?? [];
  }
  const onTime = paidOnTime(payments, record.year, record.month);
  if (onTime + record.waivedAmount >= record.expectedAmount) return record;

  const derived = deriveFeeStatus({
    expected: record.expectedAmount,
    paid: record.paidAmount,
    waived: record.waivedAmount,
    fine: LATE_FEE_AMOUNT,
    dueDate: feeDueDate(record.year, record.month),
  });
  const updated = await db()
    .from("FeeRecord")
    .update({
      fineAmount: LATE_FEE_AMOUNT,
      dueDate: feeDueDate(record.year, record.month).toISOString(),
      remainingAmount: derived.remaining,
      status: derived.status,
      updatedAt: nowIso(),
    })
    .eq("id", record.id)
    .select()
    .single();
  if (updated.error) throw updated.error;
  return updated.data;
}

export async function applyLateFines() {
  const records = await db()
    .from("FeeRecord")
    .select("id, status, waivedAmount, expectedAmount, paidAmount, remainingAmount, fineAmount, month, year, payments:FeePayment(amount, paymentDate, voidedAt)")
    .neq("status", "WAIVED");
  if (records.error) throw records.error;
  const pending = (records.data ?? []).filter((record) => (record.fineAmount ?? 0) < LATE_FEE_AMOUNT && isPastFeeDue(record.year, record.month));
  for (let index = 0; index < pending.length; index += 10) {
    await Promise.all(pending.slice(index, index + 10).map((record) => applyLateFineOnRecord(record)));
  }
}

export async function ensureStudentFeeRecord(input: {
  studentId: string;
  month?: number;
  year?: number;
  userId?: string | null;
}) {
  const { month, year } = input.month && input.year ? { month: input.month, year: input.year } : currentMonthYear();

  const existing = await db()
    .from("FeeRecord")
    .select("*")
    .eq("studentId", input.studentId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const updated = await applyLateFineOnRecord(existing.data);
    return updated ?? existing.data;
  }

  const student = await db()
    .from("Student")
    .select("*, class:Class(*)")
    .eq("id", input.studentId)
    .maybeSingle();
  if (student.error) throw student.error;
  if (!student.data || !student.data.class) throw new Error("Student not found");

  const expected = student.data.feeAmount;
  const waived = student.data.studentType === "SCHOLARSHIP" ? expected : 0;
  const dueDate = feeDueDate(year, month);
  const derived = deriveFeeStatus({ expected, paid: 0, waived, fine: 0, dueDate });
  const stamp = nowIso();

  const created = await db()
    .from("FeeRecord")
    .insert({
      id: newId(),
      studentId: student.data.id,
      classId: student.data.classId,
      academicYearId: student.data.class.academicYearId,
      month,
      year,
      expectedAmount: expected,
      paidAmount: 0,
      waivedAmount: waived,
      remainingAmount: derived.remaining,
      status: derived.status,
      dueDate: dueDate.toISOString(),
      createdAt: stamp,
      updatedAt: stamp,
      createdById: input.userId ?? null,
      updatedById: input.userId ?? null,
    })
    .select()
    .single();
  if (created.error) throw created.error;
  const applied = await applyLateFineOnRecord(created.data);
  return applied ?? created.data;
}

let feeMaintenance: Promise<void> | null = null;
let feeMaintenanceAt = 0;
const FEE_MAINTENANCE_MS = 45_000;

export function invalidateFeeMaintenance() {
  feeMaintenanceAt = 0;
}

export async function ensureCurrentMonthFees(userId?: string | null) {
  const now = Date.now();
  if (feeMaintenance) return feeMaintenance;
  if (now - feeMaintenanceAt < FEE_MAINTENANCE_MS) return;
  feeMaintenance = runFeeMaintenance(userId).finally(() => {
    feeMaintenance = null;
    feeMaintenanceAt = Date.now();
  });
  return feeMaintenance;
}

async function runFeeMaintenance(userId?: string | null) {
  const { month, year } = currentMonthYear();
  const [studentsRes, existingRes] = await Promise.all([
    db()
      .from("Student")
      .select("id, classId, feeAmount, studentType, class:Class(academicYearId)")
      .is("deletedAt", null)
      .eq("status", "ACTIVE"),
    db().from("FeeRecord").select("studentId").eq("month", month).eq("year", year),
  ]);
  if (studentsRes.error) throw studentsRes.error;
  if (existingRes.error) throw existingRes.error;

  const have = new Set((existingRes.data ?? []).map((row) => row.studentId));
  const dueDate = feeDueDate(year, month);
  const stamp = nowIso();
  const missing = (studentsRes.data ?? []).flatMap((student) => {
    if (have.has(student.id) || !student.class) return [];
    const expected = student.feeAmount;
    const waived = student.studentType === "SCHOLARSHIP" ? expected : 0;
    const derived = deriveFeeStatus({ expected, paid: 0, waived, fine: 0, dueDate });
    return [{
      id: newId(),
      studentId: student.id,
      classId: student.classId,
      academicYearId: student.class.academicYearId,
      month,
      year,
      expectedAmount: expected,
      paidAmount: 0,
      waivedAmount: waived,
      remainingAmount: derived.remaining,
      status: derived.status,
      dueDate: dueDate.toISOString(),
      createdAt: stamp,
      updatedAt: stamp,
      createdById: userId ?? null,
      updatedById: userId ?? null,
    }];
  });
  if (missing.length) {
    const inserted = await db().from("FeeRecord").insert(missing);
    if (inserted.error) throw inserted.error;
  }
  await applyLateFines();
  await refreshOverdueStatuses();
}

export async function refreshOverdueStatuses() {
  const today = startOfDay(new Date()).toISOString();
  const { error } = await db()
    .from("FeeRecord")
    .update({ status: "OVERDUE", updatedAt: nowIso() })
    .eq("status", "PENDING")
    .lt("dueDate", today);
  if (error) throw error;
}

export async function recordStudentPayment(input: {
  studentId: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: PaymentMethod;
  referenceNumber?: string | null;
  notes?: string | null;
  month?: number;
  year?: number;
  category?: IncomeCategory;
  userId: string;
}) {
  const amount = Math.round(input.amount);
  if (amount <= 0) throw new Error("Payment amount must be greater than zero");

  const student = await db()
    .from("Student")
    .select("*, class:Class(*, program:Program(*))")
    .eq("id", input.studentId)
    .maybeSingle();
  if (student.error) throw student.error;
  if (!student.data || student.data.deletedAt || !student.data.class) throw new Error("Student not found");

  const feeRecord = await ensureStudentFeeRecord({
    studentId: student.data.id,
    month: input.month,
    year: input.year,
    userId: input.userId,
  });
  if (feeRecord.status === "WAIVED") throw new Error("This fee is waived and does not require payment");
  if (amount > feeRecord.remainingAmount) {
    throw new Error(`Payment exceeds remaining balance of Rs. ${feeRecord.remainingAmount.toLocaleString("en-PK")}`);
  }

  const stamp = nowIso();
  const incomeId = await nextIncomeId(input.paymentDate);
  const incomeRow = {
    id: newId(),
    incomeId,
    date: nowIso(input.paymentDate),
    amount,
    category: (input.category ?? "STUDENT_FEE") as IncomeCategory,
    source: `${student.data.firstName} ${student.data.lastName} — ${student.data.class.name} ${student.data.class.program.name} — ${feeRecord.month}/${feeRecord.year}`,
    studentId: student.data.id,
    classId: student.data.classId,
    paymentMethod: input.paymentMethod,
    referenceNumber: input.referenceNumber ?? null,
    notes: input.notes ?? null,
    createdAt: stamp,
    updatedAt: stamp,
    createdById: input.userId,
    updatedById: input.userId,
  };
  const income = await db().from("IncomeTransaction").insert(incomeRow).select().single();
  if (income.error) throw income.error;

  const payment = await db()
    .from("FeePayment")
    .insert({
      id: newId(),
      feeRecordId: feeRecord.id,
      studentId: student.data.id,
      amount,
      paymentDate: nowIso(input.paymentDate),
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber ?? null,
      notes: input.notes ?? null,
      incomeTransactionId: income.data.id,
      createdAt: stamp,
      updatedAt: stamp,
      createdById: input.userId,
      updatedById: input.userId,
    })
    .select()
    .single();
  if (payment.error) throw payment.error;

  await recalculateFeeRecord(feeRecord.id);
  invalidateFeeMaintenance();
  await writeAudit({
    userId: input.userId,
    action: "PAYMENT_RECORDED",
    entityType: "FeePayment",
    entityId: payment.data.id,
    details: { studentId: input.studentId, amount, incomeId: income.data.incomeId },
  });
  return { payment: payment.data, income: income.data, feeRecordId: feeRecord.id };
}

export async function voidStudentPayment(input: { paymentId: string; reason: string; userId: string }) {
  const payment = await db().from("FeePayment").select("*").eq("id", input.paymentId).maybeSingle();
  if (payment.error) throw payment.error;
  if (!payment.data) throw new Error("Payment not found");
  if (payment.data.voidedAt) throw new Error("Payment is already voided");

  const stamp = nowIso();
  const voidFields = {
    voidedAt: stamp,
    voidedById: input.userId,
    voidReason: input.reason,
    updatedAt: stamp,
    updatedById: input.userId,
  };
  const payUpdate = await db().from("FeePayment").update(voidFields).eq("id", payment.data.id);
  if (payUpdate.error) throw payUpdate.error;
  const incomeUpdate = await db()
    .from("IncomeTransaction")
    .update(voidFields)
    .eq("id", payment.data.incomeTransactionId);
  if (incomeUpdate.error) throw incomeUpdate.error;
  await recalculateFeeRecord(payment.data.feeRecordId);
  invalidateFeeMaintenance();
  await writeAudit({
    userId: input.userId,
    action: "PAYMENT_VOIDED",
    entityType: "FeePayment",
    entityId: payment.data.id,
    details: { reason: input.reason },
  });
}

export async function recordIncome(input: {
  date: Date;
  amount: number;
  category: IncomeCategory;
  source?: string | null;
  studentId?: string | null;
  classId?: string | null;
  paymentMethod: PaymentMethod;
  referenceNumber?: string | null;
  notes?: string | null;
  month?: number;
  year?: number;
  userId: string;
}) {
  if (input.category === "STUDENT_FEE") {
    if (!input.studentId) throw new Error("Select a student for student fee income");
    return recordStudentPayment({
      studentId: input.studentId,
      amount: input.amount,
      paymentDate: input.date,
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      month: input.month,
      year: input.year,
      userId: input.userId,
    });
  }

  const amount = Math.round(input.amount);
  if (amount <= 0) throw new Error("Amount must be greater than zero");

  let classId = input.classId ?? null;
  if (input.studentId && !classId) {
    const student = await db().from("Student").select("classId").eq("id", input.studentId).maybeSingle();
    if (student.error) throw student.error;
    classId = student.data?.classId ?? null;
  }

  const stamp = nowIso();
  const income = await db()
    .from("IncomeTransaction")
    .insert({
      id: newId(),
      incomeId: await nextIncomeId(input.date),
      date: nowIso(input.date),
      amount,
      category: input.category,
      source: input.source ?? null,
      studentId: input.studentId ?? null,
      classId,
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber ?? null,
      notes: input.notes ?? null,
      createdAt: stamp,
      updatedAt: stamp,
      createdById: input.userId,
      updatedById: input.userId,
    })
    .select()
    .single();
  if (income.error) throw income.error;

  await writeAudit({
    userId: input.userId,
    action: "INCOME_ADDED",
    entityType: "IncomeTransaction",
    entityId: income.data.id,
    details: { incomeId: income.data.incomeId, amount, category: input.category },
  });
  return { income: income.data };
}

export async function recordExpense(input: {
  date: Date;
  amount: number;
  category: ExpenseCategory;
  paidTo: string;
  paymentMethod: PaymentMethod;
  referenceNumber?: string | null;
  description?: string | null;
  notes?: string | null;
  userId: string;
}) {
  const amount = Math.round(input.amount);
  if (amount <= 0) throw new Error("Amount must be greater than zero");
  const stamp = nowIso();
  const expense = await db()
    .from("ExpenseTransaction")
    .insert({
      id: newId(),
      expenseId: await nextExpenseId(input.date),
      date: nowIso(input.date),
      amount,
      category: input.category,
      paidTo: input.paidTo,
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber ?? null,
      description: input.description ?? null,
      notes: input.notes ?? null,
      createdAt: stamp,
      updatedAt: stamp,
      createdById: input.userId,
      updatedById: input.userId,
    })
    .select()
    .single();
  if (expense.error) throw expense.error;

  await writeAudit({
    userId: input.userId,
    action: "EXPENSE_ADDED",
    entityType: "ExpenseTransaction",
    entityId: expense.data.id,
    details: { expenseId: expense.data.expenseId, amount, category: input.category },
  });
  return expense.data;
}

export async function voidIncome(input: { id: string; reason: string; userId: string }) {
  const income = await db()
    .from("IncomeTransaction")
    .select("*, feePayment:FeePayment(*)")
    .eq("id", input.id)
    .maybeSingle();
  if (income.error) throw income.error;
  if (!income.data) throw new Error("Income not found");
  if (income.data.voidedAt) throw new Error("Income is already voided");

  const linkedPayment = Array.isArray(income.data.feePayment) ? income.data.feePayment[0] : income.data.feePayment;
  if (linkedPayment) {
    await voidStudentPayment({ paymentId: linkedPayment.id, reason: input.reason, userId: input.userId });
    return;
  }

  const stamp = nowIso();
  const { error } = await db()
    .from("IncomeTransaction")
    .update({
      voidedAt: stamp,
      voidedById: input.userId,
      voidReason: input.reason,
      updatedAt: stamp,
      updatedById: input.userId,
    })
    .eq("id", income.data.id);
  if (error) throw error;

  await writeAudit({
    userId: input.userId,
    action: "INCOME_VOIDED",
    entityType: "IncomeTransaction",
    entityId: income.data.id,
    details: { reason: input.reason },
  });
}

export async function voidExpense(input: { id: string; reason: string; userId: string }) {
  const expense = await db()
    .from("ExpenseTransaction")
    .select("*, salaryPayment:SalaryPayment(*)")
    .eq("id", input.id)
    .maybeSingle();
  if (expense.error) throw expense.error;
  if (!expense.data) throw new Error("Expense not found");
  if (expense.data.voidedAt) throw new Error("Expense is already voided");

  const linkedPayment = Array.isArray(expense.data.salaryPayment)
    ? expense.data.salaryPayment[0]
    : expense.data.salaryPayment;
  if (linkedPayment) {
    const { voidSalaryPayment } = await import("@/lib/salary");
    await voidSalaryPayment({ paymentId: linkedPayment.id, reason: input.reason, userId: input.userId });
    return;
  }

  const stamp = nowIso();
  const { error } = await db()
    .from("ExpenseTransaction")
    .update({
      voidedAt: stamp,
      voidedById: input.userId,
      voidReason: input.reason,
      updatedAt: stamp,
      updatedById: input.userId,
    })
    .eq("id", expense.data.id);
  if (error) throw error;

  await writeAudit({
    userId: input.userId,
    action: "EXPENSE_VOIDED",
    entityType: "ExpenseTransaction",
    entityId: expense.data.id,
    details: { reason: input.reason },
  });
}
