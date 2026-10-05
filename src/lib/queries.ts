import { db } from "@/lib/db";
import { currentMonthYear } from "@/lib/utils";
import { ensureCurrentMonthFees, ensureStudentFeeRecord } from "@/lib/finance";

const studentClass = "class:Class(name, program:Program(name))";

export async function getDashboardData() {
  await ensureCurrentMonthFees();
  const { month, year } = currentMonthYear();

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
    db().from("FeeRecord").select("remainingAmount").eq("month", month).eq("year", year),
    db()
      .from("FeePayment")
      .select(`id, amount, paymentDate, paymentMethod, student:Student(firstName, lastName, class:Class(name, program:Program(name)))`)
      .is("voidedAt", null)
      .order("createdAt", { ascending: false })
      .limit(8),
    db()
      .from("Student")
      .select(`id, firstName, lastName, studentType, createdAt, ${studentClass}`)
      .is("deletedAt", null)
      .order("createdAt", { ascending: false })
      .limit(6),
    db().from("Staff").select("id, firstName, lastName, qualification, employmentStatus, createdAt").order("createdAt", { ascending: false }).limit(6),
    db()
      .from("FeeRecord")
      .select(`id, remainingAmount, status, student:Student(id, firstName, lastName, studentType, ${studentClass})`)
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

  return {
    totalStudents: activeStudents.length,
    totalStaff: staffRes.count ?? 0,
    totalClasses: classesRes.count ?? 0,
    pendingFees: (currentFeesRes.data ?? []).reduce((sum, row) => sum + row.remainingAmount, 0),
    scholarshipStudents: typeMap.SCHOLARSHIP ?? 0,
    needBasedStudents: typeMap.NEED_BASED ?? 0,
    selfFinancedStudents: typeMap.SELF ?? 0,
    recentPayments: recentPaymentsRes.data ?? [],
    recentStudents: recentStudentsRes.data ?? [],
    recentStaff: recentStaffRes.data ?? [],
    pendingFeeRecords: pendingFeesRes.data ?? [],
    month,
    year,
  };
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

export async function getStudentById(id: string) {
  const { month, year } = currentMonthYear();
  await ensureStudentFeeRecord({ studentId: id, month, year });
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
