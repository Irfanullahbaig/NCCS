import { db } from "@/lib/db";
import {
  ACCOUNTS,
  balanceOf,
  collectionsIn,
  getJournal,
  getLedgerSummary,
  getMonthlyMovements,
  netMovement,
  readAll,
  type AccountCode,
  type JournalListItem,
  type LedgerSummary,
  type MonthlyMovement,
} from "@/lib/accounting";
import type { ResolvedPeriod } from "@/lib/period";
import { calendarDateInKarachi, currentMonthYear, fullName, MONTH_NAMES, monthLabel } from "@/lib/utils";

/**
 * Everything the dashboard's finance sections show. Money figures come from
 * the double-entry journal; voucher counts come from the fee vouchers that
 * produced those postings, so the two always describe the same records.
 */

const round = (value: number) => Math.round(value * 100) / 100;
const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

export type PeriodFigures = {
  feeIncome: number;
  otherIncome: number;
  totalIncome: number;
  collections: number;
  expenses: number;
};

function figures(rows: MonthlyMovement[]): PeriodFigures {
  const feeIncome = netMovement(rows, "FEE_INCOME");
  const otherIncome = netMovement(rows, "OTHER_INCOME");
  return {
    feeIncome,
    otherIncome,
    totalIncome: round(feeIncome + otherIncome),
    collections: collectionsIn(rows),
    expenses: netMovement(rows, "EXPENSES"),
  };
}

export type RecentTransaction = {
  key: string;
  kind: "VOUCHERS" | "PAYMENT" | "ADJUSTMENT";
  title: string;
  detail: string;
  date: string;
  amount: number;
  /** Positive when Accounts Receivable goes up, negative when it goes down. */
  direction: 1 | -1;
  href: string;
  recordedBy: string | null;
  createdAt: string;
};

/** Latest voucher runs and payments. Vouchers issued together are shown as one line. */
function recentTransactions(rows: JournalListItem[], limit = 8): RecentTransaction[] {
  const out: RecentTransaction[] = [];
  for (const row of rows) {
    if (row.kind !== "FEE_CHARGE" && row.kind !== "FEE_PAYMENT") continue;
    const intoReceivable = row.debitAccount === "ACCOUNTS_RECEIVABLE";
    if (row.kind === "FEE_CHARGE" && row.revision === 1) {
      const batch = `${row.memo}|${row.createdById ?? ""}|${row.createdAt.slice(0, 16)}`;
      const last = out.at(-1);
      if (last && last.kind === "VOUCHERS" && last.key.startsWith(`${batch}#`)) {
        const count = Number(last.key.split("#")[1]) + 1;
        last.key = `${batch}#${count}`;
        last.amount = round(last.amount + row.amount);
        last.title = `${count} fee vouchers issued`;
        last.detail = `${row.memo.replace("Fee charged for", "For")} · DR Accounts Receivable / CR Student Fee Income`;
        last.href = `/finance/ledger?kind=FEE_CHARGE&from=${row.date}&to=${row.date}`;
        continue;
      }
      if (out.length >= limit) break;
      out.push({
        key: `${batch}#1`,
        kind: "VOUCHERS",
        title: `Fee voucher · ${row.studentName ?? "student"}`,
        detail: `${row.memo.replace("Fee charged for", "For")} · DR Accounts Receivable / CR Student Fee Income`,
        date: row.date,
        amount: row.amount,
        direction: 1,
        href: row.studentId ? `/finance/ledger?student=${row.studentId}` : "/finance/ledger",
        recordedBy: row.recordedBy,
        createdAt: row.createdAt,
      });
      continue;
    }
    if (out.length >= limit) break;
    const payment = row.kind === "FEE_PAYMENT";
    const received = payment && (row.debitAccount === "BANK" || row.debitAccount === "CASH");
    const name = (code: string) => ACCOUNTS[code as AccountCode]?.label ?? code;
    out.push({
      key: row.id,
      kind: received ? "PAYMENT" : "ADJUSTMENT",
      title: payment
        ? `${received ? "Payment" : "Payment reversed"} · ${row.studentName ?? "student"}`
        : `Fee ${intoReceivable ? "increased" : "reduced"} · ${row.studentName ?? "student"}`,
      detail: `${row.memo} · DR ${name(row.debitAccount)} / CR ${name(row.creditAccount)}`,
      date: row.date,
      amount: row.amount,
      direction: intoReceivable ? 1 : -1,
      href: row.studentId ? `/finance/ledger?student=${row.studentId}` : "/finance/ledger",
      recordedBy: row.recordedBy,
      createdAt: row.createdAt,
    });
  }
  return out.slice(0, limit);
}

type VoucherRow = { studentId: string; classId: string; month: number; year: number; status: string; dueDate: string | null; expectedAmount: number; waivedAmount: number; fineAmount: number; paidAmount: number; remainingAmount: number };

