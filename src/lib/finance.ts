import type {
  ExpenseCategory,
  FeeStatus,
  IncomeCategory,
  PaymentMethod,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentMonthYear, lastDayOfMonth, startOfDay } from "@/lib/utils";
import { nextExpenseId, nextIncomeId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";

export function deriveFeeStatus(input: {
  expected: number;
  paid: number;
  waived: number;
  dueDate: Date;
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
  if (startOfDay(input.dueDate) < now) {
    return { remaining, status: "OVERDUE" };
  }
  return { remaining, status: "PENDING" };
}

export async function recalculateFeeRecord(
  feeRecordId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const record = await db.feeRecord.findUnique({
    where: { id: feeRecordId },
    include: { payments: { where: { voidedAt: null } } },
  });
  if (!record) throw new Error("Fee record not found");

  const paid = record.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const derived = deriveFeeStatus({
    expected: record.expectedAmount,
    paid,
    waived: record.waivedAmount,
    dueDate: record.dueDate,
  });

  return db.feeRecord.update({
    where: { id: feeRecordId },
    data: {
      paidAmount: paid,
      remainingAmount: derived.remaining,
      status: derived.status,
    },
  });
}

export async function ensureStudentFeeRecord(input: {
  studentId: string;
  month?: number;
  year?: number;
  userId?: string | null;
  db?: Prisma.TransactionClient | typeof prisma;
}) {
  const db = input.db ?? prisma;
  const { month, year } = input.month && input.year
    ? { month: input.month, year: input.year }
    : currentMonthYear();

  const existing = await db.feeRecord.findUnique({
    where: { studentId_year_month: { studentId: input.studentId, year, month } },
  });
  if (existing) return existing;

  const student = await db.student.findUnique({
    where: { id: input.studentId },
    include: { class: true },
  });
  if (!student) throw new Error("Student not found");

  const expected = student.feeAmount;
  const waived = student.studentType === "SCHOLARSHIP" ? expected : 0;
  const dueDate = lastDayOfMonth(year, month);
  const derived = deriveFeeStatus({
    expected,
    paid: 0,
    waived,
    dueDate,
  });

  return db.feeRecord.create({
    data: {
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
      dueDate,
      createdById: input.userId ?? null,
      updatedById: input.userId ?? null,
    },
  });
}

export async function ensureCurrentMonthFees(userId?: string | null) {
  const { month, year } = currentMonthYear();
  const students = await prisma.student.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
    select: { id: true },
  });
  for (const student of students) {
    await ensureStudentFeeRecord({ studentId: student.id, month, year, userId });
  }
  await refreshOverdueStatuses();
}

export async function refreshOverdueStatuses() {
  const today = startOfDay(new Date());
  const overdue = await prisma.feeRecord.findMany({
    where: {
      status: "PENDING",
      dueDate: { lt: today },
    },
  });

  for (const record of overdue) {
    if (record.waivedAmount >= record.expectedAmount) continue;
    await prisma.feeRecord.update({
      where: { id: record.id },
      data: { status: "OVERDUE" },
    });
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

  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({
      where: { id: input.studentId },
      include: { class: { include: { program: true } } },
    });
    if (!student || student.deletedAt) throw new Error("Student not found");

    const feeRecord = await ensureStudentFeeRecord({
      studentId: student.id,
      month: input.month,
      year: input.year,
      userId: input.userId,
      db: tx,
    });

    const live = await tx.feeRecord.findUniqueOrThrow({
      where: { id: feeRecord.id },
      include: { payments: { where: { voidedAt: null } } },
    });

    if (live.status === "WAIVED") {
      throw new Error("This fee is waived and does not require payment");
    }

    const remaining = live.remainingAmount;
    if (amount > remaining) {
      throw new Error(`Payment exceeds remaining balance of Rs. ${remaining.toLocaleString("en-PK")}`);
    }

    const incomeId = await nextIncomeId(input.paymentDate, tx);
    const income = await tx.incomeTransaction.create({
      data: {
        incomeId,
        date: input.paymentDate,
        amount,
        category: "STUDENT_FEE",
        source: `${student.firstName} ${student.lastName} — ${student.class.name} ${student.class.program.name}`,
        studentId: student.id,
        classId: student.classId,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber ?? null,
        notes: input.notes ?? null,
        createdById: input.userId,
        updatedById: input.userId,
      },
    });

    const payment = await tx.feePayment.create({
      data: {
        feeRecordId: live.id,
        studentId: student.id,
        amount,
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber ?? null,
        notes: input.notes ?? null,
        incomeTransactionId: income.id,
        createdById: input.userId,
        updatedById: input.userId,
      },
    });

    await recalculateFeeRecord(live.id, tx);

    return { payment, income, feeRecordId: live.id };
  }).then(async (result) => {
    await writeAudit({
      userId: input.userId,
      action: "PAYMENT_RECORDED",
      entityType: "FeePayment",
      entityId: result.payment.id,
      details: {
        studentId: input.studentId,
        amount,
        incomeId: result.income.incomeId,
      },
    });
    return result;
  });
}

