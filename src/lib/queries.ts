import { startOfDay, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { db } from "@/lib/db";
import { currentMonthYear, MONTH_NAMES } from "@/lib/utils";
import { ensureCurrentMonthFees } from "@/lib/finance";

const studentClass = "class:Class(*, program:Program(*), academicYear:AcademicYear(*))";

async function sumAmount(table: "IncomeTransaction" | "ExpenseTransaction", filters: (query: ReturnType<ReturnType<typeof db>["from"]>) => unknown) {
  let query = db().from(table).select("amount").is("voidedAt", null);
  query = filters(query) as typeof query;
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + row.amount, 0);
}

export async function getDashboardData() {
  await ensureCurrentMonthFees();
  const now = new Date();
  const { month, year } = currentMonthYear(now);
  const todayStart = startOfDay(now).toISOString();
  const monthStart = startOfMonth(now).toISOString();
  const monthEnd = endOfMonth(now).toISOString();

  const [
    studentsRes,
    staffRes,
    classesRes,
    currentFeesRes,
    recentPaymentsRes,
    recentStudentsRes,
    recentStaffRes,
    pendingFeesRes,
  ] = await Promise.all([
    db().from("Student").select("id, studentType").is("deletedAt", null).eq("status", "ACTIVE"),
    db().from("Staff").select("id", { count: "exact", head: true }),
    db().from("Class").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
    db().from("FeeRecord").select("expectedAmount, paidAmount, remainingAmount, status, waivedAmount").eq("month", month).eq("year", year),
    db()
      .from("FeePayment")
      .select(`*, student:Student(*, ${studentClass}), incomeTransaction:IncomeTransaction(*)`)
      .is("voidedAt", null)
      .order("createdAt", { ascending: false })
      .limit(8),
    db()
      .from("Student")
      .select(`*, ${studentClass}`)
      .is("deletedAt", null)
      .order("createdAt", { ascending: false })
      .limit(6),
    db().from("Staff").select("*").order("createdAt", { ascending: false }).limit(6),
    db()
      .from("FeeRecord")
      .select(`*, student:Student(*, ${studentClass})`)
      .eq("month", month)
      .eq("year", year)
      .in("status", ["PENDING", "PARTIALLY_PAID", "OVERDUE"])
      .order("remainingAmount", { ascending: false })
      .limit(8),
  ]);

  for (const result of [studentsRes, staffRes, classesRes, currentFeesRes, recentPaymentsRes, recentStudentsRes, recentStaffRes, pendingFeesRes]) {
    if (result.error) throw result.error;
  }

  const activeStudents = studentsRes.data ?? [];
  const typeMap = activeStudents.reduce<Record<string, number>>((map, row) => {
    map[row.studentType] = (map[row.studentType] ?? 0) + 1;
    return map;
  }, {});
  const currentFees = currentFeesRes.data ?? [];
  const feeCollected = currentFees.reduce((sum, row) => sum + row.paidAmount, 0);
  const pendingFeeAmount = currentFees.reduce((sum, row) => sum + row.remainingAmount, 0);
  const expectedFees = currentFees.reduce((sum, row) => sum + row.expectedAmount, 0);

  const [todayIncome, monthlyIncome, monthlyExpenses, totalIncome, totalExpenses, monthlySeries] = await Promise.all([
    sumAmount("IncomeTransaction", (q) => q.gte("date", todayStart)),
    sumAmount("IncomeTransaction", (q) => q.gte("date", monthStart).lte("date", monthEnd)),
    sumAmount("ExpenseTransaction", (q) => q.gte("date", monthStart).lte("date", monthEnd)),
    sumAmount("IncomeTransaction", (q) => q),
    sumAmount("ExpenseTransaction", (q) => q),
    getMonthlyFinanceSeries(now, 6),
  ]);

  return {
    totalStudents: activeStudents.length,
    totalStaff: staffRes.count ?? 0,
    totalClasses: classesRes.count ?? 0,
    totalFeeCollected: feeCollected,
    pendingFees: pendingFeeAmount,
    expectedFees,
    todayIncome,
    monthlyIncome,
    monthlyExpenses,
    totalIncome,
    totalExpenses,
    netBalance: totalIncome - totalExpenses,
    scholarshipStudents: typeMap.SCHOLARSHIP ?? 0,
    needBasedStudents: typeMap.NEED_BASED ?? 0,
    selfFinancedStudents: typeMap.SELF ?? 0,
    recentPayments: recentPaymentsRes.data ?? [],
    recentStudents: recentStudentsRes.data ?? [],
    recentStaff: recentStaffRes.data ?? [],
    pendingFeeRecords: pendingFeesRes.data ?? [],
    monthlySeries,
    month,
    year,
  };
}

