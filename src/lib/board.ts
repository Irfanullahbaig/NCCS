import { db } from "@/lib/db";
import { refreshFeeBalances } from "@/lib/finance";
import { getPeriodFinance, getYearlyMonthTable } from "@/lib/ledger";
import { balanceOf, getLedgerSummary } from "@/lib/accounting";
import type { ResolvedPeriod } from "@/lib/period";
import { STUDENT_TYPE_LABELS } from "@/lib/constants";
import { calendarDateFromValue, formatPKR, fullName, monthLabel, MONTH_NAMES } from "@/lib/utils";

/** Everything on the Board of Directors dashboard, computed from live records. */

export type InsightTone = "critical" | "warning" | "info" | "good";
export type Insight = { tone: InsightTone; title: string; detail: string; href?: string; cta?: string };

function sum<T>(rows: T[], pick: (row: T) => number) {
  return rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0);
}

function pct(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function previousPeriod(period: ResolvedPeriod): ResolvedPeriod {
  if (period.mode === "year") {
    const year = period.year - 1;
    return { ...period, year, from: new Date(year, 0, 1), to: new Date(year, 11, 31, 23, 59, 59), label: String(year) };
  }
  const month = period.month ?? period.from.getMonth() + 1;
  const prevMonth = month === 1 ? 12 : month - 1;
  const year = month === 1 ? period.year - 1 : period.year;
  return {
    ...period,
    mode: "month",
    month: prevMonth,
    year,
    from: new Date(year, prevMonth - 1, 1),
    to: new Date(year, prevMonth, 0, 23, 59, 59),
    label: monthLabel(prevMonth, year),
  };
}

export async function getBoardOverview(period: ResolvedPeriod, options: { finance: boolean; payroll: boolean }) {
  await refreshFeeBalances();
  const feeMonthFilter = period.mode === "month" && period.month ? period.month : null;

  let feeQuery = db()
    .from("FeeRecord")
    .select("studentId, classId, month, year, expectedAmount, paidAmount, waivedAmount, fineAmount, remainingAmount, status")
    .eq("year", period.year);
  if (feeMonthFilter) feeQuery = feeQuery.eq("month", feeMonthFilter);

  let salaryQuery = db().from("SalaryRecord").select("staffId, month, year, expectedAmount, paidAmount, remainingAmount, status").eq("year", period.year);
  if (feeMonthFilter) salaryQuery = salaryQuery.eq("month", feeMonthFilter);

  const [studentsRes, staffRes, classesRes, assignmentsRes, programsRes, yearFeesRes, periodFeesRes, openFeesRes, salaryRes, yearRes] = await Promise.all([
    db().from("Student").select("id, firstName, lastName, status, studentType, gender, classId, dateOfAdmission").is("deletedAt", null),
    db().from("Staff").select("id, employmentStatus, facultyType"),
    db().from("Class").select("id, name, code, status, classTeacherId, program:Program(name), classTeacher:Staff(firstName, lastName), subjects:ClassSubject(subjectId)"),
    db().from("StaffAssignment").select("staffId"),
    db().from("Program").select("id"),
    db().from("FeeRecord").select("month, paidAmount, remainingAmount").eq("year", period.year),
    feeQuery,
    db().from("FeeRecord").select("studentId, month, year, remainingAmount, fineAmount, status").in("status", ["PENDING", "OVERDUE", "PARTIALLY_PAID"]),
    options.payroll ? salaryQuery : Promise.resolve({ data: [], error: null }),
    db().from("AcademicYear").select("name, isActive").eq("isActive", true).maybeSingle(),
  ]);
  for (const result of [studentsRes, staffRes, classesRes, assignmentsRes, programsRes, yearFeesRes, periodFeesRes, openFeesRes, salaryRes, yearRes]) {
    if (result.error) throw result.error;
  }

  const students = studentsRes.data ?? [];
  const active = students.filter((student) => student.status === "ACTIVE");
  const staff = staffRes.data ?? [];
  const classes = classesRes.data ?? [];
  const activeClasses = classes.filter((item) => item.status === "ACTIVE");
  const periodFees = periodFeesRes.data ?? [];
  const openFees = openFeesRes.data ?? [];
  const salaries = (salaryRes.data ?? []) as Array<{ staffId: string; expectedAmount: number; paidAmount: number; remainingAmount: number; status: string }>;

  // --- Students ---
  const fromKey = calendarDateFromValue(period.from);
  const toKey = calendarDateFromValue(period.to);
  const admittedInPeriod = students.filter((student) => {
    const day = calendarDateFromValue(student.dateOfAdmission);
    return day >= fromKey && day <= toKey;
  }).length;
  const endMonth = period.mode === "month" && period.month ? period.month : 12;
  const enrollment = Array.from({ length: 12 }, (_, index) => {
    const offset = 11 - index;
    const date = new Date(Date.UTC(period.year, endMonth - 1 - offset, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    return {
      key,
      label: `${MONTH_NAMES[date.getUTCMonth()].slice(0, 3)} ${String(date.getUTCFullYear()).slice(2)}`,
      admitted: students.filter((student) => calendarDateFromValue(student.dateOfAdmission).slice(0, 7) === key).length,
    };
  });
  const byType = (["SELF", "SCHOLARSHIP", "NEED_BASED"] as const).map((type) => ({
    type,
    label: STUDENT_TYPE_LABELS[type],
    count: active.filter((student) => student.studentType === type).length,
  }));
  const female = active.filter((student) => student.gender === "FEMALE").length;
  const male = active.filter((student) => student.gender === "MALE").length;

  // --- Classes ---
  const classRows = activeClasses
    .map((item) => {
      const roster = active.filter((student) => student.classId === item.id);
      const fees = periodFees.filter((fee) => fee.classId === item.id);
      const billed = sum(fees, (fee) => fee.expectedAmount + (fee.fineAmount ?? 0) - fee.waivedAmount);
      const collected = sum(fees, (fee) => fee.paidAmount);
      return {
        id: item.id,
        name: item.name,
        code: item.code,
        program: item.program?.name ?? "",
        teacher: item.classTeacher ? fullName(item.classTeacher.firstName, item.classTeacher.lastName) : null,
        students: roster.length,
        subjects: (item.subjects ?? []).length,
        billed,
        collected,
        outstanding: sum(fees, (fee) => fee.remainingAmount),
        rate: pct(collected, billed),
        overdue: fees.filter((fee) => fee.status === "OVERDUE").length,
      };
    })
    .sort((a, b) => b.students - a.students || a.name.localeCompare(b.name));

  // --- Staff ---
  const assigned = new Set([
    ...(assignmentsRes.data ?? []).map((row) => row.staffId),
    ...classes.map((item) => item.classTeacherId).filter(Boolean),
  ]);
  const activeStaff = staff.filter((member) => member.employmentStatus === "ACTIVE");
  const staffStats = {
    total: staff.length,
    active: activeStaff.length,
    onLeave: staff.filter((member) => member.employmentStatus === "ON_LEAVE").length,
    left: staff.filter((member) => member.employmentStatus === "RESIGNED" || member.employmentStatus === "TERMINATED").length,
    permanent: activeStaff.filter((member) => (member.facultyType ?? "PERMANENT") === "PERMANENT").length,
    visiting: activeStaff.filter((member) => member.facultyType === "VISITING").length,
    teaching: activeStaff.filter((member) => assigned.has(member.id)).length,
    studentsPerTeacher: 0,
  };
  staffStats.studentsPerTeacher = staffStats.teaching ? Math.round((active.length / staffStats.teaching) * 10) / 10 : 0;
  const payroll = {
    expected: sum(salaries, (row) => row.expectedAmount),
    paid: sum(salaries, (row) => row.paidAmount),
    pending: sum(salaries, (row) => row.remainingAmount),
    pendingStaff: salaries.filter((row) => row.remainingAmount > 0).length,
  };

  // --- Fees ---
  const billed = sum(periodFees, (fee) => fee.expectedAmount + (fee.fineAmount ?? 0) - fee.waivedAmount);
  const collected = sum(periodFees, (fee) => fee.paidAmount);
  const fees = {
    billed,
    collected,
    outstanding: sum(periodFees, (fee) => fee.remainingAmount),
    waived: sum(periodFees, (fee) => fee.waivedAmount),
    lateFees: sum(periodFees, (fee) => fee.fineAmount ?? 0),
    rate: pct(collected, billed),
    paid: periodFees.filter((fee) => fee.status === "PAID").length,
    partial: periodFees.filter((fee) => fee.status === "PARTIALLY_PAID").length,
    pending: periodFees.filter((fee) => fee.status === "PENDING").length,
    overdue: periodFees.filter((fee) => fee.status === "OVERDUE").length,
    waivedCount: periodFees.filter((fee) => fee.status === "WAIVED").length,
    allTimeOutstanding: sum(openFees, (fee) => fee.remainingAmount),
    unpaidLateFees: sum(openFees, (fee) => fee.fineAmount ?? 0),
    monthly: Array.from({ length: 12 }, (_, index) => {
      const rows = (yearFeesRes.data ?? []).filter((fee) => fee.month === index + 1);
      return {
        label: MONTH_NAMES[index].slice(0, 3),
        collected: sum(rows, (fee) => fee.paidAmount),
        outstanding: sum(rows, (fee) => fee.remainingAmount),
      };
    }),
  };

  // Students who owe the most across all months.
  const owed = new Map<string, { amount: number; months: number }>();
  for (const fee of openFees) {
    const entry = owed.get(fee.studentId) ?? { amount: 0, months: 0 };
    entry.amount += fee.remainingAmount;
    entry.months += 1;
    owed.set(fee.studentId, entry);
  }
  const defaulters = [...owed.entries()]
    .map(([id, entry]) => {
      const student = students.find((row) => row.id === id);
      const schoolClass = classes.find((row) => row.id === student?.classId);
      return {
        id,
        name: student ? fullName(student.firstName, student.lastName) : "Unknown student",
        className: schoolClass ? `${schoolClass.name} — ${schoolClass.program?.name ?? ""}` : "",
        ...entry,
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // --- Finance (Admin / Principal only) ---
  let finance: null | {
    income: number;
    expenses: number;
    net: number;
    payroll: number;
    prevIncome: number;
    prevExpenses: number;
    balance: number;
    monthly: Array<{ label: string; income: number; expenses: number; net: number }>;
  } = null;
  if (options.finance) {
    const [current, previous, yearly, ledgerSummary] = await Promise.all([
      getPeriodFinance(period),
      getPeriodFinance(previousPeriod(period)),
      getYearlyMonthTable(period.year),
      getLedgerSummary(),
    ]);
    finance = {
      income: current.totalIncome,
      expenses: current.totalExpenses,
      net: current.net,
      payroll: current.payroll + current.advances,
      prevIncome: previous.totalIncome,
      prevExpenses: previous.totalExpenses,
      // Money held: Bank Account plus Cash Account in the journal.
      balance: balanceOf(ledgerSummary, "BANK") + balanceOf(ledgerSummary, "CASH"),
      monthly: yearly.map((row) => ({ label: row.label.slice(0, 3), income: row.income, expenses: row.expenses, net: row.net })),
    };
  }

  // --- Insights ---
  const insights: Insight[] = [];
  const overdueStudents = new Set(openFees.filter((fee) => fee.status === "OVERDUE").map((fee) => fee.studentId));
  if (overdueStudents.size) {
    insights.push({
      tone: "critical",
      title: `${overdueStudents.size} student${overdueStudents.size === 1 ? "" : "s"} with overdue fees`,
      detail: `${formatPKR(fees.allTimeOutstanding)} is still owed across all months, including ${formatPKR(fees.unpaidLateFees)} in late fees.`,
      href: "/finance/receivables?status=open",
      cta: "Review dues",
    });
  }
  if (finance && finance.income > 0 && finance.expenses > finance.income) {
    insights.push({
      tone: "critical",
      title: `Spending is ahead of income in ${period.label}`,
      detail: `Expenses of ${formatPKR(finance.expenses)} exceed income of ${formatPKR(finance.income)} by ${formatPKR(finance.expenses - finance.income)}.`,
      href: "/finance/profit-loss",
      cta: "Open P&L",
    });
  } else if (finance && finance.income === 0 && finance.expenses > 0) {
    insights.push({
      tone: "critical",
      title: `No income recorded in ${period.label}`,
      detail: `${formatPKR(finance.expenses)} was spent and nothing was received yet.`,
      href: "/finance/income",
      cta: "Check income",
    });
  }
  if (billed > 0 && fees.rate < 60) {
    insights.push({
      tone: "warning",
      title: `Only ${fees.rate}% of ${period.label} fees collected`,
      detail: `${formatPKR(collected)} of ${formatPKR(billed)} received. ${fees.overdue} overdue, ${fees.partial} part-paid.`,
      href: feeMonthFilter ? `/finance/fees?month=${feeMonthFilter}&year=${period.year}` : "/finance/fees",
      cta: "Open fees",
    });
  }
  const weakClass = classRows.filter((row) => row.billed > 0 && row.rate < 50).sort((a, b) => a.rate - b.rate)[0];
  if (weakClass) {
    insights.push({
      tone: "warning",
      title: `${weakClass.name} — ${weakClass.program} has the lowest collection`,
      detail: `${weakClass.rate}% collected, ${formatPKR(weakClass.outstanding)} outstanding from ${weakClass.students} students.`,
      href: `/classes/${weakClass.id}`,
      cta: "Open class",
    });
  }
  if (options.payroll && payroll.pending > 0) {
    insights.push({
      tone: "warning",
      title: `Payroll pending for ${payroll.pendingStaff} staff member${payroll.pendingStaff === 1 ? "" : "s"}`,
      detail: `${formatPKR(payroll.pending)} of ${formatPKR(payroll.expected)} is still to be paid for ${period.label}.`,
      href: "/finance/salaries",
      cta: "Open payroll",
    });
  }
  const noTeacher = activeClasses.filter((item) => !item.classTeacherId);
  if (noTeacher.length) {
    insights.push({
      tone: "info",
      title: `${noTeacher.length} class${noTeacher.length === 1 ? " has" : "es have"} no class teacher`,
      detail: noTeacher.slice(0, 3).map((item) => `${item.name} — ${item.program?.name ?? ""}`).join(", ") + (noTeacher.length > 3 ? "…" : ""),
      href: "/classes",
      cta: "Assign",
    });
  }
  if (staffStats.onLeave) {
    insights.push({
      tone: "info",
      title: `${staffStats.onLeave} staff member${staffStats.onLeave === 1 ? " is" : "s are"} on leave`,
      detail: "Check that their classes are covered.",
      href: "/staff",
      cta: "View staff",
    });
  }
  const inactive = students.length - active.length;
  if (inactive) {
    insights.push({
      tone: "info",
      title: `${inactive} student record${inactive === 1 ? " is" : "s are"} not active`,
      detail: "Inactive, suspended or graduated students are left out of fees and totals.",
      href: "/students",
      cta: "View",
    });
  }
  if (!insights.some((item) => item.tone === "critical" || item.tone === "warning")) {
    insights.unshift({
      tone: "good",
      title: "Nothing urgent needs attention",
      detail: "Fees, spending and payroll are on track for this period.",
    });
  }

  return {
    period,
    academicYear: yearRes.data?.name ?? null,
    students: {
      total: active.length,
      allRecords: students.length,
      admittedInPeriod,
      enrollment,
      byType,
      female,
      male,
    },
    staff: staffStats,
    payroll,
    classes: {
      total: activeClasses.length,
      programs: (programsRes.data ?? []).length,
      withoutTeacher: noTeacher.length,
      rows: classRows,
    },
    fees,
    defaulters,
    finance,
    insights,
  };
}

export type BoardOverview = Awaited<ReturnType<typeof getBoardOverview>>;
