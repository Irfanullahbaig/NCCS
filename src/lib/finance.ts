import type { ExpenseCategory, FeeStatus, IncomeCategory, PaymentMethod } from "@/lib/enums";
import { db, newId, nowIso } from "@/lib/db";
import { currentMonthYear, lastDayOfMonth, startOfDay } from "@/lib/utils";
import { nextExpenseId, nextIncomeId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";

export function deriveFeeStatus(input: {
  expected: number;
  paid: number;
  waived: number;
  dueDate: Date | string;
  now?: Date;
}): { remaining: number; status: FeeStatus } {
  const expected = Math.max(0, Math.round(input.expected));
  const paid = Math.max(0, Math.round(input.paid));
  const waived = Math.max(0, Math.round(input.waived));
  const remaining = Math.max(0, expected - paid - waived);

  if (expected > 0 && waived >= expected) {
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
    dueDate: record.dueDate,
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
  if (existing.data) return existing.data;

  const student = await db()
    .from("Student")
    .select("*, class:Class(*)")
    .eq("id", input.studentId)
    .maybeSingle();
  if (student.error) throw student.error;
  if (!student.data || !student.data.class) throw new Error("Student not found");

  const expected = student.data.feeAmount;
  const waived = student.data.studentType === "SCHOLARSHIP" ? expected : 0;
  const dueDate = lastDayOfMonth(year, month);
  const derived = deriveFeeStatus({ expected, paid: 0, waived, dueDate });
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
  return created.data;
}

export async function ensureCurrentMonthFees(userId?: string | null) {
  const { month, year } = currentMonthYear();
  const students = await db().from("Student").select("id").is("deletedAt", null).eq("status", "ACTIVE");
  if (students.error) throw students.error;
  for (const student of students.data ?? []) {
    await ensureStudentFeeRecord({ studentId: student.id, month, year, userId });
  }
  await refreshOverdueStatuses();
}

export async function refreshOverdueStatuses() {
  const today = startOfDay(new Date()).toISOString();
  const overdue = await db().from("FeeRecord").select("*").eq("status", "PENDING").lt("dueDate", today);
  if (overdue.error) throw overdue.error;
  for (const record of overdue.data ?? []) {
    if (record.waivedAmount >= record.expectedAmount) continue;
    const { error } = await db()
      .from("FeeRecord")
      .update({ status: "OVERDUE", updatedAt: nowIso() })
      .eq("id", record.id);
    if (error) throw error;
  }
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
  const live = await db().from("FeeRecord").select("*").eq("id", feeRecord.id).single();
  if (live.error) throw live.error;
  if (live.data.status === "WAIVED") throw new Error("This fee is waived and does not require payment");
  if (amount > live.data.remainingAmount) {
    throw new Error(`Payment exceeds remaining balance of Rs. ${live.data.remainingAmount.toLocaleString("en-PK")}`);
  }

  const stamp = nowIso();
  const incomeId = await nextIncomeId(input.paymentDate);
  const incomeRow = {
    id: newId(),
    incomeId,
    date: nowIso(input.paymentDate),
    amount,
    category: "STUDENT_FEE" as const,
    source: `${student.data.firstName} ${student.data.lastName} — ${student.data.class.name} ${student.data.class.program.name}`,
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
      feeRecordId: live.data.id,
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

  await recalculateFeeRecord(live.data.id);
  await writeAudit({
    userId: input.userId,
    action: "PAYMENT_RECORDED",
    entityType: "FeePayment",
    entityId: payment.data.id,
    details: { studentId: input.studentId, amount, incomeId: income.data.incomeId },
  });
  return { payment: payment.data, income: income.data, feeRecordId: live.data.id };
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
