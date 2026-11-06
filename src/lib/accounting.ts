import type { PostgrestError } from "@supabase/supabase-js";
import { db, newId } from "@/lib/db";
import { isDummyDataEnabled } from "@/lib/supabase/dummy";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { calendarDateFromValue, calendarDateInKarachi, formatPKR, monthLabel } from "@/lib/utils";

/**
 * Double-entry journal.
 *
 * Fees, payments, income and expenses stay the source documents. Each one has
 * a posting rule (which account is debited and which is credited) and an
 * amount it should currently carry. Syncing compares that amount with what
 * the journal already holds for the document and posts only the difference,
 * as a new numbered revision:
 *
 *   Fee charged      DR Accounts Receivable   CR Fee Income
 *   Fee paid         DR Bank Account          CR Accounts Receivable
 *   Other income     DR Bank Account          CR Other Income
 *   Expense          DR Expenses              CR Bank Account
 *
 * A reduction (discount, waiver, voided payment) posts the same pair the other
 * way round. Each posting debits and credits the same amount, so the books
 * always balance, and because each document's revision number is unique in
 * the database, two requests can never post the same change twice.
 */

export const ACCOUNTS = {
  BANK: { label: "Bank Account", type: "asset" },
  ACCOUNTS_RECEIVABLE: { label: "Accounts Receivable", type: "asset" },
  FEE_INCOME: { label: "Fee Income", type: "income" },
  OTHER_INCOME: { label: "Other Income", type: "income" },
  EXPENSES: { label: "Expenses", type: "expense" },
} as const;

export type AccountCode = keyof typeof ACCOUNTS;
export const ACCOUNT_CODES = Object.keys(ACCOUNTS) as AccountCode[];

type SourceType = "FeeRecord" | "FeePayment" | "IncomeTransaction" | "ExpenseTransaction";
type Kind = "FEE_CHARGE" | "FEE_PAYMENT" | "INCOME" | "EXPENSE";

export const KIND_LABELS: Record<Kind, string> = {
  FEE_CHARGE: "Fee charged",
  FEE_PAYMENT: "Fee payment",
  INCOME: "Income",
  EXPENSE: "Expense",
};

type Target = {
  sourceType: SourceType;
  sourceId: string;
  kind: Kind;
  debit: AccountCode;
  credit: AccountCode;
  /** What the document should carry in the journal right now. */
  amount: number;
  /** Date of the first posting; later adjustments are dated the day they happen. */
  date: string;
  studentId: string | null;
  createdById: string | null;
  adjustedById: string | null;
  memo: string;
  increaseMemo: string;
  decreaseMemo: string;
};

type Posted = { net: number; revision: number; debit: AccountCode; credit: AccountCode; studentId: string | null; kind: Kind };

export type JournalRow = {
  id: string;
  entryNo: number;
  date: string;
  kind: string;
  sourceType: string;
  sourceId: string;
  revision: number;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  studentId: string | null;
  memo: string;
  createdAt: string;
  createdById: string | null;
};

const PAGE = 1000;
const round = (value: number) => Math.round(value * 100) / 100;

/** True when the database does not have the journal table yet (the migration has not been run). */
export function isMissingJournal(error: Pick<PostgrestError, "code" | "message"> | null | undefined) {
  if (!error) return false;
  return error.code === "PGRST205" || error.code === "42P01" || /JournalEntry/.test(error.message ?? "") && /(does not exist|schema cache)/.test(error.message ?? "");
}

class JournalMissingError extends Error {
  constructor() {
    super("The accounting journal has not been set up. Run the JournalEntry database migration.");
  }
}

type Query = { range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: PostgrestError | null }> };

/** Supabase returns at most 1,000 rows per request, so large tables are read page by page. */
export async function readAll<T>(build: () => Query): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) {
      if (isMissingJournal(error)) throw new JournalMissingError();
      throw error;
    }
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

function chunks<T>(list: T[], size = 200) {
  const out: T[][] = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
}

// ---------------------------------------------------------------- Posting rules

