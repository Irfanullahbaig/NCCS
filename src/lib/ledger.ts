import { db } from "@/lib/db";
import {
  collectionsIn,
  getMonthlyMovements,
  netMovement,
  prepareLedger,
  readAll,
  type AccountCode,
  type JournalRow,
} from "@/lib/accounting";
import { isoRange, type ResolvedPeriod } from "@/lib/period";
import { monthLabel } from "@/lib/utils";
import { isAdvanceExpense, isAdvancePayment } from "@/lib/salary";

export type LedgerEntry = {
  id: string;
  transactionId: string;
  date: string;
  direction: "income" | "expense";
  type: string;
  source: string;
  person: string;
  personHref: string | null;
  program: string;
  programId: string;
  classId: string;
  monthLabel: string;
  amount: number;
  signedAmount: number;
  method: string;
  status: string;
  receiptId: string;
  notes: string | null;
  recordedById: string | null;
};

/**
 * Receipts and payments register: the income, fee payment and expense
 * documents in a period. It lists documents only; every total in the finance
 * reports comes from the journal (see getProfitAndLoss below).
 */
export async function getLedgerEntries(period: ResolvedPeriod, filters?: {
  q?: string;
  type?: string;
  method?: string;
  studentId?: string;
  staffId?: string;
  programId?: string;
  classId?: string;
}) {
  const { from, to } = isoRange(period);
  const [incomeRes, expenseRes, paymentsRes, salaryPaysRes] = await Promise.all([
    db()
      .from("IncomeTransaction")
      .select("*, student:Student(*, class:Class(*, program:Program(*))), class:Class(*, program:Program(*))")
      .is("voidedAt", null)
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false }),
    db()
      .from("ExpenseTransaction")
      .select("*")
      .is("voidedAt", null)
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false }),
    db()
      .from("FeePayment")
      .select("*, feeRecord:FeeRecord(*), student:Student(*, class:Class(*, program:Program(*)))")
      .is("voidedAt", null)
      .gte("paymentDate", from)
      .lte("paymentDate", to),
    db()
      .from("SalaryPayment")
      .select("*, staff:Staff(*), salaryRecord:SalaryRecord(*)")
      .is("voidedAt", null)
      .gte("paymentDate", from)
      .lte("paymentDate", to),
  ]);
  for (const result of [incomeRes, expenseRes, paymentsRes, salaryPaysRes]) {
    if (result.error) throw result.error;
  }

  const paymentByIncome = new Map((paymentsRes.data ?? []).map((row) => [row.incomeTransactionId, row]));
  const salaryByExpense = new Map((salaryPaysRes.data ?? []).map((row) => [row.expenseTransactionId, row]));

  const incomeRows: LedgerEntry[] = (incomeRes.data ?? []).map((row) => {
    const payment = paymentByIncome.get(row.id);
    const student = row.student ?? payment?.student;
    const program = student?.class?.program?.name ?? row.class?.program?.name ?? "";
    const feeMonth = payment?.feeRecord ? monthLabel(payment.feeRecord.month, payment.feeRecord.year) : "";
    const person = student ? `${student.firstName} ${student.lastName}`.trim() : row.source ?? "—";
    return {
      id: row.id,
      transactionId: row.incomeId,
      date: row.date,
      direction: "income",
      type: row.category,
      source: "Student fee / income",
      person,
      personHref: student ? `/students/${student.id}` : null,
      program,
      programId: student?.class?.program?.id ?? row.class?.program?.id ?? "",
      classId: student?.classId ?? row.classId ?? "",
      monthLabel: feeMonth,
      amount: row.amount,
      signedAmount: row.amount,
      method: row.paymentMethod,
      status: "Paid",
      receiptId: row.referenceNumber || row.incomeId,
      notes: row.notes,
      recordedById: row.createdById,
    };
  });

  const expenseRows: LedgerEntry[] = (expenseRes.data ?? []).map((row) => {
    const salary = salaryByExpense.get(row.id);
    const advance = isAdvanceExpense(row.description) || isAdvancePayment(salary?.notes);
    const staff = salary?.staff;
    const person = staff ? `${staff.firstName} ${staff.lastName}`.trim() : row.paidTo;
    const period = salary?.salaryRecord ? monthLabel(salary.salaryRecord.month, salary.salaryRecord.year) : "";
    return {
      id: row.id,
      transactionId: row.expenseId,
      date: row.date,
      direction: "expense",
      type: advance ? "ADVANCE_SALARY" : row.category,
      source: salary ? (advance ? "Advance salary" : "Payroll") : "Expense",
      person,
      personHref: staff ? `/staff/${staff.id}` : null,
      program: staff ? staff.facultyType : "",
      programId: "",
      classId: "",
      monthLabel: period,
      amount: row.amount,
      signedAmount: -row.amount,
      method: row.paymentMethod,
      status: "Paid",
      receiptId: row.referenceNumber || row.expenseId,
      notes: row.notes ?? row.description,
      recordedById: row.createdById,
    };
  });

  let rows = [...incomeRows, ...expenseRows].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const q = filters?.q?.trim().toLowerCase();
  if (q) {
    rows = rows.filter((row) =>
      [row.transactionId, row.person, row.program, row.receiptId, row.type, row.source, row.monthLabel, row.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }
  if (filters?.type === "income") rows = rows.filter((row) => row.direction === "income");
  if (filters?.type === "expense") rows = rows.filter((row) => row.direction === "expense");
  if (filters?.type && filters.type !== "income" && filters.type !== "expense") {
    rows = rows.filter((row) => row.type === filters.type);
  }
  if (filters?.method) rows = rows.filter((row) => row.method === filters.method);
  if (filters?.studentId) {
    rows = rows.filter((row) => row.personHref === `/students/${filters.studentId}`);
  }
  if (filters?.staffId) {
    rows = rows.filter((row) => row.personHref === `/staff/${filters.staffId}`);
  }
  if (filters?.programId) rows = rows.filter((row) => row.programId === filters.programId);
  if (filters?.classId) rows = rows.filter((row) => row.classId === filters.classId);
  return rows;
}

// ---------------------------------------------------------------- Accrual reports from the journal
//
// Every total below is read from the double-entry journal: income is what fee
// vouchers (and other income) recorded in the period, collections are what
// reached the Bank and Cash accounts, and receivables are the Accounts
// Receivable balance. Nothing is added up from the source documents.

type ReportRow = JournalRow & { category: string | null; description: string | null };

const roundMoney = (value: number) => Math.round(value * 100) / 100;

/** Journal rows dated within [from, to], with the income or expense category of their source. Null when the journal is missing. */
async function journalRowsBetween(from: string, to: string): Promise<ReportRow[] | null> {
  await prepareLedger();
  let rows: JournalRow[];
  try {
    rows = await readAll<JournalRow>(() =>
      db().from("JournalEntry").select("*").gte("date", from).lte("date", to).order("id"),
    );
  } catch (error) {
    if (error instanceof Error && /journal has not been set up/.test(error.message)) return null;
    throw error;
  }
  const incomeIds = [...new Set(rows.filter((row) => row.sourceType === "IncomeTransaction").map((row) => row.sourceId))];
  const expenseIds = [...new Set(rows.filter((row) => row.sourceType === "ExpenseTransaction").map((row) => row.sourceId))];
  const categories = new Map<string, { category: string; description: string | null }>();
  for (let index = 0; index < incomeIds.length; index += 200) {
    const res = await db().from("IncomeTransaction").select("id, category").in("id", incomeIds.slice(index, index + 200));
    if (res.error) throw res.error;
    for (const row of res.data ?? []) categories.set(row.id, { category: row.category, description: null });
  }
  for (let index = 0; index < expenseIds.length; index += 200) {
    const res = await db().from("ExpenseTransaction").select("id, category, description").in("id", expenseIds.slice(index, index + 200));
    if (res.error) throw res.error;
    for (const row of res.data ?? []) categories.set(row.id, { category: row.category, description: row.description });
  }
  return rows.map((row) => ({
    ...row,
    amount: Number(row.amount),
    category: categories.get(row.sourceId)?.category ?? null,
    description: categories.get(row.sourceId)?.description ?? null,
  }));
}

/** Accounts Receivable at the end of `to` (all postings up to that date). */
async function receivableAt(to: string) {
  const movements = await getMonthlyMovements();
  if (!movements) return 0;
  const month = to.slice(0, 7);
  return netMovement(movements.filter((row) => row.month <= month), "ACCOUNTS_RECEIVABLE");
}

function incomeAndExpenses(rows: ReportRow[]) {
  const by = (test: (row: ReportRow) => boolean, account: AccountCode) => netMovement(rows.filter(test), account);
  const studentFees = netMovement(rows, "FEE_INCOME");
  const admissionFees = by((row) => row.category === "ADMISSION_FEE" || row.category === "REGISTRATION_FEE", "OTHER_INCOME");
  const otherIncome = roundMoney(netMovement(rows, "OTHER_INCOME") - admissionFees);
  const isAdvance = (row: ReportRow) => isAdvanceExpense(row.description);
  const payroll = by((row) => row.category === "SALARIES" && !isAdvance(row), "EXPENSES");
  const advances = by(isAdvance, "EXPENSES");
  const rent = by((row) => row.category === "RENT", "EXPENSES");
  const utilities = by((row) => row.category === "UTILITIES", "EXPENSES");
  const supplies = by((row) => row.category === "SUPPLIES", "EXPENSES");
  const maintenance = by((row) => row.category === "MAINTENANCE", "EXPENSES");
  const totalExpenses = netMovement(rows, "EXPENSES");
  const otherExpenses = roundMoney(totalExpenses - payroll - advances - rent - utilities - supplies - maintenance);
  const totalIncome = roundMoney(studentFees + admissionFees + otherIncome);
  return {
    studentFees,
    admissionFees,
    otherIncome,
    totalIncome,
    payroll,
    advances,
    rent,
    utilities,
    supplies,
    maintenance,
    otherExpenses,
    totalExpenses,
    net: roundMoney(totalIncome - totalExpenses),
    collected: collectionsIn(rows),
  };
}

/** Accrual profit and loss for a period, from the journal. */
export async function getProfitAndLoss(period: ResolvedPeriod) {
  const { from, to } = isoRange(period);
  const rows = await journalRowsBetween(from, to);
  const totals = incomeAndExpenses(rows ?? []);

  let feeQuery = db().from("FeeRecord").select("status, month, year");
  feeQuery = period.mode === "month" && period.month ? feeQuery.eq("month", period.month).eq("year", period.year) : feeQuery.gte("dueDate", from).lte("dueDate", to);
  const feeRes = await feeQuery;
  if (feeRes.error) throw feeRes.error;
  const vouchers = feeRes.data ?? [];

  return {
    ready: rows !== null,
    period,
    ...totals,
    /** Fee income accrued from vouchers in the period. */
    billed: totals.studentFees,
    /** Accounts Receivable at the end of the period. */
    outstanding: rows ? await receivableAt(to) : 0,
    vouchers: vouchers.length,
    studentsPaid: vouchers.filter((row) => row.status === "PAID").length,
    studentsPartial: vouchers.filter((row) => row.status === "PARTIALLY_PAID").length,
    studentsOutstanding: vouchers.filter((row) => ["PENDING", "OVERDUE", "PARTIALLY_PAID"].includes(row.status)).length,
  };
}

/** Headline figures for the board overview, from the journal. */
export async function getPeriodFinance(period: ResolvedPeriod) {
  const { from, to } = isoRange(period);
  const rows = await journalRowsBetween(from, to);
  const totals = incomeAndExpenses(rows ?? []);
  return {
    totalIncome: totals.totalIncome,
    totalExpenses: totals.totalExpenses,
    net: totals.net,
    payroll: totals.payroll,
    advances: totals.advances,
    outstanding: rows ? await receivableAt(to) : 0,
    collected: totals.collected,
  };
}

/** Month by month for a year, from the journal: accrued income, collections, expenses and receivables at month end. */
export async function getYearlyMonthTable(year: number) {
  const rows = (await journalRowsBetween(`${year}-01-01`, `${year}-12-31`)) ?? [];
  let receivable = await receivableAt(`${year - 1}-12-31`);
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const monthRows = rows.filter((row) => String(row.date).startsWith(key));
    const totals = incomeAndExpenses(monthRows);
    receivable = roundMoney(receivable + netMovement(monthRows, "ACCOUNTS_RECEIVABLE"));
    return {
      month,
      label: monthLabel(month, year).split(" ")[0],
      income: totals.totalIncome,
      expenses: totals.totalExpenses,
      payroll: roundMoney(totals.payroll + totals.advances),
      fees: totals.studentFees,
      collections: totals.collected,
      outstanding: receivable,
      net: totals.net,
    };
  });
}
