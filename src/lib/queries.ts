import type { Prisma } from "@prisma/client";
import { startOfDay, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { prisma } from "@/lib/db";
import { currentMonthYear } from "@/lib/utils";
import { ensureCurrentMonthFees } from "@/lib/finance";

const studentInclude = {
  class: { include: { program: true, academicYear: true } },
} satisfies Prisma.StudentInclude;

export async function getDashboardData() {
  await ensureCurrentMonthFees();
  const now = new Date();
  const { month, year } = currentMonthYear(now);
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [
    totalStudents,
    totalStaff,
    totalClasses,
    typeCounts,
    currentFees,
    todayIncome,
    monthlyIncome,
    monthlyExpenses,
    totalIncome,
    totalExpenses,
    recentPayments,
    recentStudents,
    recentStaff,
    pendingFees,
  ] = await Promise.all([
    prisma.student.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.staff.count(),
    prisma.class.count({ where: { status: "ACTIVE" } }),
    prisma.student.groupBy({
      by: ["studentType"],
      where: { deletedAt: null, status: "ACTIVE" },
      _count: { _all: true },
    }),
    prisma.feeRecord.findMany({
      where: { month, year },
      select: { expectedAmount: true, paidAmount: true, remainingAmount: true, status: true, waivedAmount: true },
    }),
    prisma.incomeTransaction.aggregate({
      where: { voidedAt: null, date: { gte: todayStart } },
      _sum: { amount: true },
    }),
    prisma.incomeTransaction.aggregate({
      where: { voidedAt: null, date: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
    }),
    prisma.expenseTransaction.aggregate({
      where: { voidedAt: null, date: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
    }),
    prisma.incomeTransaction.aggregate({
      where: { voidedAt: null },
      _sum: { amount: true },
    }),
    prisma.expenseTransaction.aggregate({
      where: { voidedAt: null },
      _sum: { amount: true },
    }),
    prisma.feePayment.findMany({
      where: { voidedAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        student: { include: studentInclude },
        incomeTransaction: true,
      },
    }),
    prisma.student.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: studentInclude,
    }),
    prisma.staff.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.feeRecord.findMany({
      where: {
        month,
        year,
        status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
      },
      orderBy: { remainingAmount: "desc" },
      take: 8,
      include: { student: { include: studentInclude } },
    }),
  ]);

  const typeMap = Object.fromEntries(typeCounts.map((row) => [row.studentType, row._count._all]));
  const feeCollected = currentFees.reduce((sum, row) => sum + row.paidAmount, 0);
  const pendingFeeAmount = currentFees.reduce((sum, row) => sum + row.remainingAmount, 0);
  const expectedFees = currentFees.reduce((sum, row) => sum + row.expectedAmount, 0);

  const monthlySeries = await getMonthlyFinanceSeries(now, 6);

  return {
    totalStudents,
    totalStaff,
    totalClasses,
    totalFeeCollected: feeCollected,
    pendingFees: pendingFeeAmount,
    expectedFees,
    todayIncome: todayIncome._sum.amount ?? 0,
    monthlyIncome: monthlyIncome._sum.amount ?? 0,
    monthlyExpenses: monthlyExpenses._sum.amount ?? 0,
    totalIncome: totalIncome._sum.amount ?? 0,
    totalExpenses: totalExpenses._sum.amount ?? 0,
    netBalance: (totalIncome._sum.amount ?? 0) - (totalExpenses._sum.amount ?? 0),
    scholarshipStudents: typeMap.SCHOLARSHIP ?? 0,
    needBasedStudents: typeMap.NEED_BASED ?? 0,
    selfFinancedStudents: typeMap.SELF ?? 0,
    recentPayments,
    recentStudents,
    recentStaff,
    pendingFeeRecords: pendingFees,
    monthlySeries,
    month,
    year,
  };
}

export async function getMonthlyFinanceSeries(now = new Date(), months = 6) {
  const points = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const date = subMonths(now, i);
    const from = startOfMonth(date);
    const to = endOfMonth(date);
    const [income, expenses, fees] = await Promise.all([
      prisma.incomeTransaction.aggregate({
        where: { voidedAt: null, date: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      prisma.expenseTransaction.aggregate({
        where: { voidedAt: null, date: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      prisma.incomeTransaction.aggregate({
        where: {
          voidedAt: null,
          category: "STUDENT_FEE",
          date: { gte: from, lte: to },
        },
        _sum: { amount: true },
      }),
    ]);
    points.push({
      label: date.toLocaleString("en-US", { month: "short" }),
      income: income._sum.amount ?? 0,
      expenses: expenses._sum.amount ?? 0,
      fees: fees._sum.amount ?? 0,
    });
  }
  return points;
}

export async function getClassDashboard(classId: string) {
  await ensureCurrentMonthFees();
  const { month, year } = currentMonthYear();
  const schoolClass = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      program: true,
      academicYear: true,
      classTeacher: true,
      subjects: { include: { subject: true } },
      students: {
        where: { deletedAt: null },
        include: {
          feeRecords: { where: { month, year } },
        },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      },
    },
  });
  if (!schoolClass) return null;

  const rows = schoolClass.students.map((student) => {
    const fee = student.feeRecords[0];
    return {
      student,
      studentType: student.studentType,
      fee: fee?.expectedAmount ?? student.feeAmount,
      paid: fee?.paidAmount ?? 0,
      remaining: fee?.remainingAmount ?? (student.studentType === "SCHOLARSHIP" ? 0 : student.feeAmount),
      status: fee?.status ?? (student.studentType === "SCHOLARSHIP" ? "WAIVED" : "PENDING"),
    };
  });

  const paid = rows.filter((row) => row.status === "PAID").length;
  const partial = rows.filter((row) => row.status === "PARTIALLY_PAID").length;
  const pending = rows.filter((row) => row.status === "PENDING" || row.status === "OVERDUE").length;
  const waived = rows.filter((row) => row.status === "WAIVED").length;

  return {
    schoolClass,
    rows,
    month,
    year,
    totals: {
      students: rows.length,
      paid,
      partial,
      pending,
      waived,
      expected: rows.reduce((sum, row) => sum + row.fee, 0),
      collected: rows.reduce((sum, row) => sum + row.paid, 0),
      outstanding: rows.reduce((sum, row) => sum + row.remaining, 0),
    },
  };
}

export async function getFinanceDashboard(filters: {
  from?: Date;
  to?: Date;
  academicYearId?: string;
  classId?: string;
  programId?: string;
  category?: string;
  paymentMethod?: string;
}) {
  await ensureCurrentMonthFees();
  const now = new Date();
  const dateFilter: Prisma.DateTimeFilter = {};
  if (filters.from) dateFilter.gte = filters.from;
  if (filters.to) dateFilter.lte = filters.to;

  const incomeWhere: Prisma.IncomeTransactionWhereInput = {
    voidedAt: null,
    ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
    ...(filters.classId ? { classId: filters.classId } : {}),
    ...(filters.category ? { category: filters.category as never } : {}),
    ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod as never } : {}),
    ...(filters.programId || filters.academicYearId
      ? {
          class: {
            ...(filters.programId ? { programId: filters.programId } : {}),
            ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
          },
        }
      : {}),
  };

  const expenseWhere: Prisma.ExpenseTransactionWhereInput = {
    voidedAt: null,
    ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
    ...(filters.paymentMethod ? { paymentMethod: filters.paymentMethod as never } : {}),
  };

  const { month, year } = currentMonthYear(now);
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const [
    filteredIncome,
    filteredExpenses,
    feeCollection,
    outstanding,
    todayIncome,
    monthIncome,
    monthExpenses,
    recentIncome,
    monthlySeries,
  ] = await Promise.all([
    prisma.incomeTransaction.aggregate({ where: incomeWhere, _sum: { amount: true } }),
    prisma.expenseTransaction.aggregate({ where: expenseWhere, _sum: { amount: true } }),
    prisma.incomeTransaction.aggregate({
      where: { ...incomeWhere, category: "STUDENT_FEE" },
      _sum: { amount: true },
    }),
    prisma.feeRecord.aggregate({
      where: {
        month,
        year,
        status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
        ...(filters.classId ? { classId: filters.classId } : {}),
        ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
        ...(filters.programId ? { class: { programId: filters.programId } } : {}),
      },
      _sum: { remainingAmount: true },
    }),
    prisma.incomeTransaction.aggregate({
      where: { voidedAt: null, date: { gte: todayStart } },
      _sum: { amount: true },
    }),
    prisma.incomeTransaction.aggregate({
      where: { voidedAt: null, date: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
    }),
    prisma.expenseTransaction.aggregate({
      where: { voidedAt: null, date: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
    }),
    prisma.incomeTransaction.findMany({
      where: incomeWhere,
      orderBy: { date: "desc" },
      take: 10,
      include: { student: true, class: { include: { program: true } } },
    }),
    getMonthlyFinanceSeries(now, 8),
  ]);

  const totalIncome = filteredIncome._sum.amount ?? 0;
  const totalExpenses = filteredExpenses._sum.amount ?? 0;

  return {
    totalIncome,
    totalExpenses,
    netBalance: totalIncome - totalExpenses,
    feeCollection: feeCollection._sum.amount ?? 0,
    outstanding: outstanding._sum.remainingAmount ?? 0,
    todayIncome: todayIncome._sum.amount ?? 0,
    monthIncome: monthIncome._sum.amount ?? 0,
    monthExpenses: monthExpenses._sum.amount ?? 0,
    recentIncome,
    monthlySeries,
  };
}

export async function getStudentById(id: string) {
  await ensureCurrentMonthFees();
  const { month, year } = currentMonthYear();
  return prisma.student.findFirst({
    where: { id, deletedAt: null },
    include: {
      class: { include: { program: true, academicYear: true, classTeacher: true } },
      feeRecords: {
        orderBy: [{ year: "desc" }, { month: "desc" }],
        include: {
          payments: {
            where: { voidedAt: null },
            orderBy: { paymentDate: "desc" },
          },
        },
      },
      payments: {
        where: { voidedAt: null },
        orderBy: { paymentDate: "desc" },
        include: { incomeTransaction: true, feeRecord: true },
      },
    },
  }).then((student) => {
    if (!student) return null;
    const current = student.feeRecords.find((record) => record.month === month && record.year === year);
    const totalPaid = student.payments.reduce((sum, payment) => sum + payment.amount, 0);
    const totalOutstanding = student.feeRecords.reduce((sum, record) => sum + record.remainingAmount, 0);
    return { student, currentFee: current, totalPaid, totalOutstanding, month, year };
  });
}