type FeeRecordSource = {
  id: string;
  studentId: string;
  month: number;
  year: number;
  expectedAmount: number;
  waivedAmount: number;
  fineAmount: number | null;
  createdById: string | null;
  updatedById: string | null;
};

type FeePaymentSource = {
  id: string;
  studentId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: keyof typeof PAYMENT_METHOD_LABELS;
  referenceNumber: string | null;
  voidedAt: string | null;
  voidedById: string | null;
  createdById: string | null;
  updatedById: string | null;
  feeRecord: { month: number; year: number } | null;
  incomeTransaction: { incomeId: string } | null;
};

type IncomeSource = {
  id: string;
  incomeId: string;
  date: string;
  amount: number;
  category: string;
  source: string | null;
  studentId: string | null;
  voidedAt: string | null;
  voidedById: string | null;
  createdById: string | null;
  updatedById: string | null;
};

type ExpenseSource = {
  id: string;
  expenseId: string;
  date: string;
  amount: number;
  category: string;
  paidTo: string;
  voidedAt: string | null;
  voidedById: string | null;
  createdById: string | null;
  updatedById: string | null;
};

const FEE_RECORD_COLUMNS = "id, studentId, month, year, expectedAmount, waivedAmount, fineAmount, createdById, updatedById";
const FEE_PAYMENT_COLUMNS =
  "id, studentId, amount, paymentDate, paymentMethod, referenceNumber, voidedAt, voidedById, createdById, updatedById, feeRecord:FeeRecord(month, year), incomeTransaction:IncomeTransaction(incomeId)";
const INCOME_COLUMNS = "id, incomeId, date, amount, category, source, studentId, voidedAt, voidedById, createdById, updatedById";
const EXPENSE_COLUMNS = "id, expenseId, date, amount, category, paidTo, voidedAt, voidedById, createdById, updatedById";

function feeCharge(record: FeeRecordSource): Target {
  const label = monthLabel(record.month, record.year);
  const amount = round(Math.max(0, Number(record.expectedAmount) - Number(record.waivedAmount)) + Number(record.fineAmount ?? 0));
  return {
    sourceType: "FeeRecord",
    sourceId: record.id,
    kind: "FEE_CHARGE",
    debit: "ACCOUNTS_RECEIVABLE",
    credit: "FEE_INCOME",
    amount,
    date: `${record.year}-${String(record.month).padStart(2, "0")}-01`,
    studentId: record.studentId,
    createdById: record.createdById,
    adjustedById: record.updatedById ?? record.createdById,
    memo: `Fee charged for ${label}`,
    increaseMemo: `Fee for ${label} increased (late fee or fee change); now ${formatPKR(amount)}`,
    decreaseMemo: `Fee for ${label} reduced (discount, waiver or fee change); now ${formatPKR(amount)}`,
  };
}

function feePayment(payment: FeePaymentSource): Target {
  const month = payment.feeRecord ? monthLabel(payment.feeRecord.month, payment.feeRecord.year) : "fee";
  const receipt = payment.incomeTransaction?.incomeId ?? payment.referenceNumber ?? payment.id.slice(0, 8);
  const method = PAYMENT_METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod;
  return {
    sourceType: "FeePayment",
    sourceId: payment.id,
    kind: "FEE_PAYMENT",
    debit: "BANK",
    credit: "ACCOUNTS_RECEIVABLE",
    amount: payment.voidedAt ? 0 : round(Number(payment.amount)),
    date: calendarDateFromValue(payment.paymentDate),
    studentId: payment.studentId,
    createdById: payment.createdById,
    adjustedById: payment.voidedAt ? payment.voidedById ?? payment.updatedById : payment.updatedById ?? payment.createdById,
    memo: `Fee payment for ${month} · ${method} · receipt ${receipt}`,
    increaseMemo: `Payment ${receipt} for ${month} increased`,
    decreaseMemo: payment.voidedAt ? `Payment ${receipt} for ${month} deleted / voided` : `Payment ${receipt} for ${month} reduced`,
  };
}

