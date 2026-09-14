import Link from "next/link";
import { AlertCircle, Banknote, CircleDollarSign, Users } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { ensureCurrentMonthSalaries } from "@/lib/salary";
import { currentMonthYear, formatPKR, fullName, monthLabel } from "@/lib/utils";
import { PageHeader, EmptyState, ViewOnlyBadge, StatCard } from "@/components/ui";
import { FeeBadge } from "@/components/badges";
import { RecordSalaryButton } from "@/components/forms";

export default async function SalariesPage() {
  const user = await requirePermission("salaries.view");
  await ensureCurrentMonthSalaries(user.id);
  const { month, year } = currentMonthYear();
  const records = await prisma.salaryRecord.findMany({
    where: { month, year },
    include: {
      staff: true,
      payments: { where: { voidedAt: null }, orderBy: { paymentDate: "desc" } },
    },
    orderBy: { remainingAmount: "desc" },
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

  return (
    <div>
      <PageHeader
        title="Teacher salaries"
        subtitle={`Assigned monthly salary versus amount paid for ${monthLabel(month, year)}.`}
        actions={can(user.role, "salaries.record") ? <RecordSalaryButton teachers={teachers} defaultMonth={month} defaultYear={year} /> : <ViewOnlyBadge />}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Teachers" value={records.length} hint={monthLabel(month, year)} icon={<Users className="h-5 w-5" />} tone="navy" />
        <StatCard label="Payable" value={formatPKR(payable)} hint="Assigned salaries" icon={<CircleDollarSign className="h-5 w-5" />} />
        <StatCard label="Paid" value={formatPKR(paid)} hint="Amount paid this month" icon={<Banknote className="h-5 w-5" />} tone="teal" />
        <StatCard label="Remaining" value={formatPKR(outstanding)} hint="Still to pay" icon={<AlertCircle className="h-5 w-5" />} tone="rose" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {records.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Teacher</th>
                  <th>Assigned salary</th>
                  <th>Amount paid</th>
                  <th>Remaining</th>
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
                    <td>{formatPKR(record.expectedAmount)}</td>
                    <td>{formatPKR(record.paidAmount)}</td>
                    <td>{formatPKR(record.remainingAmount)}</td>
                    <td>{record.payments[0] ? record.payments[0].paymentDate.toLocaleDateString() : "—"}</td>
                    <td><FeeBadge status={record.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No salary records"
            description="Set a monthly salary on each teacher profile, then record payments here."
          />
        )}
      </div>
      {records.some((record) => record.payments.length) ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-navy">This month’s payments</h2>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Teacher</th>
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
                      <td>{fullName(record.staff.firstName, record.staff.lastName)}</td>
                      <td>{formatPKR(payment.amount)}</td>
                      <td>{payment.paymentDate.toLocaleDateString()}</td>
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
