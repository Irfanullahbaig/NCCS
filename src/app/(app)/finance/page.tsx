import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getProfitAndLoss, getYearlyMonthTable } from "@/lib/ledger";
import { periodFromParams } from "@/lib/period";
import { formatDate, formatPKR, fullName } from "@/lib/utils";
import { Card, PageHeader, StatCard, ViewOnlyBadge } from "@/components/ui";
import { FinanceCharts } from "@/components/charts";
import { AddExpenseButton, AddIncomeButton } from "@/components/forms";
import { PeriodFilter } from "@/components/period-filter";

export default async function FinanceDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("finance.view");
  const params = await searchParams;
  const period = periodFromParams(params);
  const [data, yearly, studentsRes, classesRes] = await Promise.all([
    getProfitAndLoss(period),
    getYearlyMonthTable(period.year),
    db()
      .from("Student")
      .select("id, firstName, lastName, fatherName, registrationNo, classId, class:Class(id, name, feeAmount, program:Program(name))")
      .is("deletedAt", null)
      .eq("status", "ACTIVE")
      .order("firstName", { ascending: true }),
    db().from("Class").select("*, program:Program(*)").order("name", { ascending: true }),
  ]);
  if (studentsRes.error) throw studentsRes.error;
  if (classesRes.error) throw classesRes.error;

  const classOptions = (classesRes.data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    program: item.program.name,
    feeAmount: item.feeAmount,
  }));
  const studentOptions = (studentsRes.data ?? []).map((student) => ({
    id: student.id,
    name: fullName(student.firstName, student.lastName),
    classId: student.classId,
    fatherName: student.fatherName,
    registrationNo: student.registrationNo,
    classLabel: `${student.class.name} ${student.class.program.name}`,
  }));

  const query = new URLSearchParams({ period: period.mode, year: String(period.year) });
  if (period.month) query.set("month", String(period.month));
  const ledgerHref = `/finance/ledger?${query.toString()}`;
  const showAnalytics = can(user.role, "finance.analytics");
  const chartData = yearly.map((row) => ({
    label: row.label,
    income: row.income,
    expenses: row.expenses,
    fees: row.fees,
    payroll: row.payroll,
    outstanding: row.outstanding,
    net: row.net,
  }));

  return (
    <div>
      <PageHeader
        title="Finance overview"
        subtitle={`Posted transactions for ${period.label}. Outstanding fees are not counted as income.`}
        actions={
          can(user.role, "finance.create") ? (
            <>
              <Link href="/reports" className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm">Reports</Link>
              <AddExpenseButton />
              <AddIncomeButton students={studentOptions} classes={classOptions} />
            </>
          ) : (
            <ViewOnlyBadge />
          )
        }
      />
      <PeriodFilter action="/finance" period={period} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total income" value={formatPKR(data.totalIncome)} href={`${ledgerHref}&type=income`} />
        <StatCard label="Total expenses" value={formatPKR(data.totalExpenses)} tone="rose" href={`${ledgerHref}&type=expense`} />
        <StatCard label="Payroll" value={formatPKR(data.payroll + data.advances)} href={`${ledgerHref}&type=SALARIES`} />
        <StatCard label="Outstanding fees" value={formatPKR(data.outstanding)} tone="gold" href="/finance/outstanding" />
        {showAnalytics ? (
          <StatCard label={data.net >= 0 ? "Net profit" : "Net loss"} value={formatPKR(data.net)} tone={data.net >= 0 ? "teal" : "rose"} href="/finance/profit-loss" />
        ) : (
          <StatCard label="Fees collected" value={formatPKR(data.studentFees)} href={`${ledgerHref}&type=STUDENT_FEE`} />
        )}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Fees billed" value={formatPKR(data.billed)} hint={`${data.studentsPaid} paid · ${data.studentsPartial} partial`} />
        <StatCard label="Fees collected" value={formatPKR(data.collected)} href={`${ledgerHref}&type=STUDENT_FEE`} />
        <StatCard label="Advance salaries" value={formatPKR(data.advances)} href={`${ledgerHref}&type=ADVANCE_SALARY`} />
        <StatCard label="Students with outstanding" value={data.studentsOutstanding} href="/finance/outstanding" tone="rose" />
      </div>
      <Card title={`${period.year} trends`} className="mt-6">
        <FinanceCharts data={chartData} />
      </Card>
      <Card title="Recent transactions" className="mt-6" action={<Link href={ledgerHref} className="text-sm text-teal">Open ledger</Link>}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Source</th>
                <th>Person</th>
                <th>Program</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.slice(0, 12).map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.date)}</td>
                  <td>
                    <Link href={`${ledgerHref}&txn=${row.transactionId}`} className="text-teal">
                      {row.type.replaceAll("_", " ")}
                    </Link>
                  </td>
                  <td>{row.source}</td>
                  <td>
                    {row.personHref ? <Link href={row.personHref} className="text-navy">{row.person}</Link> : row.person}
                  </td>
                  <td>{row.program || "—"}</td>
                  <td>{formatPKR(row.signedAmount)}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