function otherIncome(income: IncomeSource): Target {
  return {
    sourceType: "IncomeTransaction",
    sourceId: income.id,
    kind: "INCOME",
    debit: "BANK",
    // Fee money with no fee record behind it (older records) is still fee income.
    credit: income.category === "STUDENT_FEE" ? "FEE_INCOME" : "OTHER_INCOME",
    amount: income.voidedAt ? 0 : round(Number(income.amount)),
    date: calendarDateFromValue(income.date),
    studentId: income.studentId,
    createdById: income.createdById,
    adjustedById: income.voidedAt ? income.voidedById ?? income.updatedById : income.updatedById ?? income.createdById,
    memo: `Income ${income.incomeId}${income.source ? ` · ${income.source}` : ""}`,
    increaseMemo: `Income ${income.incomeId} increased`,
    decreaseMemo: income.voidedAt ? `Income ${income.incomeId} deleted / voided` : `Income ${income.incomeId} reduced`,
  };
}

function expense(row: ExpenseSource): Target {
  return {
    sourceType: "ExpenseTransaction",
    sourceId: row.id,
    kind: "EXPENSE",
    debit: "EXPENSES",
    credit: "BANK",
    amount: row.voidedAt ? 0 : round(Number(row.amount)),
    date: calendarDateFromValue(row.date),
    studentId: null,
    createdById: row.createdById,
    adjustedById: row.voidedAt ? row.voidedById ?? row.updatedById : row.updatedById ?? row.createdById,
    memo: `Expense ${row.expenseId} · ${row.paidTo}`,
    increaseMemo: `Expense ${row.expenseId} increased`,
    decreaseMemo: row.voidedAt ? `Expense ${row.expenseId} deleted / voided` : `Expense ${row.expenseId} reduced`,
  };
}

// ---------------------------------------------------------------- Sync

export type LedgerScope = {
  feeRecordIds?: string[];
  incomeIds?: string[];
  expenseIds?: string[];
};

async function loadTargets(scope: LedgerScope | null) {
  const targets: Target[] = [];
  const ids = (list?: string[]) => [...new Set((list ?? []).filter(Boolean))];

  if (!scope) {
    const [records, payments, incomes, expenses] = await Promise.all([
      readAll<FeeRecordSource>(() => db().from("FeeRecord").select(FEE_RECORD_COLUMNS).order("id")),
      readAll<FeePaymentSource>(() => db().from("FeePayment").select(FEE_PAYMENT_COLUMNS).order("id")),
      readAll<IncomeSource & { feePayment: unknown }>(() => db().from("IncomeTransaction").select(`${INCOME_COLUMNS}, feePayment:FeePayment(id)`).order("id")),
      readAll<ExpenseSource>(() => db().from("ExpenseTransaction").select(EXPENSE_COLUMNS).order("id")),
    ]);
    targets.push(...records.map(feeCharge), ...payments.map(feePayment), ...expenses.map(expense));
    // Fee money is posted through its payment, so its income row is skipped.
    const linked = new Set(payments.map((payment) => payment.incomeTransaction?.incomeId).filter(Boolean));
    targets.push(...incomes.filter((income) => !hasFeePayment(income.feePayment) && !linked.has(income.incomeId)).map(otherIncome));
    return targets;
  }

  for (const group of chunks(ids(scope.feeRecordIds), 100)) {
    const [records, payments] = await Promise.all([
      db().from("FeeRecord").select(FEE_RECORD_COLUMNS).in("id", group),
      db().from("FeePayment").select(FEE_PAYMENT_COLUMNS).in("feeRecordId", group),
    ]);
    if (records.error) throw records.error;
    if (payments.error) throw payments.error;
    targets.push(...((records.data ?? []) as FeeRecordSource[]).map(feeCharge));
    targets.push(...((payments.data ?? []) as unknown as FeePaymentSource[]).map(feePayment));
  }
  for (const group of chunks(ids(scope.incomeIds), 100)) {
    const res = await db().from("IncomeTransaction").select(`${INCOME_COLUMNS}, feePayment:FeePayment(id)`).in("id", group);
    if (res.error) throw res.error;
    const rows = (res.data ?? []) as unknown as Array<IncomeSource & { feePayment: unknown }>;
    targets.push(...rows.filter((row) => !hasFeePayment(row.feePayment)).map(otherIncome));
  }
  for (const group of chunks(ids(scope.expenseIds), 100)) {
    const res = await db().from("ExpenseTransaction").select(EXPENSE_COLUMNS).in("id", group);
    if (res.error) throw res.error;
    targets.push(...((res.data ?? []) as ExpenseSource[]).map(expense));
  }
  return targets;
}