export async function voidStudentPayment(input: {
  paymentId: string;
  reason: string;
  userId: string;
}) {
  const payment = await prisma.feePayment.findUnique({
    where: { id: input.paymentId },
  });
  if (!payment) throw new Error("Payment not found");
  if (payment.voidedAt) throw new Error("Payment is already voided");

  await prisma.$transaction(async (tx) => {
    await tx.feePayment.update({
      where: { id: payment.id },
      data: {
        voidedAt: new Date(),
        voidedById: input.userId,
        voidReason: input.reason,
        updatedById: input.userId,
      },
    });
    await tx.incomeTransaction.update({
      where: { id: payment.incomeTransactionId },
      data: {
        voidedAt: new Date(),
        voidedById: input.userId,
        voidReason: input.reason,
        updatedById: input.userId,
      },
    });
    await recalculateFeeRecord(payment.feeRecordId, tx);
  });

  await writeAudit({
    userId: input.userId,
    action: "PAYMENT_VOIDED",
    entityType: "FeePayment",
    entityId: payment.id,
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
    const student = await prisma.student.findUnique({ where: { id: input.studentId } });
    classId = student?.classId ?? null;
  }

  const income = await prisma.incomeTransaction.create({
    data: {
      incomeId: await nextIncomeId(input.date),
      date: input.date,
      amount,
      category: input.category,
      source: input.source ?? null,
      studentId: input.studentId ?? null,
      classId,
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber ?? null,
      notes: input.notes ?? null,
      createdById: input.userId,
      updatedById: input.userId,
    },
  });

  await writeAudit({
    userId: input.userId,
    action: "INCOME_ADDED",
    entityType: "IncomeTransaction",
    entityId: income.id,
    details: { incomeId: income.incomeId, amount, category: input.category },
  });

  return { income };
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

  const expense = await prisma.expenseTransaction.create({
    data: {
      expenseId: await nextExpenseId(input.date),
      date: input.date,
      amount,
      category: input.category,
      paidTo: input.paidTo,
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber ?? null,
      description: input.description ?? null,
      notes: input.notes ?? null,
      createdById: input.userId,
      updatedById: input.userId,
    },
  });

  await writeAudit({
    userId: input.userId,
    action: "EXPENSE_ADDED",
    entityType: "ExpenseTransaction",
    entityId: expense.id,
    details: { expenseId: expense.expenseId, amount, category: input.category },
  });

  return expense;
}

export async function voidIncome(input: { id: string; reason: string; userId: string }) {
  const income = await prisma.incomeTransaction.findUnique({
    where: { id: input.id },
    include: { feePayment: true },
  });
  if (!income) throw new Error("Income not found");
  if (income.voidedAt) throw new Error("Income is already voided");

  if (income.feePayment) {
    await voidStudentPayment({
      paymentId: income.feePayment.id,
      reason: input.reason,
      userId: input.userId,
    });
    return;
  }

  await prisma.incomeTransaction.update({
    where: { id: income.id },
    data: {
      voidedAt: new Date(),
      voidedById: input.userId,
      voidReason: input.reason,
      updatedById: input.userId,
    },
  });

  await writeAudit({
    userId: input.userId,
    action: "INCOME_VOIDED",
    entityType: "IncomeTransaction",
    entityId: income.id,
    details: { reason: input.reason },
  });
}

export async function voidExpense(input: { id: string; reason: string; userId: string }) {
  const expense = await prisma.expenseTransaction.findUnique({
    where: { id: input.id },
    include: { salaryPayment: true },
  });
  if (!expense) throw new Error("Expense not found");
  if (expense.voidedAt) throw new Error("Expense is already voided");

  if (expense.salaryPayment) {
    const { voidSalaryPayment } = await import("@/lib/salary");
    await voidSalaryPayment({
      paymentId: expense.salaryPayment.id,
      reason: input.reason,
      userId: input.userId,
    });
    return;
  }

  await prisma.expenseTransaction.update({
    where: { id: expense.id },
    data: {
      voidedAt: new Date(),
      voidedById: input.userId,
      voidReason: input.reason,
      updatedById: input.userId,
    },
  });

  await writeAudit({
    userId: input.userId,
    action: "EXPENSE_VOIDED",
    entityType: "ExpenseTransaction",
    entityId: expense.id,
    details: { reason: input.reason },
  });
}
