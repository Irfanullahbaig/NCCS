import type { Database } from "@/lib/supabase/database.types";
import type { ExpenseCategory, FeeStatus, IncomeCategory, PaymentMethod } from "@/lib/enums";
import { db, newId, nowIso } from "@/lib/db";
import {
  calendarDateFromValue,
  calendarDateInKarachi,
  currentMonthYear,
  feeDueDate,
  feeDueDateIso,
  monthLabel,
} from "@/lib/utils";
import {
  computeFeeState,
  DEFAULT_LATE_FEE_POLICY,
  isBeforeAdmission,
  LATE_FEE_SETTING_KEYS,
  lateFeeFor,
  lateFeeReasonLabel,
  type FeePaymentLike,
  type LateFeePolicy,
} from "@/lib/late-fee";
import { nextExpenseId, nextIncomeId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";

type FeeRecordRow = Database["public"]["Tables"]["FeeRecord"]["Row"];
type FeeRecordWithContext = FeeRecordRow & {
  student?: { dateOfAdmission: string } | null;
  payments?: FeePaymentLike[] | null;
};

const FEE_CONTEXT = "*, student:Student(dateOfAdmission), payments:FeePayment(amount, paymentDate, voidedAt)";

let policyCache: { value: LateFeePolicy; at: number } | null = null;

export function invalidateLateFeePolicy() {
  policyCache = null;
}

export async function getLateFeePolicy(): Promise<LateFeePolicy> {
  if (policyCache && Date.now() - policyCache.at < 30_000) return policyCache.value;
  const { data, error } = await db()
    .from("Setting")
    .select("key, value")
    .in("key", Object.values(LATE_FEE_SETTING_KEYS));
  if (error) return DEFAULT_LATE_FEE_POLICY;
  const map = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
  const startMonth = map[LATE_FEE_SETTING_KEYS.startMonth];
  const value: LateFeePolicy = {
    chargeOnPartial: map[LATE_FEE_SETTING_KEYS.chargeOnPartial]
      ? map[LATE_FEE_SETTING_KEYS.chargeOnPartial] === "true"
      : DEFAULT_LATE_FEE_POLICY.chargeOnPartial,
    startMonth: /^\d{4}-\d{2}$/.test(startMonth ?? "") ? startMonth : DEFAULT_LATE_FEE_POLICY.startMonth,
  };
  policyCache = { value, at: Date.now() };
  return value;
}

function stateFor(record: FeeRecordWithContext, policy: LateFeePolicy, extraPayments: FeePaymentLike[] = []) {
  return computeFeeState({
    year: record.year,
    month: record.month,
    expected: record.expectedAmount,
    waived: record.waivedAmount,
    fineWaived: record.fineWaived,
    admissionDate: record.student?.dateOfAdmission ?? null,
    payments: [...(record.payments ?? []), ...extraPayments],
    policy,
  });
}

/** Re-derives paid, late fee, remaining and status, and saves only when something changed. */
async function syncFeeRecord(record: FeeRecordWithContext, policy: LateFeePolicy): Promise<FeeRecordRow> {
  const state = stateFor(record, policy);
  const unchanged =
    Number(record.paidAmount) === state.paid &&
    Number(record.fineAmount ?? 0) === state.fine &&
    Number(record.remainingAmount) === state.remaining &&
    record.status === state.status;
  const row: FeeRecordWithContext = { ...record };
  delete row.student;
  delete row.payments;
  if (unchanged) return row;

  const { data, error } = await db()
    .from("FeeRecord")
    .update({
      paidAmount: state.paid,
      fineAmount: state.fine,
      remainingAmount: state.remaining,
      status: state.status,
      updatedAt: nowIso(),
    })
    .eq("id", record.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function loadFeeRecord(feeRecordId: string) {
  const { data, error } = await db().from("FeeRecord").select(FEE_CONTEXT).eq("id", feeRecordId).maybeSingle();
  if (error) throw error;
  return data as FeeRecordWithContext | null;
}

export async function recalculateFeeRecord(feeRecordId: string) {
  const record = await loadFeeRecord(feeRecordId);
  if (!record) throw new Error("Fee record not found");
  return syncFeeRecord(record, await getLateFeePolicy());
}

/** Used after a student's admission date or late-fee settings change. */
export async function recalculateStudentFees(studentId: string) {
  const policy = await getLateFeePolicy();
  const { data, error } = await db().from("FeeRecord").select(FEE_CONTEXT).eq("studentId", studentId);
  if (error) throw error;
  for (const record of (data ?? []) as FeeRecordWithContext[]) {
    await syncFeeRecord(record, policy);
  }
}

/** Full pass over every fee record, for when the late-fee settings change. */
export async function recalculateAllFees() {
  const policy = await getLateFeePolicy();
  const { data, error } = await db().from("FeeRecord").select(FEE_CONTEXT);
  if (error) throw error;
  const records = (data ?? []) as FeeRecordWithContext[];
  for (let index = 0; index < records.length; index += 10) {
    await Promise.all(records.slice(index, index + 10).map((record) => syncFeeRecord(record, policy)));
  }
  invalidateFeeMaintenance();
}

/**
 * Only records that can still change are checked: unpaid ones, and ones that
 * carry a late fee (so a fee removed by a rule or setting change is cleared).
 */
export async function syncOpenFeeRecords() {
  const policy = await getLateFeePolicy();
  const [openRes, finedRes] = await Promise.all([
    db().from("FeeRecord").select(FEE_CONTEXT).in("status", ["PENDING", "OVERDUE", "PARTIALLY_PAID"]),
    db().from("FeeRecord").select(FEE_CONTEXT).gt("fineAmount", 0),
  ]);
  if (openRes.error) throw openRes.error;
  if (finedRes.error) throw finedRes.error;
  const records = new Map<string, FeeRecordWithContext>();
  for (const record of [...(openRes.data ?? []), ...(finedRes.data ?? [])] as FeeRecordWithContext[]) {
    records.set(record.id, record);
  }
  const pending = [...records.values()];
  for (let index = 0; index < pending.length; index += 10) {
    await Promise.all(pending.slice(index, index + 10).map((record) => syncFeeRecord(record, policy)));
  }
}

export async function ensureStudentFeeRecord(input: {
  studentId: string;
  month?: number;
  year?: number;
  userId?: string | null;
  /** Throw instead of returning null when the month is before the student joined. */
  strict?: boolean;
}): Promise<FeeRecordRow | null> {
  const { month, year } = input.month && input.year ? { month: input.month, year: input.year } : currentMonthYear();
  const policy = await getLateFeePolicy();

  const existing = await db()
    .from("FeeRecord")
    .select(FEE_CONTEXT)
    .eq("studentId", input.studentId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return syncFeeRecord(existing.data as FeeRecordWithContext, policy);

  const student = await db()
    .from("Student")
    .select("*, class:Class(*)")
    .eq("id", input.studentId)
    .maybeSingle();
  if (student.error) throw student.error;
  if (!student.data || !student.data.class) throw new Error("Student not found");

  if (isBeforeAdmission(year, month, student.data.dateOfAdmission)) {
    if (!input.strict) return null;
    const joined = calendarDateFromValue(student.data.dateOfAdmission).slice(0, 7).split("-").map(Number);
    throw new Error(
      `${student.data.firstName} joined in ${monthLabel(joined[1], joined[0])}, so there is no fee for ${monthLabel(month, year)}.`,
    );
  }

  const expected = student.data.feeAmount;
  const waived = student.data.studentType === "SCHOLARSHIP" ? expected : 0;
  const dueDate = feeDueDate(year, month);
  const state = computeFeeState({
    year,
    month,
    expected,
    waived,
    admissionDate: student.data.dateOfAdmission,
    payments: [],
    policy,
  });
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
      fineAmount: state.fine,
      remainingAmount: state.remaining,
      status: state.status,
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
  const policy = await getLateFeePolicy();
  const [studentsRes, existingRes] = await Promise.all([
    db()
      .from("Student")
      .select("id, classId, feeAmount, studentType, dateOfAdmission, class:Class(academicYearId)")
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
    // A student whose admission date is in a later month has no fee yet.
    if (isBeforeAdmission(year, month, student.dateOfAdmission)) return [];
    const expected = student.feeAmount;
    const waived = student.studentType === "SCHOLARSHIP" ? expected : 0;
    const state = computeFeeState({
      year,
      month,
      expected,
      waived,
      admissionDate: student.dateOfAdmission,
      payments: [],
      policy,
    });
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
      fineAmount: state.fine,
      remainingAmount: state.remaining,
      status: state.status,
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
  await syncOpenFeeRecords();
}

export type FeeMonthState = {
  month: number;
  year: number;
  label: string;
  feeRecordId: string | null;
  /** True when no fee can be charged for this month (before the student joined). */
  blocked: boolean;
  blockedReason: string | null;
  expected: number;
  waived: number;
  paid: number;
  onTimePaid: number;
  fine: number;
  fineWaived: boolean;
  remaining: number;
  status: FeeStatus;
  dueDate: string;
  lateFeeNote: string;
  /** Late fee that would apply to a payment made after the due date. */
  lateFeeIfPaidLate: number;
};

/** Month-by-month dues for one student and year, for the payment form. */
export async function getStudentFeeMonths(studentId: string, year: number): Promise<FeeMonthState[]> {
  const policy = await getLateFeePolicy();
  const [studentRes, recordsRes] = await Promise.all([
    db().from("Student").select("id, firstName, feeAmount, studentType, dateOfAdmission").eq("id", studentId).maybeSingle(),
    db().from("FeeRecord").select(FEE_CONTEXT).eq("studentId", studentId).eq("year", year),
  ]);
  if (studentRes.error) throw studentRes.error;
  if (recordsRes.error) throw recordsRes.error;
  const student = studentRes.data;
  if (!student) throw new Error("Student not found");
  const records = (recordsRes.data ?? []) as FeeRecordWithContext[];

  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const found = records.find((record) => record.month === month);
    const record: FeeRecordWithContext = found ?? {
      id: "",
      studentId,
      classId: "",
      academicYearId: "",
      month,
      year,
      dueDate: "",
      expectedAmount: student.feeAmount,
      waivedAmount: student.studentType === "SCHOLARSHIP" ? student.feeAmount : 0,
      paidAmount: 0,
      fineAmount: 0,
      fineWaived: false,
      fineWaivedAt: null,
      fineWaivedById: null,
      fineWaiveReason: null,
      remainingAmount: 0,
      status: "PENDING",
      createdAt: "",
      updatedAt: "",
      createdById: null,
      updatedById: null,
      student: { dateOfAdmission: student.dateOfAdmission },
      payments: [],
    };
    record.student = { dateOfAdmission: student.dateOfAdmission };
    const state = stateFor(record, policy);
    const blocked = !found && isBeforeAdmission(year, month, student.dateOfAdmission);
    const lateProbe = lateFeeFor({
      year,
      month,
      expected: record.expectedAmount,
      waived: record.waivedAmount,
      fineWaived: record.fineWaived,
      admissionDate: student.dateOfAdmission,
      payments: record.payments ?? [],
      policy,
      // Ask "what if this is paid after the due date?"
      now: new Date(Date.UTC(year, month, 1)),
    });
    return {
      month,
      year,
      label: monthLabel(month, year),
      feeRecordId: found?.id ?? null,
      blocked,
      blockedReason: blocked ? `${student.firstName} joined after ${monthLabel(month, year)}` : null,
      expected: record.expectedAmount,
      waived: record.waivedAmount,
      paid: state.paid,
      onTimePaid: (record.payments ?? [])
        .filter((payment) => !payment.voidedAt && calendarDateFromValue(payment.paymentDate) <= feeDueDateIso(year, month))
        .reduce((sum, payment) => sum + payment.amount, 0),
      fine: state.fine,
      fineWaived: Boolean(record.fineWaived),
      remaining: state.remaining,
      status: state.status,
      dueDate: feeDueDateIso(year, month),
      lateFeeNote: lateFeeReasonLabel(state.reason, year, month),
      lateFeeIfPaidLate: lateProbe.fine,
    };
  });
}

export async function setLateFeeWaiver(input: { feeRecordId: string; waive: boolean; reason?: string | null; userId: string }) {
  const record = await loadFeeRecord(input.feeRecordId);
  if (!record) throw new Error("Fee record not found");
  if (input.waive && record.fineWaived) throw new Error("The late fee is already waived");
  if (!input.waive && !record.fineWaived) throw new Error("The late fee is not waived");
  const reason = input.reason?.trim() || null;
  if (input.waive && !reason) throw new Error("Enter a reason for waiving the late fee");

  const stamp = nowIso();
  const updated = await db()
    .from("FeeRecord")
    .update({
      fineWaived: input.waive,
      fineWaivedAt: input.waive ? stamp : null,
      fineWaivedById: input.waive ? input.userId : null,
      fineWaiveReason: input.waive ? reason : null,
      updatedAt: stamp,
      updatedById: input.userId,
    })
    .eq("id", record.id);
  if (updated.error) throw updated.error;
  const synced = await recalculateFeeRecord(record.id);
  invalidateFeeMaintenance();
  await writeAudit({
    userId: input.userId,
    action: input.waive ? "LATE_FEE_WAIVED" : "LATE_FEE_RESTORED",
    entityType: "FeeRecord",
    entityId: record.id,
    details: {
      studentId: record.studentId,
      month: record.month,
      year: record.year,
      previousFine: Number(record.fineAmount ?? 0),
      reason,
    },
  });
  return synced;
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
  if (calendarDateFromValue(input.paymentDate) > calendarDateInKarachi()) {
    throw new Error("Payment date cannot be in the future");
  }

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
    strict: true,
  });
  if (!feeRecord) throw new Error("Fee record not found");
  if (feeRecord.status === "WAIVED") throw new Error("This fee is waived and does not require payment");

  // The balance depends on the payment date: paying in full by the due date
  // clears the late fee, while a later payment has to cover it.
  const context = await loadFeeRecord(feeRecord.id);
  if (!context) throw new Error("Fee record not found");
  const policy = await getLateFeePolicy();
  const paidBefore = stateFor(context, policy).paid;
  const base = Math.max(0, feeRecord.expectedAmount - feeRecord.waivedAmount - paidBefore);
  const fineIfFull = stateFor(context, policy, [{ amount: base, paymentDate: input.paymentDate }]).fine;
  const maxAllowed = base + fineIfFull;
  if (maxAllowed <= 0) {
    throw new Error(`${monthLabel(feeRecord.month, feeRecord.year)} is already fully paid`);
  }
  if (amount > maxAllowed) {
    throw new Error(
      `Payment exceeds the balance of Rs. ${maxAllowed.toLocaleString("en-PK")} for ${monthLabel(feeRecord.month, feeRecord.year)}`,
    );
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
    details: { reason: input.reason, original: pick(payment.data, [...PAYMENT_FIELDS, "studentId", "feeRecordId", "incomeTransactionId"]) },
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
    details: { reason: input.reason, original: { incomeId: income.data.incomeId, ...pick(income.data, INCOME_FIELDS) } },
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
    details: { reason: input.reason, original: { expenseId: expense.data.expenseId, ...pick(expense.data, EXPENSE_FIELDS) } },
  });
}

const PAYMENT_FIELDS = ["amount", "paymentDate", "paymentMethod", "referenceNumber", "notes"] as const;

function pick<T extends Record<string, unknown>>(row: T, keys: readonly string[]) {
  return Object.fromEntries(keys.map((key) => [key, row[key] ?? null]));
}

function assertNotFuture(date: Date) {
  if (calendarDateFromValue(date) > calendarDateInKarachi()) throw new Error("Date cannot be in the future");
}

/**
 * Corrects a student fee payment. Amount, date, method and notes are changed in
 * place on both the payment and its Income entry. Moving it to another student
 * or fee month records a new payment first, then deletes (voids) the old one,
 * so the money is never counted twice and the original stays in history.
 */
export async function updateStudentPayment(input: {
  paymentId: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: PaymentMethod;
  referenceNumber?: string | null;
  notes?: string | null;
  studentId?: string | null;
  month?: number | null;
  year?: number | null;
  userId: string;
}) {
  const amount = Math.round(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Payment amount must be greater than zero");
  assertNotFuture(input.paymentDate);

  const payment = await db()
    .from("FeePayment")
    .select("*, feeRecord:FeeRecord(*), income:IncomeTransaction(category)")
    .eq("id", input.paymentId)
    .maybeSingle();
  if (payment.error) throw payment.error;
  if (!payment.data || !payment.data.feeRecord) throw new Error("Payment not found");
  if (payment.data.voidedAt) throw new Error("This payment was deleted and cannot be edited");
  const before = pick(payment.data, PAYMENT_FIELDS);
  const record = payment.data.feeRecord;

  const studentId = input.studentId || payment.data.studentId;
  const month = input.month || record.month;
  const year = input.year || record.year;
  if (studentId !== payment.data.studentId || month !== record.month || year !== record.year) {
    const income = Array.isArray(payment.data.income) ? payment.data.income[0] : payment.data.income;
    const moved = await recordStudentPayment({
      studentId,
      amount,
      paymentDate: input.paymentDate,
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      month,
      year,
      category: income?.category ?? "STUDENT_FEE",
      userId: input.userId,
    });
    await voidStudentPayment({
      paymentId: payment.data.id,
      reason: `Moved to ${monthLabel(month, year)}${studentId !== payment.data.studentId ? " for another student" : ""} as ${moved.income.incomeId}`,
      userId: input.userId,
    });
    await writeAudit({
      userId: input.userId,
      action: "PAYMENT_EDITED",
      entityType: "FeePayment",
      entityId: payment.data.id,
      details: {
        before: { ...before, studentId: payment.data.studentId, month: record.month, year: record.year },
        after: { amount, studentId, month, year, newPaymentId: moved.payment.id, newIncomeId: moved.income.incomeId },
      },
    });
    return { studentIds: [...new Set([payment.data.studentId, studentId])] };
  }

  // Same month: the new amount may not exceed what is owed once this payment is set aside.
  const context = await loadFeeRecord(record.id);
  if (!context) throw new Error("Fee record not found");
  const others = await db()
    .from("FeePayment")
    .select("amount, paymentDate, voidedAt")
    .eq("feeRecordId", record.id)
    .neq("id", payment.data.id)
    .is("voidedAt", null);
  if (others.error) throw others.error;
  const policy = await getLateFeePolicy();
  const withoutThis: FeeRecordWithContext = { ...context, payments: others.data ?? [] };
  const paidOthers = stateFor(withoutThis, policy).paid;
  const base = Math.max(0, record.expectedAmount - record.waivedAmount - paidOthers);
  const fineIfFull = stateFor(withoutThis, policy, [{ amount: base, paymentDate: input.paymentDate }]).fine;
  const maxAllowed = base + fineIfFull;
  if (amount > maxAllowed) {
    throw new Error(`The most that can be paid for ${monthLabel(record.month, record.year)} is Rs. ${maxAllowed.toLocaleString("en-PK")}`);
  }

  const stamp = nowIso();
  const changes = {
    amount,
    paymentMethod: input.paymentMethod,
    referenceNumber: input.referenceNumber ?? null,
    notes: input.notes ?? null,
    updatedAt: stamp,
    updatedById: input.userId,
  };
  const payUpdate = await db()
    .from("FeePayment")
    .update({ ...changes, paymentDate: nowIso(input.paymentDate) })
    .eq("id", payment.data.id);
  if (payUpdate.error) throw payUpdate.error;
  const incomeUpdate = await db()
    .from("IncomeTransaction")
    .update({ ...changes, date: nowIso(input.paymentDate) })
    .eq("id", payment.data.incomeTransactionId);
  if (incomeUpdate.error) throw incomeUpdate.error;
  await recalculateFeeRecord(record.id);
  invalidateFeeMaintenance();
  await writeAudit({
    userId: input.userId,
    action: "PAYMENT_EDITED",
    entityType: "FeePayment",
    entityId: payment.data.id,
    details: {
      before,
      after: { ...pick(changes, PAYMENT_FIELDS), paymentDate: nowIso(input.paymentDate) },
      incomeTransactionId: payment.data.incomeTransactionId,
    },
  });
  return { studentIds: [payment.data.studentId] };
}

const INCOME_FIELDS = ["date", "amount", "category", "source", "studentId", "classId", "paymentMethod", "referenceNumber", "notes"] as const;

/** Edits an income entry. Student fee income is routed through the fee payment it belongs to. */
export async function updateIncome(input: {
  id: string;
  date: Date;
  amount: number;
  category: IncomeCategory;
  source?: string | null;
  studentId?: string | null;
  classId?: string | null;
  paymentMethod: PaymentMethod;
  referenceNumber?: string | null;
  notes?: string | null;
  month?: number | null;
  year?: number | null;
  userId: string;
}) {
  const income = await db()
    .from("IncomeTransaction")
    .select("*, feePayment:FeePayment(id)")
    .eq("id", input.id)
    .maybeSingle();
  if (income.error) throw income.error;
  if (!income.data) throw new Error("Income not found");
  if (income.data.voidedAt) throw new Error("This entry was deleted and cannot be edited");

  const linked = Array.isArray(income.data.feePayment) ? income.data.feePayment[0] : income.data.feePayment;
  if (linked) {
    return updateStudentPayment({
      paymentId: linked.id,
      amount: input.amount,
      paymentDate: input.date,
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      studentId: input.studentId,
      month: input.month,
      year: input.year,
      userId: input.userId,
    });
  }

  const amount = Math.round(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero");
  assertNotFuture(input.date);
  if (input.category === "STUDENT_FEE" && income.data.category !== "STUDENT_FEE") {
    throw new Error("Student fees must be recorded with Record fee payment so the fee balance stays correct");
  }

  let classId = input.classId ?? null;
  if (input.studentId && !classId) {
    const student = await db().from("Student").select("classId").eq("id", input.studentId).maybeSingle();
    if (student.error) throw student.error;
    classId = student.data?.classId ?? null;
  }
  const after = {
    date: nowIso(input.date),
    amount,
    category: input.category,
    source: input.source ?? null,
    studentId: input.studentId ?? null,
    classId,
    paymentMethod: input.paymentMethod,
    referenceNumber: input.referenceNumber ?? null,
    notes: input.notes ?? null,
  };
  const { error } = await db()
    .from("IncomeTransaction")
    .update({ ...after, updatedAt: nowIso(), updatedById: input.userId })
    .eq("id", income.data.id);
  if (error) throw error;
  await writeAudit({
    userId: input.userId,
    action: "INCOME_EDITED",
    entityType: "IncomeTransaction",
    entityId: income.data.id,
    details: { incomeId: income.data.incomeId, before: pick(income.data, INCOME_FIELDS), after },
  });
  return { studentIds: [income.data.studentId, input.studentId].filter((id): id is string => Boolean(id)) };
}

const EXPENSE_FIELDS = ["date", "amount", "category", "paidTo", "paymentMethod", "referenceNumber", "description", "notes"] as const;

/** Edits an expense. Salary payments also update the staff member's salary record. */
export async function updateExpense(input: {
  id: string;
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
  const expense = await db()
    .from("ExpenseTransaction")
    .select("*, salaryPayment:SalaryPayment(id, staffId)")
    .eq("id", input.id)
    .maybeSingle();
  if (expense.error) throw expense.error;
  if (!expense.data) throw new Error("Expense not found");
  if (expense.data.voidedAt) throw new Error("This entry was deleted and cannot be edited");

  const amount = Math.round(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero");
  assertNotFuture(input.date);
  const paidTo = input.paidTo.trim();
  if (!paidTo) throw new Error("Enter who was paid");

  const linked = Array.isArray(expense.data.salaryPayment) ? expense.data.salaryPayment[0] : expense.data.salaryPayment;
  if (linked) {
    const { updateSalaryPayment } = await import("@/lib/salary");
    await updateSalaryPayment({
      paymentId: linked.id,
      amount,
      paymentDate: input.date,
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      userId: input.userId,
    });
    return { staffId: linked.staffId };
  }

  const after = {
    date: nowIso(input.date),
    amount,
    category: input.category,
    paidTo,
    paymentMethod: input.paymentMethod,
    referenceNumber: input.referenceNumber ?? null,
    description: input.description ?? null,
    notes: input.notes ?? null,
  };
  const { error } = await db()
    .from("ExpenseTransaction")
    .update({ ...after, updatedAt: nowIso(), updatedById: input.userId })
    .eq("id", expense.data.id);
  if (error) throw error;
  await writeAudit({
    userId: input.userId,
    action: "EXPENSE_EDITED",
    entityType: "ExpenseTransaction",
    entityId: expense.data.id,
    details: { expenseId: expense.data.expenseId, before: pick(expense.data, EXPENSE_FIELDS), after },
  });
  return { staffId: null };
}

/**
 * Changes what a student owes for one fee month (the fee itself, or a discount).
 * Receivables, outstanding and dashboard totals all read these records, so they
 * follow automatically.
 */
export async function adjustFeeRecord(input: {
  studentId: string;
  month: number;
  year: number;
  expectedAmount: number;
  waivedAmount: number;
  reason: string;
  userId: string;
}) {
  const expected = Math.round(input.expectedAmount);
  const waived = Math.round(input.waivedAmount);
  const reason = input.reason.trim();
  if (!Number.isFinite(expected) || expected < 0) throw new Error("Fee amount cannot be negative");
  if (!Number.isFinite(waived) || waived < 0) throw new Error("Discount cannot be negative");
  if (waived > expected) throw new Error("Discount cannot be more than the fee");
  if (!reason) throw new Error("Enter a reason for the adjustment");

  const created = await ensureStudentFeeRecord({
    studentId: input.studentId,
    month: input.month,
    year: input.year,
    userId: input.userId,
    strict: true,
  });
  if (!created) throw new Error("Fee record not found");
  const context = await loadFeeRecord(created.id);
  if (!context) throw new Error("Fee record not found");
  const policy = await getLateFeePolicy();
  const next = stateFor({ ...context, expectedAmount: expected, waivedAmount: waived }, policy);
  if (next.paid > expected - waived + next.fine) {
    throw new Error(
      `Rs. ${next.paid.toLocaleString("en-PK")} is already paid for ${monthLabel(input.month, input.year)}. Edit or delete a payment first.`,
    );
  }

  const { error } = await db()
    .from("FeeRecord")
    .update({ expectedAmount: expected, waivedAmount: waived, updatedAt: nowIso(), updatedById: input.userId })
    .eq("id", created.id);
  if (error) throw error;
  const synced = await recalculateFeeRecord(created.id);
  invalidateFeeMaintenance();
  await writeAudit({
    userId: input.userId,
    action: "FEE_ADJUSTED",
    entityType: "FeeRecord",
    entityId: created.id,
    details: {
      studentId: input.studentId,
      month: input.month,
      year: input.year,
      before: { expectedAmount: context.expectedAmount, waivedAmount: context.waivedAmount, remainingAmount: context.remainingAmount },
      after: { expectedAmount: expected, waivedAmount: waived, remainingAmount: synced.remainingAmount },
      reason,
    },
  });
  return synced;
}
