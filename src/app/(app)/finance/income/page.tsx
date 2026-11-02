import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatDate, formatPKR, fullName } from "@/lib/utils";
import { PageHeader, EmptyState, Input, Select, ViewOnlyBadge } from "@/components/ui";
import { AddIncomeButton } from "@/components/forms";
import { DeleteRecordButton, EditIncomeButton } from "@/components/finance-records";
import { INCOME_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";

export default async function IncomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("finance.view");
  const params = await searchParams;

  let incomeQuery = db()
    .from("IncomeTransaction")
    .select("*, student:Student(*), class:Class(*, program:Program(*)), feePayment:FeePayment(id, studentId, feeRecord:FeeRecord(month, year))")
    .order("date", { ascending: false });
  if (params.includeVoided !== "1") incomeQuery = incomeQuery.is("voidedAt", null);
  if (params.category) incomeQuery = incomeQuery.eq("category", params.category as never);
  if (params.paymentMethod) incomeQuery = incomeQuery.eq("paymentMethod", params.paymentMethod as never);
  if (params.from) incomeQuery = incomeQuery.gte("date", new Date(params.from).toISOString());
  if (params.to) incomeQuery = incomeQuery.lte("date", new Date(params.to).toISOString());

  const [rowsRes, studentsRes, classesRes] = await Promise.all([
    incomeQuery,
    db()
      .from("Student")
      .select("*, class:Class(*, program:Program(*))")
      .is("deletedAt", null)
      .order("firstName", { ascending: true }),
    db().from("Class").select("*, program:Program(*)"),
  ]);
  if (rowsRes.error) throw rowsRes.error;
  if (studentsRes.error) throw studentsRes.error;
  if (classesRes.error) throw classesRes.error;

  const q = params.q?.trim().toLowerCase();
  const rows = (rowsRes.data ?? []).filter((row) => {
    if (!q) return true;
    const haystack = [
      row.incomeId,
      row.source,
      row.referenceNumber,
      row.student?.firstName,
      row.student?.lastName,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
  const students = studentsRes.data ?? [];
  const classes = classesRes.data ?? [];
  const studentOptions = students.map((student) => ({
    id: student.id,
    name: `${fullName(student.firstName, student.lastName)}`,
    classId: student.classId,
    fatherName: student.fatherName,
    registrationNo: student.registrationNo,
    classLabel: `${student.class.name} ${student.class.program.name}`,
  }));
  const classOptions = classes.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    program: item.program.name,
    feeAmount: item.feeAmount,
  }));
  const canEdit = can(user.role, "finance.edit");
  const canDelete = can(user.role, "finance.void");

  return (
    <div>
      <PageHeader
        title="Income"
        subtitle="Student fee income automatically updates the student fee record, class dashboard, and outstanding balance."
        actions={
          can(user.role, "finance.create") ? (
            <AddIncomeButton autoOpenOn="new" students={studentOptions} classes={classOptions} />
          ) : (
            <ViewOnlyBadge />
          )
        }
      />
      <form className="mb-4 grid gap-3 rounded-3xl bg-white p-4 shadow-card md:grid-cols-6">
        <Input name="q" defaultValue={params.q} placeholder="Transaction ID, student, source..." className="md:col-span-2" />
        <Input type="date" name="from" defaultValue={params.from} />
        <Input type="date" name="to" defaultValue={params.to} />
        <Select name="category" defaultValue={params.category ?? ""}>
          <option value="">All categories</option>
          {Object.entries(INCOME_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
        <Select name="paymentMethod" defaultValue={params.paymentMethod ?? ""}>
          <option value="">All methods</option>
          {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
        <button className="h-10 rounded-xl bg-navy text-sm font-medium text-white">Filter</button>
      </form>
      <div className="overflow-hidden rounded-3xl bg-white shadow-card">
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Income ID</th>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Student / source</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const feePayment = Array.isArray(row.feePayment) ? row.feePayment[0] : row.feePayment;
                  return (
                  <tr key={row.id} className={row.voidedAt ? "opacity-50" : ""}>
                    <td>
                      <Link href={`/finance/ledger?txn=${encodeURIComponent(row.incomeId)}`} className="font-medium text-navy">
                        {row.incomeId}
                      </Link>
                    </td>
                    <td>{formatDate(row.date)}</td>
                    <td>{INCOME_CATEGORY_LABELS[row.category]}</td>
                    <td>
                      {row.student ? (
                        <Link href={`/students/${row.student.id}`} className="text-navy">
                          {fullName(row.student.firstName, row.student.lastName)}
                        </Link>
                      ) : row.source || "—"}
                      {row.class ? <div className="text-xs text-slate-500">{row.class.name} {row.class.program.name}</div> : null}
                      <div className="text-xs text-slate-500">{row.source}</div>
                    </td>
                    <td>{PAYMENT_METHOD_LABELS[row.paymentMethod]}</td>
                    <td>{formatPKR(row.amount)}</td>
                    <td>
                      {row.voidedAt ? (
                        <span className="text-xs text-slate-500" title={row.voidReason ?? undefined}>Deleted</span>
                      ) : (
                        <div className="flex justify-end gap-1">
                          {canEdit ? (
                            <EditIncomeButton
                              students={studentOptions}
                              classes={classOptions}
                              income={{
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
                              }}
                            />
                          ) : null}
                          {canDelete ? (
                            <DeleteRecordButton kind="income" id={row.id} label={`${row.incomeId} · ${formatPKR(row.amount)}`} linkedFee={Boolean(feePayment)} />
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No income recorded" description="Add income or record a student fee payment to populate this ledger." />
        )}
      </div>
    </div>
  );
}
