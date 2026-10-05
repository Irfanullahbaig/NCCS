import { db } from "@/lib/db";
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

export async function getProfitAndLoss(period: ResolvedPeriod) {
  const rows = await getLedgerEntries(period);
  const income = rows.filter((row) => row.direction === "income");
  const expenses = rows.filter((row) => row.direction === "expense");
  const sum = (list: LedgerEntry[], pred: (row: LedgerEntry) => boolean) =>
    list.filter(pred).reduce((total, row) => total + row.amount, 0);

  const studentFees = sum(income, (row) => row.type === "STUDENT_FEE");
  const admissionFees = sum(income, (row) => row.type === "ADMISSION_FEE" || row.type === "REGISTRATION_FEE");
  const otherIncome = sum(income, (row) => !["STUDENT_FEE", "ADMISSION_FEE", "REGISTRATION_FEE"].includes(row.type));
  const payroll = sum(expenses, (row) => row.type === "SALARIES");
  const advances = sum(expenses, (row) => row.type === "ADVANCE_SALARY");
  const rent = sum(expenses, (row) => row.type === "RENT");
  const utilities = sum(expenses, (row) => row.type === "UTILITIES");
  const supplies = sum(expenses, (row) => row.type === "SUPPLIES");
  const maintenance = sum(expenses, (row) => row.type === "MAINTENANCE");
  const otherExpenses = sum(expenses, (row) =>
    !["SALARIES", "ADVANCE_SALARY", "RENT", "UTILITIES", "SUPPLIES", "MAINTENANCE"].includes(row.type),
  );

  const totalIncome = income.reduce((total, row) => total + row.amount, 0);
  const totalExpenses = expenses.reduce((total, row) => total + row.amount, 0);

  const { from, to } = isoRange(period);
  let feeQuery = db().from("FeeRecord").select("remainingAmount, expectedAmount, paidAmount, fineAmount, status, month, year");
  if (period.mode === "month" && period.month) {
    feeQuery = feeQuery.eq("month", period.month).eq("year", period.year);
  } else {
    feeQuery = feeQuery.gte("dueDate", from).lte("dueDate", to);
  }
  const feeRes = await feeQuery;
  if (feeRes.error) throw feeRes.error;
  const feeStats = feeRes.data ?? [];

  return {
    period,
    rows,
    totalIncome,
    totalExpenses,
    net: totalIncome - totalExpenses,
    studentFees,
    admissionFees,
    otherIncome,
    payroll,
    advances,
    rent,
    utilities,
    supplies,
    maintenance,
    otherExpenses,
    outstanding: feeStats.reduce((total, row) => total + row.remainingAmount, 0),
    billed: feeStats.reduce((total, row) => total + row.expectedAmount + (row.fineAmount ?? 0), 0),
    collected: feeStats.reduce((total, row) => total + row.paidAmount, 0),
    studentsPaid: feeStats.filter((row) => row.status === "PAID").length,
    studentsPartial: feeStats.filter((row) => row.status === "PARTIALLY_PAID").length,
    studentsOutstanding: feeStats.filter((row) =>
      ["PENDING", "OVERDUE", "PARTIALLY_PAID"].includes(row.status),
    ).length,
  };
}

export async function getPeriodFinance(period: ResolvedPeriod) {
  const { from, to } = isoRange(period);
  const feeQuery =
    period.mode === "month" && period.month
      ? db().from("FeeRecord").select("remainingAmount, expectedAmount, paidAmount, fineAmount, status").eq("month", period.month).eq("year", period.year)
      : db().from("FeeRecord").select("remainingAmount, expectedAmount, paidAmount, fineAmount, status").gte("dueDate", from).lte("dueDate", to);
  const [incomeRes, expenseRes, feeRes] = await Promise.all([
    db().from("IncomeTransaction").select("amount, category").is("voidedAt", null).gte("date", from).lte("date", to),
    db().from("ExpenseTransaction").select("amount, category, description").is("voidedAt", null).gte("date", from).lte("date", to),
    feeQuery,
  ]);
  if (incomeRes.error) throw incomeRes.error;
  if (expenseRes.error) throw expenseRes.error;
  if (feeRes.error) throw feeRes.error;
  const income = incomeRes.data ?? [];
  const expenses = expenseRes.data ?? [];
  const feeStats = feeRes.data ?? [];
  const totalIncome = income.reduce((total, row) => total + row.amount, 0);
  const totalExpenses = expenses.reduce((total, row) => total + row.amount, 0);
  const payroll = expenses.filter((row) => row.category === "SALARIES").reduce((total, row) => total + row.amount, 0);
  const advances = expenses.filter((row) => isAdvanceExpense(row.description)).reduce((total, row) => total + row.amount, 0);
  return {
    totalIncome,
    totalExpenses,
    net: totalIncome - totalExpenses,
    payroll,
    advances,
    outstanding: feeStats.reduce((total, row) => total + row.remainingAmount, 0),
    collected: feeStats.reduce((total, row) => total + row.paidAmount, 0),
  };
}

export async function getYearlyMonthTable(year: number) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const [incomeRes, expenseRes, feeRes] = await Promise.all([
    db().from("IncomeTransaction").select("date, amount, category").is("voidedAt", null).gte("date", from).lte("date", to),
    db().from("ExpenseTransaction").select("date, amount, category, description").is("voidedAt", null).gte("date", from).lte("date", to),
    db().from("FeeRecord").select("month, remainingAmount, expectedAmount, paidAmount, fineAmount").eq("year", year),
  ]);
  if (incomeRes.error) throw incomeRes.error;
  if (expenseRes.error) throw expenseRes.error;
  if (feeRes.error) throw feeRes.error;

  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    return {
      month,
      label: monthLabel(month, year).split(" ")[0],
      income: 0,
      expenses: 0,
      payroll: 0,
      fees: 0,
      outstanding: 0,
      net: 0,
    };
  });

  for (const row of incomeRes.data ?? []) {
    const month = Number(String(row.date).slice(5, 7));
    if (month < 1 || month > 12) continue;
    months[month - 1].income += row.amount;
    if (row.category === "STUDENT_FEE") months[month - 1].fees += row.amount;
  }
  for (const row of expenseRes.data ?? []) {
    const month = Number(String(row.date).slice(5, 7));
    if (month < 1 || month > 12) continue;
    months[month - 1].expenses += row.amount;
    if (row.category === "SALARIES" || isAdvanceExpense(row.description)) months[month - 1].payroll += row.amount;
  }
  for (const row of feeRes.data ?? []) {
    if (row.month < 1 || row.month > 12) continue;
    months[row.month - 1].outstanding += row.remainingAmount;
  }
  for (const row of months) row.net = row.income - row.expenses;
  return months;
}