export async function getFinanceDashboard(period: ResolvedPeriod) {
  const summary: LedgerSummary = await getLedgerSummary();
  if (!summary.ready) return { ready: false as const };

  const [movements, journal, vouchers, studentsRes, classesRes] = await Promise.all([
    getMonthlyMovements(),
    getJournal({ limit: 160 }),
    readAll<VoucherRow>(() =>
      db()
        .from("FeeRecord")
        .select("studentId, classId, month, year, status, dueDate, expectedAmount, waivedAmount, fineAmount, paidAmount, remainingAmount")
        .order("id"),
    ),
    db()
      .from("Student")
      .select("id, firstName, lastName, fatherName, registrationNo, classId, status, deletedAt, class:Class(name, program:Program(name))")
      .order("firstName"),
    db().from("Class").select("id, name, status, program:Program(name)").order("name"),
  ]);
  if (studentsRes.error) throw studentsRes.error;
  if (classesRes.error) throw classesRes.error;
  const rows = movements ?? [];

  // ---- Period figures, and the same for the period before, for the change badges.
  const year = period.year;
  const month = period.month;
  const inPeriod = (key: string) => (month ? key === monthKey(year, month) : key.startsWith(`${year}-`));
  const prevKey = month ? (month === 1 ? monthKey(year - 1, 12) : monthKey(year, month - 1)) : null;
  const inPrevious = (key: string) => (prevKey ? key === prevKey : key.startsWith(`${year - 1}-`));
  const current = figures(rows.filter((row) => inPeriod(row.month)));
  const previous = figures(rows.filter((row) => inPrevious(row.month)));

  // ---- Month by month for the selected year, with Accounts Receivable at each month end.
  const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month));
  let receivable = netMovement(sorted.filter((row) => row.month < `${year}-01`), "ACCOUNTS_RECEIVABLE");
  const months = MONTH_NAMES.map((name, index) => {
    const key = monthKey(year, index + 1);
    const monthRows = sorted.filter((row) => row.month === key);
    receivable = round(receivable + netMovement(monthRows, "ACCOUNTS_RECEIVABLE"));
    const values = figures(monthRows);
    // Vouchers for this fee month, by status, and how much of them has been collected.
    const monthVouchers = vouchers.filter((row) => row.year === year && row.month === index + 1 && row.status !== "WAIVED");
    const billed = monthVouchers.reduce((sum, row) => sum + Math.max(0, row.expectedAmount - row.waivedAmount) + row.fineAmount, 0);
    const paidOnVouchers = monthVouchers.reduce((sum, row) => sum + row.paidAmount, 0);
    return {
      label: name.slice(0, 3),
      accrued: values.feeIncome,
      income: values.totalIncome,
      collections: values.collections,
      expenses: values.expenses,
      receivable,
      vouchersPaid: monthVouchers.filter((row) => row.status === "PAID").length,
      vouchersPartial: monthVouchers.filter((row) => row.status === "PARTIALLY_PAID").length,
      vouchersUnpaid: monthVouchers.filter((row) => row.status === "PENDING" || row.status === "OVERDUE").length,
      collectionRate: billed > 0 ? Math.round((paidOnVouchers / billed) * 1000) / 10 : null,
    };
  });
  const { month: nowMonth, year: nowYear } = currentMonthYear();
  const nowIndex = nowYear * 12 + nowMonth;
  // Future months have no closing balance yet.
  for (let index = 0; index < 12; index += 1) {
    if (year * 12 + index + 1 > nowIndex) months[index].receivable = 0;
  }

  // ---- Fee vouchers for the period.
  const periodVouchers = vouchers.filter((row) => row.year === year && (!month || row.month === month));
  const count = (statuses: string[]) => periodVouchers.filter((row) => statuses.includes(row.status)).length;
  const voucherStats = {
    generated: periodVouchers.length,
    paid: count(["PAID"]),
    partial: count(["PARTIALLY_PAID"]),
    unpaid: count(["PENDING", "OVERDUE"]),
    overdue: count(["OVERDUE"]),
    waived: count(["WAIVED"]),
    issued: round(periodVouchers.reduce((sum, row) => sum + Math.max(0, row.expectedAmount - row.waivedAmount) + row.fineAmount, 0)),
    collected: round(periodVouchers.reduce((sum, row) => sum + row.paidAmount, 0)),
    outstanding: round(periodVouchers.reduce((sum, row) => sum + row.remainingAmount, 0)),
  };
  const issuedThisMonth = vouchers.filter((row) => row.year === nowYear && row.month === nowMonth).length;
  // Outstanding on vouchers past their due date, across all months.
  const today = calendarDateInKarachi();
  const overdueVouchers = vouchers.filter((row) => row.remainingAmount > 0 && (row.status === "OVERDUE" || (row.dueDate ?? "").slice(0, 10) < today));
  const overdue = { amount: round(overdueVouchers.reduce((sum, row) => sum + row.remainingAmount, 0)), count: overdueVouchers.length };
  const subledger = round(vouchers.reduce((sum, row) => sum + Math.max(0, row.remainingAmount), 0));

  // ---- Outstanding fees: by class from the journal, by age from the open vouchers.
  const students = studentsRes.data ?? [];
  const studentById = new Map(students.map((student) => [student.id, student]));
  const classLabel = (value: { name: string; program?: { name: string } | null } | null | undefined) =>
    value ? `${value.name} ${value.program?.name ?? ""}`.trim() : "No class";
  const byClass = new Map<string, { label: string; amount: number; students: number }>();
  let studentsOwing = 0;
  for (const [studentId, balance] of summary.receivableByStudent) {
    if (balance <= 0.004) continue;
    studentsOwing += 1;
    const student = studentById.get(studentId);
    const key = student?.classId ?? "none";
    const group = byClass.get(key) ?? { label: classLabel(student?.class), amount: 0, students: 0 };
    group.amount = round(group.amount + balance);
    group.students += 1;
    byClass.set(key, group);
  }
  const open = vouchers.filter((row) => row.remainingAmount > 0);
  const age = (row: VoucherRow) => nowIndex - (row.year * 12 + row.month);
  const bucket = (test: (months: number) => boolean) => {
    const list = open.filter((row) => test(age(row)));
    return { amount: round(list.reduce((sum, row) => sum + row.remainingAmount, 0)), count: list.length };
  };
  const byAge = [
    { label: "This month", ...bucket((months) => months <= 0) },
    { label: "1–2 months old", ...bucket((months) => months >= 1 && months <= 2) },
    { label: "3 months or older", ...bucket((months) => months >= 3) },
  ];

  // ---- Options for the Record payment and Initiate vouchers forms.
  const paymentStudents = students
    .filter((student) => student.status === "ACTIVE" && !student.deletedAt)
    .map((student) => ({
      id: student.id,
      name: fullName(student.firstName, student.lastName),
      classId: student.classId,
      fatherName: student.fatherName ?? undefined,
      registrationNo: student.registrationNo ?? undefined,
      classLabel: student.class ? classLabel(student.class) : undefined,
      remaining: summary.receivableByStudent.get(student.id) ?? 0,
    }))
    .sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name));
  const activeByClass = new Map<string, number>();
  for (const student of paymentStudents) activeByClass.set(student.classId, (activeByClass.get(student.classId) ?? 0) + 1);
  const classes = (classesRes.data ?? [])
    .filter((row) => row.status === "ACTIVE")
    .map((row) => ({ id: row.id, label: classLabel(row), students: activeByClass.get(row.id) ?? 0 }));

  const bankRow = summary.accounts.find((row) => row.code === "BANK");
  return {
    ready: true as const,
    year,
    periodLabel: month ? monthLabel(month, year) : String(year),
    periodMonth: month ?? null,
    /** First and last day of the period, for ledger links. */
    range: month
      ? { from: `${monthKey(year, month)}-01`, to: `${monthKey(year, month)}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}` }
      : { from: `${year}-01-01`, to: `${year}-12-31` },
    previousLabel: month ? "last month" : "last year",
    current,
    previous,
    overdue,
    /** What the fee vouchers still owe; matches Accounts Receivable when the books agree. */
    outstandingOnVouchers: subledger,
    balances: {
      receivable: balanceOf(summary, "ACCOUNTS_RECEIVABLE"),
      bank: balanceOf(summary, "BANK"),
      cash: balanceOf(summary, "CASH"),
      cashIn: summary.accounts.find((row) => row.code === "CASH")?.debit ?? 0,
      cashOut: summary.accounts.find((row) => row.code === "CASH")?.credit ?? 0,
      bankIn: bankRow?.debit ?? 0,
      bankOut: bankRow?.credit ?? 0,
      balanced: Math.abs(summary.totalDebit - summary.totalCredit) < 0.01,
      totalDebit: summary.totalDebit,
      entries: summary.entries,
    },
    months,
    vouchers: voucherStats,
    issuedThisMonth,
    currentMonthLabel: monthLabel(nowMonth, nowYear),
    outstanding: {
      byClass: [...byClass.values()].sort((a, b) => b.amount - a.amount),
      byAge,
      studentsOwing,
    },
    recent: journal.ready ? recentTransactions(journal.rows) : [],
    students: paymentStudents,
    classes,
  };
}

/** Active classes with their active student counts, for the Initiate fee vouchers form. */
export async function getVoucherClassOptions() {
  const [classesRes, studentsRes] = await Promise.all([
    db().from("Class").select("id, name, status, program:Program(name)").eq("status", "ACTIVE").order("name"),
    db().from("Student").select("classId").is("deletedAt", null).eq("status", "ACTIVE"),
  ]);
  if (classesRes.error) throw classesRes.error;
  if (studentsRes.error) throw studentsRes.error;
  const counts = new Map<string, number>();
  for (const row of studentsRes.data ?? []) counts.set(row.classId, (counts.get(row.classId) ?? 0) + 1);
  return (classesRes.data ?? []).map((row) => ({
    id: row.id,
    label: `${row.name} ${row.program?.name ?? ""}`.trim(),
    students: counts.get(row.id) ?? 0,
  }));
}

export type FinanceDashboard = Extract<Awaited<ReturnType<typeof getFinanceDashboard>>, { ready: true }>;
