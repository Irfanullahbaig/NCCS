import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { ensureCurrentMonthSalaries, isAdvancePayment } from "@/lib/salary";
import { periodFromParams } from "@/lib/period";
import { formatPKR, fullName } from "@/lib/utils";
import { EmptyState, PageHeader, StatCard, ViewOnlyBadge } from "@/components/ui";
import { PeriodFilter } from "@/components/period-filter";
import { RecordSalaryButton } from "@/components/forms";

export default async function AdvancesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("salaries.view");
  await ensureCurrentMonthSalaries(user.id);
  const params = await searchParams;
  const period = periodFromParams({ ...params, period: params.period ?? "month" });
  const month = period.month ?? new Date().getMonth() + 1;
  const year = period.year;
  const recordsRes = await db()
    .from("SalaryRecord")
    .select("*, staff:Staff(*), payments:SalaryPayment(*)")
    .eq("month", month)
    .eq("year", year);
  if (recordsRes.error) throw recordsRes.error;
  const records = (recordsRes.data ?? []).map((record) => {
    const payments = (record.payments ?? []).filter((payment) => !payment.voidedAt);
    const advances = payments.filter((payment) => isAdvancePayment(payment.notes));
    const advance = advances.reduce((sum, payment) => sum + payment.amount, 0);
    return { ...record, payments, advances, advance };
  });
  const teachers = records.map((record) => ({
    id: record.staff.id,
    name: fullName(record.staff.firstName, record.staff.lastName),
    salaryAmount: record.expectedAmount,
    remaining: record.remainingAmount,
  }));
  const totalAdvance = records.reduce((sum, record) => sum + record.advance, 0);

  return (
    <div>
      <PageHeader
        title="Advance salary"
        subtitle={`Advances reduce remaining net salary for ${period.label} and post as payroll expenses.`}
        actions={can(user.role, "salaries.record") ? (
          <RecordSalaryButton teachers={teachers} defaultMonth={month} defaultYear={year} label="Record advance" defaultKind="ADVANCE" />
        ) : <ViewOnlyBadge />}
      />
      <PeriodFilter action="/finance/advances" period={{ ...period, mode: "month", month }} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Advances this month" value={formatPKR(totalAdvance)} />
        <StatCard label="Employees with advances" value={records.filter((record) => record.advance > 0).length} />
        <StatCard label="Remaining payroll" value={formatPKR(records.reduce((sum, record) => sum + record.remainingAmount, 0))} tone="rose" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {records.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>ID</th>
                  <th>Salary</th>
                  <th>Advance</th>
                  <th>Paid (all)</th>
                  <th>Net remaining</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <Link href={`/staff/${record.staff.id}`} className="font-medium text-navy">
                        {fullName(record.staff.firstName, record.staff.lastName)}
                      </Link>
                    </td>
                    <td>{record.staff.staffId}</td>
                    <td>{formatPKR(record.expectedAmount)}</td>
                    <td>{formatPKR(record.advance)}</td>
                    <td>{formatPKR(record.paidAmount)}</td>
                    <td>{formatPKR(record.remainingAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No payroll records" description="Set monthly salaries on staff profiles first." />
        )}
      </div>
    </div>
  );
}
