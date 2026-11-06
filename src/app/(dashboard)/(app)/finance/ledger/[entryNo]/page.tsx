import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { ACCOUNTS, ENTRY_STATUS_LABELS, getJournal, KIND_LABELS, voucherNumber, type AccountCode } from "@/lib/accounting";
import { EXPENSE_CATEGORY_LABELS, INCOME_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatDate, formatPKR, fullName, monthLabel } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import { FeeBadge } from "@/components/badges";

export const metadata = { title: "Journal entry" };

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" }).format(new Date(value));
}

const entryId = (entryNo: number) => `JE-${String(entryNo).padStart(5, "0")}`;

export default async function JournalEntryPage({ params }: { params: Promise<{ entryNo: string }> }) {
  await requirePermission("finance.view");
  const { entryNo } = await params;
  const number = Number(entryNo.replace(/^JE-?/i, ""));
  if (!Number.isInteger(number) || number < 1) notFound();
  const found = await getJournal({ entryNo: number, limit: 1 });
  if (!found.ready || !found.rows.length) notFound();
  const entry = found.rows[0];
  const history = await getJournal({ sourceId: entry.sourceId, limit: 100 });
  const related = history.ready ? [...history.rows].sort((a, b) => a.revision - b.revision) : [entry];
  const source = await loadSource(entry.sourceType, entry.sourceId);

  return (
    <div>
      <PageHeader
        title={`Journal entry ${entryId(entry.entryNo)}`}
        subtitle={`${KIND_LABELS[entry.kind as keyof typeof KIND_LABELS] ?? entry.kind} · ${formatDate(entry.date)} · ${ENTRY_STATUS_LABELS[entry.status]}`}
        actions={<Link href="/finance/ledger" className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm">Back to ledger</Link>}
      />
      <div className="grid gap-5 xl:grid-cols-3">
        <Card title="Entry" className="xl:col-span-2">
          <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-2">
            <Info label="Transaction ID" value={entryId(entry.entryNo)} />
            <Info label="Transaction date" value={formatDate(entry.date)} />
            <Info label="Description" value={entry.memo} />
            <Info label="Reference" value={entry.reference || "—"} />
            <Info label="Student" value={entry.studentName ? `${entry.studentName}${entry.registrationNo ? ` (${entry.registrationNo})` : ""}` : "—"} />
            <Info label="Fee voucher" value={entry.voucher ? `${entry.voucher.number} · ${entry.voucher.label}` : "—"} />
            <Info label="Created by" value={`${entry.recordedBy ?? "System"} · ${dateTime(entry.createdAt)}`} />
            <Info label="Status" value={`${ENTRY_STATUS_LABELS[entry.status]}${entry.revision > 1 ? ` (revision ${entry.revision})` : ""}`} />
          </dl>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-medium text-navy">{ACCOUNTS[entry.debitAccount as AccountCode]?.label ?? entry.debitAccount}</td>
                  <td className="text-right font-semibold">{formatPKR(entry.amount)}</td>
                  <td className="text-right text-slate-300">—</td>
                </tr>
                <tr>
                  <td className="pl-8 font-medium text-navy">{ACCOUNTS[entry.creditAccount as AccountCode]?.label ?? entry.creditAccount}</td>
                  <td className="text-right text-slate-300">—</td>
                  <td className="text-right font-semibold">{formatPKR(entry.amount)}</td>
                </tr>
                <tr className="font-semibold">
                  <td>Total</td>
                  <td className="text-right">{formatPKR(entry.amount)}</td>
                  <td className="text-right">{formatPKR(entry.amount)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-teal">✓ Debits equal credits</p>
        </Card>

        <Card title="Source document" subtitle={source?.title ?? "The record that produced this entry"}>
          {source ? (
            <>
              <dl className="space-y-2 text-sm">
                {source.rows.map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="text-right font-medium text-navy">{value}</dd>
                  </div>
                ))}
              </dl>
              {source.status ? <div className="mt-3"><FeeBadge status={source.status} /></div> : null}
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                {source.links.map(([label, href]) => (
                  <Link key={href} href={href} className="font-semibold text-orange hover:underline">{label} →</Link>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">The source record no longer exists. Its postings were reversed in the journal.</p>
          )}
        </Card>
      </div>

      <Card title="History of this document" subtitle="Every journal entry posted for the same voucher, payment or transaction, oldest first" className="mt-5">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Date</th>
                <th>Description</th>
                <th>Debit</th>
                <th>Credit</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {related.map((row) => (
                <tr key={row.id} className={row.id === entry.id ? "bg-amber-50/50" : undefined}>
                  <td><Link href={`/finance/ledger/${row.entryNo}`} className="text-teal">{entryId(row.entryNo)}</Link></td>
                  <td>{formatDate(row.date)}</td>
                  <td className="text-xs text-slate-600">{row.memo}</td>
                  <td>{ACCOUNTS[row.debitAccount as AccountCode]?.label ?? row.debitAccount}</td>
                  <td>{ACCOUNTS[row.creditAccount as AccountCode]?.label ?? row.creditAccount}</td>
                  <td className="text-right font-semibold text-navy">{formatPKR(row.amount)}</td>
                  <td>{ENTRY_STATUS_LABELS[row.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium text-navy">{value}</dd>
    </div>
  );
}

type Source = { title: string; rows: Array<[string, string]>; links: Array<[string, string]>; status?: string };

async function loadSource(sourceType: string, id: string): Promise<Source | null> {
  if (sourceType === "FeeRecord") {
    const { data } = await db().from("FeeRecord").select("*, student:Student(id, firstName, lastName, registrationNo)").eq("id", id).maybeSingle();
    if (!data) return null;
    return {
      title: "Fee voucher",
      status: data.status,
      rows: [
        ["Voucher", voucherNumber(data.year, data.month, data.student?.registrationNo, data.id)],
        ["Student", data.student ? fullName(data.student.firstName, data.student.lastName) : "—"],
        ["Fee month", monthLabel(data.month, data.year)],
        ["Voucher amount", formatPKR(Math.max(0, data.expectedAmount - data.waivedAmount) + (data.fineAmount ?? 0))],
        ["Paid", formatPKR(data.paidAmount)],
        ["Remaining", formatPKR(data.remainingAmount)],
        ["Due date", formatDate(data.dueDate)],
      ],
      links: [["Open in Accounts Receivable", `/finance/receivables?voucher=${data.id}`]],
    };
  }
  if (sourceType === "FeePayment") {
    const { data } = await db()
      .from("FeePayment")
      .select("*, incomeTransaction:IncomeTransaction(incomeId), feeRecord:FeeRecord(id, month, year), student:Student(firstName, lastName, registrationNo)")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return {
      title: data.voidedAt ? "Fee payment (deleted)" : "Fee payment",
      rows: [
        ["Receipt", data.incomeTransaction?.incomeId ?? "—"],
        ["Student", data.student ? fullName(data.student.firstName, data.student.lastName) : "—"],
        ["Voucher", data.feeRecord ? `${voucherNumber(data.feeRecord.year, data.feeRecord.month, data.student?.registrationNo, data.feeRecord.id)} · ${monthLabel(data.feeRecord.month, data.feeRecord.year)}` : "—"],
        ["Amount", formatPKR(data.amount)],
        ["Payment date", formatDate(data.paymentDate)],
        ["Method", PAYMENT_METHOD_LABELS[data.paymentMethod] ?? data.paymentMethod],
        ["Reference", data.referenceNumber || "—"],
      ],
      links: data.voidedAt ? [] : [["Payment receipt", `/finance/receipts/${data.id}`]],
    };
  }
  if (sourceType === "IncomeTransaction") {
    const { data } = await db().from("IncomeTransaction").select("*").eq("id", id).maybeSingle();
    if (!data) return null;
    return {
      title: data.voidedAt ? "Income (deleted)" : "Income",
      rows: [
        ["Income ID", data.incomeId],
        ["Category", INCOME_CATEGORY_LABELS[data.category as keyof typeof INCOME_CATEGORY_LABELS] ?? data.category],
        ["Amount", formatPKR(data.amount)],
        ["Date", formatDate(data.date)],
        ["Method", PAYMENT_METHOD_LABELS[data.paymentMethod] ?? data.paymentMethod],
        ["Reference", data.referenceNumber || "—"],
      ],
      links: [["Income register", "/finance/income"]],
    };
  }
  if (sourceType === "ExpenseTransaction") {
    const { data } = await db().from("ExpenseTransaction").select("*").eq("id", id).maybeSingle();
    if (!data) return null;
    return {
      title: data.voidedAt ? "Expense (deleted)" : "Expense",
      rows: [
        ["Expense ID", data.expenseId],
        ["Category", EXPENSE_CATEGORY_LABELS[data.category as keyof typeof EXPENSE_CATEGORY_LABELS] ?? data.category],
        ["Paid to", data.paidTo],
        ["Amount", formatPKR(data.amount)],
        ["Date", formatDate(data.date)],
        ["Method", PAYMENT_METHOD_LABELS[data.paymentMethod] ?? data.paymentMethod],
      ],
      links: [["Expense register", "/finance/expenses"]],
    };
  }
  return null;
}