function hasFeePayment(value: unknown) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

async function loadPosted(targets: Target[] | null) {
  let rows: JournalRow[];
  if (!targets) {
    rows = await readAll<JournalRow>(() => db().from("JournalEntry").select("*").order("entryNo"));
  } else {
    rows = [];
    for (const group of chunks([...new Set(targets.map((target) => target.sourceId))], 100)) {
      const res = await db().from("JournalEntry").select("*").in("sourceId", group);
      if (res.error) {
        if (isMissingJournal(res.error)) throw new JournalMissingError();
        throw res.error;
      }
      rows.push(...((res.data ?? []) as JournalRow[]));
    }
  }
  const posted = new Map<string, Posted>();
  // Oldest revision first: the first posting fixes the document's normal direction, and reversals subtract.
  for (const row of [...rows].sort((a, b) => a.revision - b.revision)) {
    const key = `${row.sourceType}:${row.sourceId}`;
    const base = posted.get(key) ?? {
      net: 0,
      revision: 0,
      debit: row.debitAccount as AccountCode,
      credit: row.creditAccount as AccountCode,
      studentId: row.studentId,
      kind: row.kind as Kind,
    };
    base.net = round(base.net + (row.debitAccount === base.debit ? Number(row.amount) : -Number(row.amount)));
    base.revision = Math.max(base.revision, row.revision);
    posted.set(key, base);
  }
  return posted;
}

type Insert = {
  id: string;
  date: string;
  kind: Kind;
  sourceType: SourceType;
  sourceId: string;
  revision: number;
  debitAccount: AccountCode;
  creditAccount: AccountCode;
  amount: number;
  studentId: string | null;
  memo: string;
  createdById: string | null;
};

async function insertEntries(entries: Insert[]) {
  let posted = 0;
  for (const group of chunks(entries)) {
    const res = await db().from("JournalEntry").insert(group);
    if (!res.error) {
      posted += group.length;
      continue;
    }
    if (isMissingJournal(res.error)) throw new JournalMissingError();
    if (res.error.code !== "23505") throw res.error;
    // Another request posted some of these first; keep the rest one by one.
    for (const entry of group) {
      const single = await db().from("JournalEntry").insert(entry);
      if (!single.error) posted += 1;
      else if (single.error.code !== "23505") throw single.error;
    }
  }
  return posted;
}

async function sync(scope: LedgerScope | null, userId?: string | null) {
  const targets = await loadTargets(scope);
  const posted = await loadPosted(scope ? targets : null);
  const today = calendarDateInKarachi();
  const entries: Insert[] = [];
  const seen = new Set<string>();

  for (const target of targets) {
    const key = `${target.sourceType}:${target.sourceId}`;
    seen.add(key);
    const current = posted.get(key);
    const delta = round(target.amount - (current?.net ?? 0));
    if (Math.abs(delta) < 0.005) continue;
    const first = !current;
    const forward = delta > 0;
    entries.push({
      id: newId(),
      date: first ? target.date : today,
      kind: target.kind,
      sourceType: target.sourceType,
      sourceId: target.sourceId,
      revision: (current?.revision ?? 0) + 1,
      debitAccount: forward ? target.debit : target.credit,
      creditAccount: forward ? target.credit : target.debit,
      amount: Math.abs(delta),
      studentId: target.studentId,
      memo: first ? target.memo : forward ? target.increaseMemo : target.decreaseMemo,
      createdById: userId ?? (first ? target.createdById : target.adjustedById) ?? null,
    });
  }

  // A document that no longer exists (for example an import that was rolled back) is reversed in full.
  if (!scope) {
    for (const [key, current] of posted) {
      if (seen.has(key) || Math.abs(current.net) < 0.005) continue;
      const [sourceType, sourceId] = key.split(":") as [SourceType, string];
      entries.push({
        id: newId(),
        date: today,
        kind: current.kind,
        sourceType,
        sourceId,
        revision: current.revision + 1,
        debitAccount: current.net > 0 ? current.credit : current.debit,
        creditAccount: current.net > 0 ? current.debit : current.credit,
        amount: Math.abs(current.net),
        studentId: current.studentId,
        memo: "Reversed: the original record was removed",
        createdById: userId ?? null,
      });
    }
  }

  return entries.length ? insertEntries(entries) : 0;
}

