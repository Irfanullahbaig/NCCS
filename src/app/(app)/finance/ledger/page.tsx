import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { ImportButton } from "@/components/import-dialog";
import { importTypesFor } from "@/lib/import/specs";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getRecordHistory } from "@/lib/record-history";
import { getLedgerEntries } from "@/lib/ledger";
import { periodFromParams } from "@/lib/period";
import { formatDate, formatDateTime, formatPKR, fullName } from "@/lib/utils";
import { Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { PeriodFilter } from "@/components/period-filter";
import { DeleteRecordButton, EditExpenseButton, EditIncomeButton } from "@/components/finance-records";
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
  const user = await requirePermission("finance.view");
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
  const manage = selected ? await loadManage(selected.direction, selected.id) : null;
  const canEdit = can(user.role, "finance.edit");
  const canDelete = can(user.role, "finance.void");

  return (
    <div>
      <PageHeader
        title="Transactions / Ledger"
        subtitle={`Every posted income and expense for ${period.label}, with the person and period it belongs to.`}
        actions={
          importTypesFor(user.role, ["transactions", "fees", "income", "expenses"]).length ? (
            <ImportButton types={importTypesFor(user.role, ["transactions", "fees", "income", "expenses"])} label="Import" />
          ) : null
        }
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
          {manage ? (
            <>
              {(canEdit || canDelete) && !manage.voided ? (
                <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  {canEdit && manage.income ? <EditIncomeButton income={manage.income} students={manage.students} classes={manage.classes} /> : null}
                  {canEdit && manage.expense ? <EditExpenseButton expense={manage.expense} /> : null}
                  {canDelete ? (
                    <DeleteRecordButton
                      kind={manage.income ? "income" : "expense"}
                      id={selected.id}
                      label={`${selected.transactionId} · ${formatPKR(Math.abs(selected.signedAmount))}`}
                      linkedFee={Boolean(manage.income?.feePayment)}
                    />
                  ) : null}
                </div>
              ) : null}
              <div className="mt-5 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-semibold text-navy">History</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Created by {manage.history.createdBy} on {formatDateTime(manage.history.createdAt)}
                  {manage.history.editedBy ? ` · last edited by ${manage.history.editedBy} on ${formatDateTime(manage.history.editedAt!)}` : ""}
                </p>
                {manage.history.entries.length ? (
                  <ul className="mt-3 space-y-2">
                    {manage.history.entries.map((entry) => (
                      <li key={entry.id} className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
                        <span className="font-semibold capitalize text-navy">{entry.action}</span> by {entry.user} · {formatDateTime(entry.at)}
                        {entry.reason ? <div className="mt-1">Reason: {entry.reason}</div> : null}
                        {entry.changes.length ? (
                          <ul className="mt-1 space-y-0.5">
                            {entry.changes.map((change) => (
                              <li key={change.field}>
                                {change.field}: <span className="line-through">{change.from}</span> → <span className="font-medium text-navy">{change.to}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </>
          ) : null}
        </Card>
      ) : null}
      <div className="overflow-hidden rounded-3xl bg-white shadow-card">
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

/** Full record, edit form data and history for the selected ledger entry. */
async function loadManage(direction: string, id: string) {
  if (direction === "income") {
    const [incomeRes, studentsRes, classesRes] = await Promise.all([
      db().from("IncomeTransaction").select("*, feePayment:FeePayment(id, studentId, feeRecord:FeeRecord(month, year))").eq("id", id).maybeSingle(),
      db().from("Student").select("id, firstName, lastName, fatherName, registrationNo, classId, class:Class(name, program:Program(name))").is("deletedAt", null).order("firstName", { ascending: true }),
      db().from("Class").select("*, program:Program(*)").order("name", { ascending: true }),
    ]);
    for (const result of [incomeRes, studentsRes, classesRes]) if (result.error) throw result.error;
    const row = incomeRes.data;
    if (!row) return null;
    const feePayment = Array.isArray(row.feePayment) ? row.feePayment[0] : row.feePayment;
    return {
      voided: Boolean(row.voidedAt),
      history: await getRecordHistory({ entityIds: [row.id, feePayment?.id ?? ""], ...row }),
      expense: null,
      income: {
        id: row.id,
        incomeId: row.incomeId,
        date: row.date,
        amount: row.amount,
        category: row.category,
        source: row.source,
        studentId: row.studentId,
        classId: row.classId,
        paymentMethod: row.paymentMethod,
        referenceNumber: row.referenceNumber,
        notes: row.notes,
        feePayment: feePayment?.feeRecord
          ? { id: feePayment.id, studentId: feePayment.studentId, month: feePayment.feeRecord.month, year: feePayment.feeRecord.year }
          : null,
      },
      students: (studentsRes.data ?? []).map((student) => ({
        id: student.id,
        name: fullName(student.firstName, student.lastName),
        classId: student.classId,
        fatherName: student.fatherName,
        registrationNo: student.registrationNo,
        classLabel: student.class ? `${student.class.name} ${student.class.program?.name ?? ""}` : "",
      })),
      classes: (classesRes.data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        program: item.program.name,
        feeAmount: item.feeAmount,
      })),
    };
  }
  const expenseRes = await db().from("ExpenseTransaction").select("*, salaryPayment:SalaryPayment(id)").eq("id", id).maybeSingle();
  if (expenseRes.error) throw expenseRes.error;
  const row = expenseRes.data;
  if (!row) return null;
  const salary = Array.isArray(row.salaryPayment) ? row.salaryPayment[0] : row.salaryPayment;
  return {
    voided: Boolean(row.voidedAt),
    history: await getRecordHistory({ entityIds: [row.id, salary?.id ?? ""], ...row }),
    income: null,
    students: [],
    classes: [],
    expense: {
      id: row.id,
      expenseId: row.expenseId,
      date: row.date,
      amount: row.amount,
      category: row.category,
      paidTo: row.paidTo,
      paymentMethod: row.paymentMethod,
      referenceNumber: row.referenceNumber,
      description: row.description,
      notes: row.notes,
      salary: Boolean(salary),
    },
  };
}