export async function getMonthlyFinanceSeries(now = new Date(), months = 6) {
  const points = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const date = subMonths(now, i);
    const from = startOfMonth(date).toISOString();
    const to = endOfMonth(date).toISOString();
    const [income, expenses, fees] = await Promise.all([
      sumAmount("IncomeTransaction", (q) => q.gte("date", from).lte("date", to)),
      sumAmount("ExpenseTransaction", (q) => q.gte("date", from).lte("date", to)),
      sumAmount("IncomeTransaction", (q) => q.eq("category", "STUDENT_FEE").gte("date", from).lte("date", to)),
    ]);
    points.push({
      label: MONTH_NAMES[date.getMonth()].slice(0, 3),
      income,
      expenses,
      fees,
    });
  }
  return points;
}

export async function getClassDashboard(classId: string) {
  await ensureCurrentMonthFees();
  const { month, year } = currentMonthYear();
  const schoolClass = await db()
    .from("Class")
    .select(
      "*, program:Program(*), academicYear:AcademicYear(*), classTeacher:Staff(*), subjects:ClassSubject(subject:Subject(*)), students:Student(*, feeRecords:FeeRecord(*))",
    )
    .eq("id", classId)
    .maybeSingle();
  if (schoolClass.error) throw schoolClass.error;
  if (!schoolClass.data) return null;

  const students = (schoolClass.data.students ?? []).filter((student) => !student.deletedAt);
  const rows = students.map((student) => {
    const fee = (student.feeRecords ?? []).find((record) => record.month === month && record.year === year);
    return {
      student,
      studentType: student.studentType,
      fee: fee?.expectedAmount ?? student.feeAmount,
      paid: fee?.paidAmount ?? 0,
      remaining: fee?.remainingAmount ?? (student.studentType === "SCHOLARSHIP" ? 0 : student.feeAmount),
      status: fee?.status ?? (student.studentType === "SCHOLARSHIP" ? "WAIVED" : "PENDING"),
    };
  });

  return {
    schoolClass: { ...schoolClass.data, students },
    rows,
    month,
    year,
    totals: {
      students: rows.length,
      paid: rows.filter((row) => row.status === "PAID").length,
      partial: rows.filter((row) => row.status === "PARTIALLY_PAID").length,
      pending: rows.filter((row) => row.status === "PENDING" || row.status === "OVERDUE").length,
      waived: rows.filter((row) => row.status === "WAIVED").length,
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
  const { month, year } = currentMonthYear(now);
  const todayStart = startOfDay(now).toISOString();
  const monthStart = startOfMonth(now).toISOString();
  const monthEnd = endOfMonth(now).toISOString();

  let incomeQuery = db()
    .from("IncomeTransaction")
    .select("*, student:Student(*), class:Class(*, program:Program(*))")
    .is("voidedAt", null)
    .order("date", { ascending: false });
  if (filters.from) incomeQuery = incomeQuery.gte("date", filters.from.toISOString());
  if (filters.to) incomeQuery = incomeQuery.lte("date", filters.to.toISOString());
  if (filters.classId) incomeQuery = incomeQuery.eq("classId", filters.classId);
  if (filters.category) incomeQuery = incomeQuery.eq("category", filters.category as never);
  if (filters.paymentMethod) incomeQuery = incomeQuery.eq("paymentMethod", filters.paymentMethod as never);

  const incomeRes = await incomeQuery;
  if (incomeRes.error) throw incomeRes.error;
  let incomeRows = incomeRes.data ?? [];
  if (filters.programId || filters.academicYearId) {
    incomeRows = incomeRows.filter((row) => {
      const schoolClass = row.class;
      if (!schoolClass) return false;
      if (filters.programId && schoolClass.programId !== filters.programId && schoolClass.program?.id !== filters.programId) {
        return false;
      }
      if (filters.academicYearId && schoolClass.academicYearId !== filters.academicYearId) return false;
      return true;
    });
  }

  let expenseQuery = db().from("ExpenseTransaction").select("amount").is("voidedAt", null);
  if (filters.from) expenseQuery = expenseQuery.gte("date", filters.from.toISOString());
  if (filters.to) expenseQuery = expenseQuery.lte("date", filters.to.toISOString());
  if (filters.paymentMethod) expenseQuery = expenseQuery.eq("paymentMethod", filters.paymentMethod as never);
  const expenseRes = await expenseQuery;
  if (expenseRes.error) throw expenseRes.error;

  const totalIncome = incomeRows.reduce((sum, row) => sum + row.amount, 0);
  const totalExpenses = (expenseRes.data ?? []).reduce((sum, row) => sum + row.amount, 0);
  const feeCollection = incomeRows.filter((row) => row.category === "STUDENT_FEE").reduce((sum, row) => sum + row.amount, 0);

  let outstandingQuery = db()
    .from("FeeRecord")
    .select("remainingAmount, class:Class(programId)")
    .eq("month", month)
    .eq("year", year)
    .in("status", ["PENDING", "PARTIALLY_PAID", "OVERDUE"]);
  if (filters.classId) outstandingQuery = outstandingQuery.eq("classId", filters.classId);
  if (filters.academicYearId) outstandingQuery = outstandingQuery.eq("academicYearId", filters.academicYearId);
  const outstandingRes = await outstandingQuery;
  if (outstandingRes.error) throw outstandingRes.error;
  const outstandingRows = (outstandingRes.data ?? []).filter((row) =>
    filters.programId ? row.class?.programId === filters.programId : true,
  );

  const [todayIncome, monthIncome, monthExpenses, monthlySeries] = await Promise.all([
    sumAmount("IncomeTransaction", (q) => q.gte("date", todayStart)),
    sumAmount("IncomeTransaction", (q) => q.gte("date", monthStart).lte("date", monthEnd)),
    sumAmount("ExpenseTransaction", (q) => q.gte("date", monthStart).lte("date", monthEnd)),
    getMonthlyFinanceSeries(now, 8),
  ]);

  return {
    totalIncome,
    totalExpenses,
    netBalance: totalIncome - totalExpenses,
    feeCollection,
    outstanding: outstandingRows.reduce((sum, row) => sum + row.remainingAmount, 0),
    todayIncome,
    monthIncome,
    monthExpenses,
    recentIncome: incomeRows.slice(0, 10),
    monthlySeries,
  };
}

export async function getStudentById(id: string) {
  await ensureCurrentMonthFees();
  const { month, year } = currentMonthYear();
  const result = await db()
    .from("Student")
    .select(
      `*, class:Class(*, program:Program(*), academicYear:AcademicYear(*), classTeacher:Staff(*)), feeRecords:FeeRecord(*, payments:FeePayment(*)), payments:FeePayment(*, incomeTransaction:IncomeTransaction(*), feeRecord:FeeRecord(*))`,
    )
    .eq("id", id)
    .is("deletedAt", null)
    .maybeSingle();
  if (result.error) throw result.error;
  const student = result.data;
  if (!student) return null;
  student.feeRecords = (student.feeRecords ?? [])
    .map((record) => ({
      ...record,
      payments: (record.payments ?? []).filter((payment) => !payment.voidedAt),
    }))
    .sort((a, b) => b.year - a.year || b.month - a.month);
  student.payments = (student.payments ?? [])
    .filter((payment) => !payment.voidedAt)
    .sort((a, b) => String(b.paymentDate).localeCompare(String(a.paymentDate)));
  const current = student.feeRecords.find((record) => record.month === month && record.year === year);
  const totalPaid = student.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const totalOutstanding = student.feeRecords.reduce((sum, record) => sum + record.remainingAmount, 0);
  return { student, currentFee: current, totalPaid, totalOutstanding, month, year };
}