let fullSync: Promise<number> | null = null;
let queuedSync: Promise<number> | null = null;
let fullSyncAt = 0;
const FULL_SYNC_MS = 45_000;

/**
 * Posts whatever the journal is missing for the given documents. Money is
 * recorded first and the journal follows, so a journal problem never blocks
 * a payment: it is logged and the next full sync catches up.
 */
export async function syncLedger(scope?: LedgerScope, userId?: string | null) {
  try {
    if (scope) return await sync(scope, userId);
    if (fullSync) {
      // A pass already running may have read the records before this change, so one more follows it.
      queuedSync ??= fullSync.catch(() => 0).then(() => {
        queuedSync = null;
        return runFullSync(userId);
      });
      return await queuedSync;
    }
    return await runFullSync(userId);
  } catch (error) {
    if (error instanceof JournalMissingError) return 0;
    console.error("[ledger] sync failed", error);
    return 0;
  }
}

function runFullSync(userId?: string | null) {
  fullSync = sync(null, userId).finally(() => {
    fullSync = null;
    fullSyncAt = Date.now();
  });
  return fullSync;
}

/** Full sync at most every 45 seconds per server, for pages that show balances. */
export async function ensureLedger() {
  if (fullSync) return fullSync;
  if (Date.now() - fullSyncAt < FULL_SYNC_MS) return 0;
  return syncLedger();
}

export function invalidateLedger() {
  fullSyncAt = 0;
}

// ---------------------------------------------------------------- Reports

export type AccountBalance = {
  code: AccountCode;
  label: string;
  type: (typeof ACCOUNTS)[AccountCode]["type"];
  debit: number;
  credit: number;
  /** On the account's normal side: debit minus credit for assets and expenses, credit minus debit for income. */
  balance: number;
};

export type LedgerSummary =
  | { ready: false }
  | {
      ready: true;
      accounts: AccountBalance[];
      totalDebit: number;
      totalCredit: number;
      entries: number;
      receivableByStudent: Map<string, number>;
    };

async function journalTotals() {
  if (!isDummyDataEnabled()) {
    const [totals, students] = await Promise.all([
      db().rpc("journal_account_totals"),
      db().rpc("journal_student_receivables"),
    ]);
    if (!totals.error && !students.error) {
      return {
        totals: (totals.data ?? []).map((row) => ({ account: row.account, debit: Number(row.debit), credit: Number(row.credit), entries: Number(row.entries) })),
        students: (students.data ?? []).map((row) => ({ studentId: row.studentId, balance: Number(row.balance) })),
      };
    }
    const error = totals.error ?? students.error;
    // Without the helper functions, fall back to adding the rows up here.
    if (error && error.code !== "PGRST202" && !isMissingJournal(error)) throw error;
  }
  const rows = await readAll<JournalRow>(() => db().from("JournalEntry").select("debitAccount, creditAccount, amount, studentId").order("id"));
  const byAccount = new Map<string, { debit: number; credit: number; entries: number }>();
  const byStudent = new Map<string, number>();
  for (const row of rows) {
    const amount = Number(row.amount);
    const debit = byAccount.get(row.debitAccount) ?? { debit: 0, credit: 0, entries: 0 };
    debit.debit += amount;
    debit.entries += 1;
    byAccount.set(row.debitAccount, debit);
    const credit = byAccount.get(row.creditAccount) ?? { debit: 0, credit: 0, entries: 0 };
    credit.credit += amount;
    byAccount.set(row.creditAccount, credit);
    if (row.studentId && (row.debitAccount === "ACCOUNTS_RECEIVABLE" || row.creditAccount === "ACCOUNTS_RECEIVABLE")) {
      const sign = row.debitAccount === "ACCOUNTS_RECEIVABLE" ? 1 : -1;
      byStudent.set(row.studentId, (byStudent.get(row.studentId) ?? 0) + sign * amount);
    }
  }
  return {
    totals: [...byAccount].map(([account, value]) => ({ account, ...value })),
    students: [...byStudent].map(([studentId, balance]) => ({ studentId, balance })),
  };
}

