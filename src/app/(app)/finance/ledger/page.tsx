import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getLedgerEntries } from "@/lib/ledger";
import { periodFromParams } from "@/lib/period";
import { formatDate, formatPKR } from "@/lib/utils";
import { Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { PeriodFilter } from "@/components/period-filter";
import { EXPENSE_CATEGORY_LABELS, INCOME_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";

function typeLabel(type: string) {
  return INCOME_CATEGORY_LABELS[type as keyof typeof INCOME_CATEGORY_LABELS]
    ?? EXPENSE_CATEGORY_LABELS[type as keyof typeof EXPENSE_CATEGORY_LABELS]
    ?? (type === "ADVANCE_SALARY" ? "Advance salary" : type.replaceAll("_", " "));
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("finance.view");
  const params = await searchParams;
  const period = periodFromParams(params);
  const rows = await getLedgerEntries(period, {
    q: params.q,
    type: params.type,
    method: params.method,
    studentId: params.studentId,
    staffId: params.staffId,
  });
  const selected = rows.find((row) => row.id === params.txn || row.transactionId === params.txn);

  return (
    <div>
      <PageHeader
        title="Transactions / Ledger"
        subtitle={`Every posted income and expense for ${period.label}, with the person and period it belongs to.`}
      />
      <PeriodFilter
        action="/finance/ledger"
        period={period}
        extra={
          <>
            <Input name="q" placeholder="Search student, ID, receipt…" defaultValue={params.q} />
            <Select name="type" defaultValue={params.type ?? ""}>
              <option value="">All types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="STUDENT_FEE">Student fee</option>
              <option value="ADMISSION_FEE">Admission fee</option>
              <option value="SALARIES">Payroll</option>
              <option value="ADVANCE_SALARY">Advance salary</option>
            </Select>
            <Select name="method" defaultValue={params.method ?? ""}>
              <option value="">Payment method</option>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </>
        }
      />
      {selected ? (
        <Card title={`Transaction ${selected.transactionId}`} className="mb-6" action={selected.personHref ? <Link href={selected.personHref} className="text-sm text-teal">{selected.personHref.startsWith("/staff") ? "View employee" : "View student"}</Link> : null}>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Info label="Type" value={typeLabel(selected.type)} />
            <Info label="Source" value={selected.source} />
            <Info label="Person / entity" value={selected.person} />
            <Info label="Program / class" value={selected.program || "—"} />
            <Info label="Fee / salary month" value={selected.monthLabel || "—"} />
            <Info label="Date" value={formatDate(selected.date)} />
            <Info label="Amount" value={formatPKR(selected.signedAmount)} />
            <Info label="Method" value={PAYMENT_METHOD_LABELS[selected.method as keyof typeof PAYMENT_METHOD_LABELS] ?? selected.method} />
            <Info label="Receipt / ID" value={selected.receiptId} />
            <Info label="Status" value={selected.status} />
            <Info label="Notes" value={selected.notes || "—"} />
          </dl>
        </Card>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Transaction ID</th>
                  <th>Type</th>
                  <th>Source</th>
                  <th>Person</th>
                  <th>Program</th>
                  <th>Month</th>
                  <th>Amount</th>
                  <th>Method</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.direction}-${row.id}`}>
                    <td>{formatDate(row.date)}</td>
                    <td>
                      <Link href={`/finance/ledger?txn=${encodeURIComponent(row.transactionId)}`} className="font-medium text-navy">
                        {row.transactionId}
                      </Link>
                    </td>
                    <td>{row.direction === "income" ? "Income" : "Expense"}</td>
                    <td>{typeLabel(row.type)}</td>
                    <td>
                      {row.personHref ? <Link href={row.personHref} className="text-teal">{row.person}</Link> : row.person}
                    </td>
                    <td>{row.program || "—"}</td>
                    <td>{row.monthLabel || "—"}</td>
                    <td className={row.signedAmount < 0 ? "text-rose-700" : "text-emerald-700"}>{formatPKR(row.signedAmount)}</td>
                    <td>{PAYMENT_METHOD_LABELS[row.method as keyof typeof PAYMENT_METHOD_LABELS] ?? row.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No transactions" description="Posted fee payments, income, payroll, and expenses will appear here." />
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 font-medium text-navy">{value}</dd>
    </div>
  );
}
