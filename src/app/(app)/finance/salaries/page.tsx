import Link from "next/link";
import { AlertCircle, Banknote, CircleDollarSign, Users } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { ensureCurrentMonthSalaries, isAdvancePayment } from "@/lib/salary";
import { currentMonthYear, formatDate, formatPKR, fullName, monthLabel, MONTH_NAMES } from "@/lib/utils";
import { PageHeader, EmptyState, ViewOnlyBadge, StatCard, Select, Input } from "@/components/ui";
import { FeeBadge } from "@/components/badges";
import { RecordSalaryButton } from "@/components/forms";

export default async function SalariesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("salaries.view");
  await ensureCurrentMonthSalaries(user.id);
  const params = await searchParams;
  const fallback = currentMonthYear();
  const month = Number(params.month) || fallback.month;
  const year = Number(params.year) || fallback.year;
  const recordsRes = await db()
    .from("SalaryRecord")
    .select("*, staff:Staff(*), payments:SalaryPayment(*)")
    .eq("month", month)
    .eq("year", year)
    .order("remainingAmount", { ascending: false });
  if (recordsRes.error) throw recordsRes.error;
  const records = (recordsRes.data ?? []).map((record) => {
    const payments = (record.payments ?? [])
      .filter((payment) => !payment.voidedAt)
      .sort((a, b) => String(b.paymentDate).localeCompare(String(a.paymentDate)));
    const advance = payments.filter((payment) => isAdvancePayment(payment.notes)).reduce((sum, payment) => sum + payment.amount, 0);
    return { ...record, payments, advance, net: Math.max(0, record.expectedAmount - advance) };
  });

  const teachers = records.map((record) => ({
    id: record.staff.id,
    name: fullName(record.staff.firstName, record.staff.lastName),
    salaryAmount: record.expectedAmount,
    remaining: record.remainingAmount,
  }));

  const payable = records.reduce((sum, record) => sum + record.expectedAmount, 0);
  const paid = records.reduce((sum, record) => sum + record.paidAmount, 0);
  const outstanding = records.reduce((sum, record) => sum + record.remainingAmount, 0);
  const advances = records.reduce((sum, record) => sum + record.advance, 0);

  return (
    <div>
      <PageHeader
        title="Payroll"
        subtitle={`Assigned monthly salary versus amount paid for ${monthLabel(month, year)}. Enter a new current salary when recording payment if there is an increment or adjustment.`}
        actions={can(user.role, "salaries.record") ? (
          <>
            <RecordSalaryButton teachers={teachers} defaultMonth={month} defaultYear={year} defaultKind="ADVANCE" label="Record advance" />
            <RecordSalaryButton teachers={teachers} defaultMonth={month} defaultYear={year} />
          </>
        ) : <ViewOnlyBadge />}
      />
      <form className="mb-4 grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:grid-cols-4">
        <Select name="month" defaultValue={String(month)}>
          {MONTH_NAMES.map((label, index) => (
            <option key={label} value={index + 1}>{label}</option>
          ))}
        </Select>
        <Input type="number" name="year" min="2000" defaultValue={year} />
        <button className="h-10 rounded-xl bg-navy text-sm font-medium text-white">Apply</button>
      </form>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Employees" value={records.length} hint={monthLabel(month, year)} icon={<Users className="h-5 w-5" />} tone="navy" />
        <StatCard label="Payable" value={formatPKR(payable)} hint="Assigned salaries" icon={<CircleDollarSign className="h-5 w-5" />} />
        <StatCard label="Paid" value={formatPKR(paid)} hint={`Includes ${formatPKR(advances)} advances`} icon={<Banknote className="h-5 w-5" />} tone="teal" />
        <StatCard label="Remaining" value={formatPKR(outstanding)} hint="Still to pay" icon={<AlertCircle className="h-5 w-5" />} tone="rose" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {records.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th>Salary</th>
                  <th>Advance</th>
                  <th>Paid</th>
                  <th>Net remaining</th>
                  <th>Last payment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <Link href={`/staff/${record.staff.id}`} className="font-medium text-navy">
                        {fullName(record.staff.firstName, record.staff.lastName)}
                      </Link>
                      <div className="text-xs text-slate-500">{record.staff.staffId}</div>
                    </td>
                    <td>{record.staff.facultyType?.replaceAll("_", " ") || "Staff"}</td>
                    <td>{formatPKR(record.expectedAmount)}</td>
                    <td>{formatPKR(record.advance)}</td>
                    <td>{formatPKR(record.paidAmount)}</td>
                    <td>{formatPKR(record.remainingAmount)}</td>
                    <td>{record.payments[0] ? formatDate(record.payments[0].paymentDate) : "—"}</td>
                    <td><FeeBadge status={record.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No payroll records"
            description="Set a monthly salary on each teacher profile, then record payments here."
          />
        )}
      </div>
      {records.some((record) => record.payments.length) ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-navy">This period’s payments</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Kind</th>
                  <th>Paid</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {records.flatMap((record) =>
                  record.payments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <Link href={`/staff/${record.staff.id}`} className="text-navy">
                          {fullName(record.staff.firstName, record.staff.lastName)}
                        </Link>
                      </td>
                      <td>{isAdvancePayment(payment.notes) ? "Advance" : "Salary"}</td>
                      <td>{formatPKR(payment.amount)}</td>
                      <td>{formatDate(payment.paymentDate)}</td>
                      <td>{payment.paymentMethod.replace("_", " ")}</td>
                      <td>{payment.referenceNumber || "—"}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