export async function getLedgerSummary(): Promise<LedgerSummary> {
  try {
    // This month's fees (and late fees) first, so they are part of the balances.
    const { refreshFeeBalances } = await import("@/lib/finance");
    await refreshFeeBalances();
    await ensureLedger();
    const { totals, students } = await journalTotals();
    const map = new Map(totals.map((row) => [row.account, row]));
    const accounts = ACCOUNT_CODES.map((code) => {
      const row = map.get(code) ?? { debit: 0, credit: 0 };
      const debit = round(row.debit);
      const credit = round(row.credit);
      const normalDebit = ACCOUNTS[code].type !== "income";
      return { code, label: ACCOUNTS[code].label, type: ACCOUNTS[code].type, debit, credit, balance: round(normalDebit ? debit - credit : credit - debit) };
    });
    return {
      ready: true,
      accounts,
      totalDebit: round(accounts.reduce((sum, row) => sum + row.debit, 0)),
      totalCredit: round(accounts.reduce((sum, row) => sum + row.credit, 0)),
      entries: totals.reduce((sum, row) => sum + ("entries" in row ? Number(row.entries) : 0), 0),
      receivableByStudent: new Map(students.map((row) => [row.studentId, round(row.balance)])),
    };
  } catch (error) {
    if (error instanceof JournalMissingError) return { ready: false };
    throw error;
  }
}

export function balanceOf(summary: LedgerSummary, code: AccountCode) {
  return summary.ready ? summary.accounts.find((row) => row.code === code)?.balance ?? 0 : 0;
}

export type JournalListItem = JournalRow & {
  studentName: string | null;
  registrationNo: string | null;
  recordedBy: string | null;
};

export async function getJournal(filters: {
  account?: string;
  studentId?: string;
  kind?: string;
  from?: string;
  to?: string;
  limit?: number;
} = {}): Promise<{ ready: false } | { ready: true; rows: JournalListItem[]; truncated: boolean }> {
  const limit = filters.limit ?? 300;
  const account = filters.account && ACCOUNT_CODES.includes(filters.account as AccountCode) ? filters.account : null;
  // The desktop dummy store has no OR filter, so it filters by account after reading.
  const filterLater = Boolean(account) && isDummyDataEnabled();
  let query = db()
    .from("JournalEntry")
    .select("*, student:Student(firstName, lastName, registrationNo), createdBy:User(name)")
    .order("entryNo", { ascending: false })
    .limit(filterLater ? 100_000 : limit + 1);
  if (filters.studentId) query = query.eq("studentId", filters.studentId);
  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.from) query = query.gte("date", filters.from);
  if (filters.to) query = query.lte("date", filters.to);
  // Either side of the posting.
  if (account && !filterLater) query = query.or(`debitAccount.eq.${account},creditAccount.eq.${account}`);
  const res = await query;
  if (res.error) {
    if (isMissingJournal(res.error)) return { ready: false };
    throw res.error;
  }
  type Joined = JournalRow & {
    student: { firstName: string; lastName: string; registrationNo: string | null } | null;
    createdBy: { name: string } | null;
  };
  const rows = ((res.data ?? []) as unknown as Joined[])
    .filter((row) => !filterLater || row.debitAccount === account || row.creditAccount === account)
    .map(({ student, createdBy, ...row }) => ({
    ...row,
    amount: Number(row.amount),
    studentName: student ? `${student.firstName} ${student.lastName}`.trim() : null,
    registrationNo: student?.registrationNo ?? null,
    recordedBy: createdBy?.name ?? null,
  }));
  return { ready: true, rows: rows.slice(0, limit), truncated: rows.length > limit };
}

