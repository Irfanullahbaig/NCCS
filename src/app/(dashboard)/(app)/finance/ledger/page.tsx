import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { ImportButton } from "@/components/import-dialog";
import { importTypesFor } from "@/lib/import/specs";
import {
  ACCOUNT_CODES,
  ACCOUNTS,
  ENTRY_STATUS_LABELS,
  getJournal,
  KIND_LABELS,
  prepareLedger,
  type AccountCode,
  type EntryStatus,
} from "@/lib/accounting";
import { cn, formatDate, formatPKR } from "@/lib/utils";
import { Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";

export const metadata = { title: "Accounting ledger" };

const STATUS_TONE: Record<EntryStatus, string> = {
  POSTED: "bg-sage text-teal",
  ADJUSTMENT: "bg-sky-50 text-sky-800",
  REVERSAL: "bg-rose-50 text-rose-700",
};

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" }).format(new Date(value));
}

export default async function LedgerPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("finance.view");
  const importTypes = importTypesFor(user.role, ["transactions", "fees", "income", "expenses"]);
  const params = await searchParams;
  const dateOk = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined);
  const account = ACCOUNT_CODES.includes(params.account as AccountCode) ? (params.account as AccountCode) : undefined;
  const kind = params.kind && params.kind in KIND_LABELS ? params.kind : undefined;
  const status = params.status && params.status in ENTRY_STATUS_LABELS ? params.status : undefined;
  const from = dateOk(params.from);
  const to = dateOk(params.to);
  const q = params.q?.trim() || undefined;

  await prepareLedger();
  const journal = await getJournal({ account, kind, status, from, to, q, studentId: params.student, limit: 500 });
  const rows = journal.ready ? journal.rows : [];
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div>
      <PageHeader
        title="Accounting ledger"
        subtitle="Every financial transaction as a balanced journal entry. Entries are never edited or deleted; corrections are posted as adjusting or reversing entries."
        actions={
          <>
            {importTypes.length ? <ImportButton types={importTypes} label="Import" /> : null}
            <Link href="/finance/accounts" className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm">Trial balance</Link>
          </>
        }
      />

      <form className="mb-4 grid gap-3 rounded-3xl bg-white p-4 shadow-card md:grid-cols-4 xl:grid-cols-8" action="/finance/ledger">
        {params.student ? <input type="hidden" name="student" value={params.student} /> : null}
        <Input name="q" defaultValue={q} placeholder="Search entry, student, reference…" aria-label="Search" className="md:col-span-2" />
        <Select name="account" defaultValue={account ?? ""} aria-label="Account">
          <option value="">All accounts</option>
          {ACCOUNT_CODES.map((code) => (
            <option key={code} value={code}>{ACCOUNTS[code].label}</option>
          ))}
        </Select>
        <Select name="kind" defaultValue={kind ?? ""} aria-label="Transaction type">
          <option value="">All types</option>
          {Object.entries(KIND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
        <Select name="status" defaultValue={status ?? ""} aria-label="Status">
          <option value="">Any status</option>
          {Object.entries(ENTRY_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
        <Input type="date" name="from" defaultValue={from} aria-label="From date" />
        <Input type="date" name="to" defaultValue={to} aria-label="To date" />
        <div className="flex gap-2">
          <button className="h-10 flex-1 rounded-xl bg-navy text-sm font-medium text-white">Apply</button>
          <Link href="/finance/ledger" className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 px-3 text-sm text-slate-600">Clear</Link>
        </div>
      </form>

      {!journal.ready ? (
        <EmptyState
          title="The accounting journal is not set up yet"
          description="Run the database migrations 20261106000000_journal_entries.sql and 20261108000000_journal_cash_account.sql. Every fee voucher, payment, income and expense already recorded is then posted automatically."
        />
      ) : (
        <Card
          title={`${rows.length.toLocaleString("en-PK")} journal entr${rows.length === 1 ? "y" : "ies"}`}
          subtitle={`Total debits ${formatPKR(total)} = total credits ${formatPKR(total)}`}
        >
          {rows.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Reference</th>
                    <th>Account</th>
                    <th className="text-right">Debit</th>
                    <th className="text-right">Credit</th>
                    <th>Student / voucher</th>
                    <th>Created by</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="whitespace-nowrap">
                        <Link href={`/finance/ledger/${row.entryNo}`} className="font-medium text-teal hover:underline">
                          JE-{String(row.entryNo).padStart(5, "0")}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap">{formatDate(row.date)}</td>
                      <td className="min-w-56">
                        <div className="font-medium text-navy">{KIND_LABELS[row.kind as keyof typeof KIND_LABELS] ?? row.kind}</div>
                        <div className="text-xs text-slate-500">{row.memo}</div>
                      </td>
                      <td className="whitespace-nowrap text-xs">{row.reference || "—"}</td>
                      <td className="whitespace-nowrap">
                        <div>{ACCOUNTS[row.debitAccount as AccountCode]?.label ?? row.debitAccount}</div>
                        <div className="pl-4 text-slate-600">{ACCOUNTS[row.creditAccount as AccountCode]?.label ?? row.creditAccount}</div>
                      </td>
                      <td className="whitespace-nowrap text-right font-medium text-navy">
                        <div>{formatPKR(row.amount)}</div>
                        <div className="text-slate-300">—</div>
                      </td>
                      <td className="whitespace-nowrap text-right font-medium text-navy">
                        <div className="text-slate-300">—</div>
                        <div>{formatPKR(row.amount)}</div>
                      </td>
                      <td className="min-w-40">
                        {row.studentId && row.studentName ? (
                          <Link href={`/finance/ledger?student=${row.studentId}`} className="text-navy hover:underline">{row.studentName}</Link>
                        ) : (
                          "—"
                        )}
                        {row.voucher ? (
                          <Link href={`/finance/receivables?voucher=${row.voucher.id}`} className="block text-xs text-slate-500 hover:underline">
                            {row.voucher.number} · {row.voucher.label}
                          </Link>
                        ) : row.registrationNo ? (
                          <div className="text-xs text-slate-500">{row.registrationNo}</div>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap">
                        {row.recordedBy ?? "System"}
                        <div className="text-xs text-slate-500">{dateTime(row.createdAt)}</div>
                      </td>
                      <td>
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TONE[row.status])}>{ENTRY_STATUS_LABELS[row.status]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td colSpan={5}>Totals</td>
                    <td className="text-right">{formatPKR(total)}</td>
                    <td className="text-right">{formatPKR(total)}</td>
                    <td colSpan={3} className="text-xs font-normal text-teal">✓ Debits equal credits</td>
                  </tr>
                </tfoot>
              </table>
              {journal.truncated ? <p className="mt-3 text-xs text-slate-500">Showing the latest {rows.length} entries. Narrow the filters to see older ones.</p> : null}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No journal entries match these filters.</p>
          )}
        </Card>
      )}
    </div>
  );
}
