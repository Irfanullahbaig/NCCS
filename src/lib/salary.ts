import type { PaymentMethod, Prisma, SalaryStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { nextExpenseId } from "@/lib/ids";
import { currentMonthYear, fullName } from "@/lib/utils";

function deriveSalaryStatus(expected: number, paid: number): { remaining: number; status: SalaryStatus } {
  const remaining = Math.max(0, Math.round(expected) - Math.round(paid));
  if (remaining <= 0 && expected > 0) return { remaining: 0, status: "PAID" };
  if (paid > 0) return { remaining, status: "PARTIALLY_PAID" };
  return { remaining, status: "PENDING" };
}

export async function recalculateSalaryRecord(
  salaryRecordId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const record = await db.salaryRecord.findUnique({
    where: { id: salaryRecordId },
    include: { payments: { where: { voidedAt: null } } },
  });
  if (!record) throw new Error("Salary record not found");

  const paid = record.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const derived = deriveSalaryStatus(record.expectedAmount, paid);

  return db.salaryRecord.update({
    where: { id: salaryRecordId },
    data: {
      paidAmount: paid,
      remainingAmount: derived.remaining,
      status: derived.status,
    },
  });
}

export async function ensureSalaryRecord(input: {
  staffId: string;
  month?: number;
  year?: number;
  userId?: string | null;
  db?: Prisma.TransactionClient | typeof prisma;
}) {
  const db = input.db ?? prisma;
  const { month, year } = input.month && input.year
    ? { month: input.month, year: input.year }
    : currentMonthYear();

  const staff = await db.staff.findUnique({ where: { id: input.staffId } });
  if (!staff) throw new Error("Teacher not found");

  const existing = await db.salaryRecord.findUnique({
    where: { staffId_year_month: { staffId: input.staffId, year, month } },
  });
  if (existing) {
    if (existing.paidAmount === 0 && existing.expectedAmount !== staff.salaryAmount) {
      const derived = deriveSalaryStatus(staff.salaryAmount, 0);
      return db.salaryRecord.update({
        where: { id: existing.id },
        data: {
          expectedAmount: staff.salaryAmount,
          remainingAmount: derived.remaining,
          status: derived.status,
          updatedById: input.userId ?? null,
        },
      });
    }
    return existing;
  }

  const expected = Math.max(0, staff.salaryAmount);
  const derived = deriveSalaryStatus(expected, 0);

  return db.salaryRecord.create({
    data: {
      staffId: staff.id,
      month,
      year,
      expectedAmount: expected,
      paidAmount: 0,
      remainingAmount: derived.remaining,
      status: derived.status,
      createdById: input.userId ?? null,
      updatedById: input.userId ?? null,
    },
  });
}

export async function ensureCurrentMonthSalaries(userId?: string | null) {
  const { month, year } = currentMonthYear();
  const staff = await prisma.staff.findMany({
    where: { employmentStatus: { in: ["ACTIVE", "ON_LEAVE"] }, salaryAmount: { gt: 0 } },
    select: { id: true },
  });
  for (const member of staff) {
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
  userId: string;
}) {
  const amount = Math.round(input.amount);
  if (amount <= 0) throw new Error("Paid amount must be greater than zero");

  return prisma.$transaction(async (tx) => {
    const staff = await tx.staff.findUnique({ where: { id: input.staffId } });
    if (!staff) throw new Error("Teacher not found");
    if (staff.salaryAmount <= 0) throw new Error("Set the teacher's monthly salary before recording a payment");

    const record = await ensureSalaryRecord({
      staffId: staff.id,
      month: input.month,
      year: input.year,
      userId: input.userId,
      db: tx,
    });

    const live = await tx.salaryRecord.findUniqueOrThrow({ where: { id: record.id } });
    if (amount > live.remainingAmount) {
      throw new Error(`Payment exceeds remaining salary of Rs. ${live.remainingAmount.toLocaleString("en-PK")}`);
    }

    const name = fullName(staff.firstName, staff.lastName);
    const expense = await tx.expenseTransaction.create({
      data: {
        expenseId: await nextExpenseId(input.paymentDate, tx),
        date: input.paymentDate,
        amount,
        category: "SALARIES",
        paidTo: name,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber ?? null,
        description: `Salary ${live.month}/${live.year} — ${name}`,
        notes: input.notes ?? null,
        createdById: input.userId,
        updatedById: input.userId,
      },
    });

    const payment = await tx.salaryPayment.create({
      data: {
        salaryRecordId: live.id,
        staffId: staff.id,
        amount,
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber ?? null,
        notes: input.notes ?? null,
        expenseTransactionId: expense.id,
        createdById: input.userId,
        updatedById: input.userId,
      },
    });

    await recalculateSalaryRecord(live.id, tx);
    return { payment, expense, salaryRecordId: live.id };
  }).then(async (result) => {
    await writeAudit({
      userId: input.userId,
      action: "SALARY_PAYMENT_RECORDED",
      entityType: "SalaryPayment",
      entityId: result.payment.id,
      details: { staffId: input.staffId, amount, expenseId: result.expense.expenseId },
    });
    return result;
  });
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

  return prisma.$transaction(async (tx) => {
    const payment = await tx.salaryPayment.findUnique({
      where: { id: input.paymentId },
      include: { salaryRecord: true },
    });
    if (!payment || payment.voidedAt) throw new Error("Salary payment not found");

    const otherPaid = payment.salaryRecord.paidAmount - payment.amount;
    const remainingIfRemoved = Math.max(0, payment.salaryRecord.expectedAmount - otherPaid);
    if (amount > remainingIfRemoved) {
      throw new Error(`Payment exceeds remaining salary of Rs. ${remainingIfRemoved.toLocaleString("en-PK")}`);
    }

    await tx.salaryPayment.update({
      where: { id: payment.id },
      data: {
        amount,
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber ?? null,
        notes: input.notes ?? null,
        updatedById: input.userId,
      },
    });
    await tx.expenseTransaction.update({
      where: { id: payment.expenseTransactionId },
      data: {
        amount,
        date: input.paymentDate,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber ?? null,
        notes: input.notes ?? null,
        updatedById: input.userId,
      },
    });
    await recalculateSalaryRecord(payment.salaryRecordId, tx);
    return payment.id;
  }).then(async (id) => {
    await writeAudit({
      userId: input.userId,
      action: "SALARY_PAYMENT_EDITED",
      entityType: "SalaryPayment",
      entityId: id,
      details: { amount },
    });
    return { ok: true as const, id };
  });
}

export async function voidSalaryPayment(input: { paymentId: string; reason: string; userId: string }) {
  const payment = await prisma.salaryPayment.findUnique({ where: { id: input.paymentId } });
  if (!payment) throw new Error("Salary payment not found");
  if (payment.voidedAt) throw new Error("Payment is already voided");

  await prisma.$transaction(async (tx) => {
    await tx.salaryPayment.update({
      where: { id: payment.id },
      data: {
        voidedAt: new Date(),
        voidedById: input.userId,
        voidReason: input.reason,
        updatedById: input.userId,
      },
    });
    await tx.expenseTransaction.update({
      where: { id: payment.expenseTransactionId },
      data: {
        voidedAt: new Date(),
        voidedById: input.userId,
        voidReason: input.reason,
        updatedById: input.userId,
      },
    });
    await recalculateSalaryRecord(payment.salaryRecordId, tx);
  });

  await writeAudit({
    userId: input.userId,
    action: "SALARY_PAYMENT_VOIDED",
    entityType: "SalaryPayment",
    entityId: payment.id,
    details: { reason: input.reason },
  });
}