/** Unpaid and partly paid fee records across all months, for the dashboard. */
export async function getOpenFeeTotals() {
  const rows = await readAll<{ status: string; remainingAmount: number; studentId: string }>(() =>
    db().from("FeeRecord").select("status, remainingAmount, studentId").in("status", ["PENDING", "OVERDUE", "PARTIALLY_PAID"]).order("id"),
  );
  const unpaid = rows.filter((row) => row.status !== "PARTIALLY_PAID");
  const partial = rows.filter((row) => row.status === "PARTIALLY_PAID");
  const sum = (list: typeof rows) => round(list.reduce((total, row) => total + Number(row.remainingAmount), 0));
  return {
    unpaidAmount: sum(unpaid),
    unpaidCount: unpaid.length,
    partialAmount: sum(partial),
    partialCount: partial.length,
    studentsOwing: new Set(rows.filter((row) => Number(row.remainingAmount) > 0).map((row) => row.studentId)).size,
  };
}

// ---------------------------------------------------------------- Month-by-month movements

export type MonthlyMovement = {
  /** YYYY-MM */
  month: string;
  kind: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  entries: number;
};

/** Journal totals grouped by month, type and account pair. Null when the journal table is missing. */
export async function getMonthlyMovements(): Promise<MonthlyMovement[] | null> {
  try {
    if (!isDummyDataEnabled()) {
      const res = await db().rpc("journal_monthly_totals");
      if (!res.error) {
        return (res.data ?? []).map((row) => ({ ...row, amount: Number(row.amount), entries: Number(row.entries) }));
      }
      if (res.error.code !== "PGRST202" && !isMissingJournal(res.error)) throw res.error;
    }
    const rows = await readAll<JournalRow>(() => db().from("JournalEntry").select("date, kind, debitAccount, creditAccount, amount").order("id"));
    const groups = new Map<string, MonthlyMovement>();
    for (const row of rows) {
      const month = String(row.date).slice(0, 7);
      const key = `${month}|${row.kind}|${row.debitAccount}|${row.creditAccount}`;
      const group = groups.get(key) ?? { month, kind: row.kind, debitAccount: row.debitAccount, creditAccount: row.creditAccount, amount: 0, entries: 0 };
      group.amount += Number(row.amount);
      group.entries += 1;
      groups.set(key, group);
    }
    return [...groups.values()];
  } catch (error) {
    if (error instanceof JournalMissingError) return null;
    throw error;
  }
}

/**
 * Net movement of one account in a set of postings, on the account's normal
 * side (debits for assets and expenses, credits for income).
 */
export function netMovement(rows: Pick<MonthlyMovement, "debitAccount" | "creditAccount" | "amount">[], account: AccountCode) {
  const sign = ACCOUNTS[account].type === "income" ? -1 : 1;
  let total = 0;
  for (const row of rows) {
    if (row.debitAccount === account) total += sign * row.amount;
    if (row.creditAccount === account) total -= sign * row.amount;
  }
  return round(total);
}

/** Money received from students: fee payments (DR Bank / CR Accounts Receivable) and fee income received directly. */
export function collectionsIn(rows: MonthlyMovement[]) {
  return netMovement(
    rows.filter((row) => row.kind === "FEE_PAYMENT" || (row.kind === "INCOME" && (row.creditAccount === "FEE_INCOME" || row.debitAccount === "FEE_INCOME"))),
    "BANK",
  );
}
