import { db } from "@/lib/db";
import { ensureCurrentMonthFees } from "@/lib/finance";
import { isBeforeAdmission, monthKey } from "@/lib/late-fee";
import type { ResolvedPeriod } from "@/lib/period";
import { calendarDateInKarachi, fullName, monthLabel } from "@/lib/utils";

/**
 * Receivables = what enrolled students are expected to pay (their fixed monthly
 * fee for every month since admission) minus what they have already paid.
 * Payments are already posted to Income, so the two always add back up to the
 * expected total. Months that have no fee record yet still count, using the
 * student's fixed fee, so nobody drops out of the total.
 */

export type ReceivableMonth = { key: string; label: string; expected: number; received: number; receivable: number };

export type ReceivableStudent = {
  id: string;
  name: string;
  registrationNo: string | null;
  classId: string;
  className: string;
  status: string;
  monthlyFee: number;
  expected: number;
  received: number;
  receivable: number;
  monthsDue: number;
  /** Fee months that still have a balance, oldest first. */
  dueLabels: string[];
  dueMonths: Array<{ month: number; year: number }>;
};

function periodMonths(period: ResolvedPeriod) {
  const now = calendarDateInKarachi().slice(0, 7);
  let start: { year: number; month: number };
  let end: { year: number; month: number };
  if (period.mode === "month" && period.month) {
    start = end = { year: period.year, month: period.month };
  } else if (period.mode === "year") {
    start = { year: period.year, month: 1 };
    end = { year: period.year, month: 12 };
  } else {
    start = { year: period.from.getFullYear(), month: period.from.getMonth() + 1 };
    end = { year: period.to.getFullYear(), month: period.to.getMonth() + 1 };
  }
  const months: Array<{ year: number; month: number; key: string }> = [];
  for (let year = start.year, month = start.month; monthKey(year, month) <= monthKey(end.year, end.month); ) {
    // Fees for months that have not started yet are not owed.
    if (monthKey(year, month) > now) break;
    months.push({ year, month, key: monthKey(year, month) });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export async function getReceivables(period: ResolvedPeriod) {
  await ensureCurrentMonthFees();
  const months = periodMonths(period);
  const years = [...new Set(months.map((row) => row.year))];

  const [studentsRes, feesRes] = await Promise.all([
    db()
      .from("Student")
      .select("id, firstName, lastName, registrationNo, classId, feeAmount, studentType, status, dateOfAdmission, class:Class(name, program:Program(name))")
      .is("deletedAt", null),
    years.length
      ? db()
          .from("FeeRecord")
          .select("studentId, month, year, expectedAmount, waivedAmount, fineAmount, paidAmount, remainingAmount")
          .in("year", years)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (studentsRes.error) throw studentsRes.error;
  if (feesRes.error) throw feesRes.error;

  const wanted = new Set(months.map((row) => row.key));
  const records = new Map<string, NonNullable<typeof feesRes.data>[number]>();
  for (const record of feesRes.data ?? []) {
    const key = monthKey(record.year, record.month);
    if (wanted.has(key)) records.set(`${record.studentId}:${key}`, record);
  }

  const byMonth = new Map<string, ReceivableMonth>(
    months.map((row) => [row.key, { key: row.key, label: monthLabel(row.month, row.year), expected: 0, received: 0, receivable: 0 }]),
  );
  const students: ReceivableStudent[] = [];

  for (const student of studentsRes.data ?? []) {
    const enrolled = student.status === "ACTIVE";
    const fixed = student.studentType === "SCHOLARSHIP" ? 0 : student.feeAmount;
    const row: ReceivableStudent = {
      id: student.id,
      name: fullName(student.firstName, student.lastName),
      registrationNo: student.registrationNo,
      classId: student.classId,
      className: student.class ? `${student.class.name} — ${student.class.program?.name ?? ""}` : "",
      status: student.status,
      monthlyFee: fixed,
      expected: 0,
      received: 0,
      receivable: 0,
      monthsDue: 0,
      dueLabels: [],
      dueMonths: [],
    };

    for (const { year, month, key } of months) {
      const record = records.get(`${student.id}:${key}`);
      let expected: number;
      let received: number;
      if (record) {
        // Students who have left still owe what was billed while they were enrolled.
        expected = Math.max(0, record.expectedAmount - record.waivedAmount) + (record.fineAmount ?? 0);
        received = record.paidAmount;
      } else {
        if (!enrolled || isBeforeAdmission(year, month, student.dateOfAdmission)) continue;
        expected = fixed;
        received = 0;
      }
      const receivable = Math.max(0, expected - received);
      row.expected += expected;
      row.received += received;
      row.receivable += receivable;
      if (receivable > 0) {
        row.monthsDue += 1;
        row.dueLabels.push(monthLabel(month, year));
        row.dueMonths.push({ month, year });
      }
      const bucket = byMonth.get(key)!;
      bucket.expected += expected;
      bucket.received += received;
      bucket.receivable += receivable;
    }

    if (row.expected > 0 || row.received > 0) students.push(row);
  }

  students.sort((a, b) => b.receivable - a.receivable || a.name.localeCompare(b.name));
  const expected = students.reduce((total, row) => total + row.expected, 0);
  const received = students.reduce((total, row) => total + row.received, 0);
  const receivable = students.reduce((total, row) => total + row.receivable, 0);

  return {
    period,
    expected,
    received,
    receivable,
    rate: expected > 0 ? Math.round((received / expected) * 100) : 0,
    enrolledStudents: (studentsRes.data ?? []).filter((student) => student.status === "ACTIVE").length,
    studentsOwing: students.filter((row) => row.receivable > 0).length,
    months: [...byMonth.values()],
    students,
  };
}

export type Receivables = Awaited<ReturnType<typeof getReceivables>>;
