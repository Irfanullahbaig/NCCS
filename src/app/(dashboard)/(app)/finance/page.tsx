import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getProfitAndLoss, getYearlyMonthTable } from "@/lib/ledger";
import { ACCOUNTS, balanceOf, getJournal, getLedgerSummary, KIND_LABELS, type AccountCode } from "@/lib/accounting";
import { isoRange, periodFromParams } from "@/lib/period";
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
  const range = isoRange(period);
  const [data, yearly, summary, journal, studentsRes, classesRes] = await Promise.all([
    getProfitAndLoss(period),
    getYearlyMonthTable(period.year),
    getLedgerSummary(),
    getJournal({ from: range.from, to: range.to, limit: 12 }),
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
    category: item.category,
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

  const ledgerHref = `/finance/ledger?from=${range.from}&to=${range.to}`;
  const showAnalytics = can(user.role, "finance.analytics");
  const chartData = yearly.map((row) => ({
    label: row.label,
    income: row.income,
    expenses: row.expenses,
    fees: row.fees,
    collections: row.collections,
    payroll: row.payroll,
    outstanding: row.outstanding,
    net: row.net,
  }));
  const money = balanceOf(summary, "BANK") + balanceOf(summary, "CASH");

  return (
    <div>
      <PageHeader
        title="Finance overview"
        subtitle={`Accrual accounting for ${period.label}: income is recorded when fee vouchers are issued, and collections when money is received. Every figure comes from the journal.`}
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
      {!data.ready ? (
        <p className="mb-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
          The accounting journal is not set up in the database yet. Run the journal migrations and these figures will be built from every fee, payment, income and expense already recorded.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Accrued income" value={formatPKR(data.totalIncome)} hint={`${formatPKR(data.studentFees)} student fee income`} href={`${ledgerHref}&account=FEE_INCOME`} />
        <StatCard label="Collections" value={formatPKR(data.collected)} hint="Received from students" tone="teal" href={`${ledgerHref}&kind=FEE_PAYMENT`} />
        <StatCard label="Total expenses" value={formatPKR(data.totalExpenses)} tone="rose" href={`${ledgerHref}&account=EXPENSES`} />
        <StatCard label="Accounts Receivable" value={formatPKR(data.outstanding)} hint={`At the end of ${period.label}`} tone="gold" href="/finance/receivables" />
        {showAnalytics ? (
          <StatCard label={data.net >= 0 ? "Net profit" : "Net loss"} value={formatPKR(data.net)} tone={data.net >= 0 ? "teal" : "rose"} href="/finance/profit-loss" />
        ) : (
          <StatCard label="Bank + cash" value={formatPKR(money)} href="/finance/accounts" />
        )}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Fee vouchers" value={data.vouchers} hint={`${data.studentsPaid} paid · ${data.studentsPartial} partly paid · ${data.studentsOutstanding} open`} href="/finance/receivables" />
        <StatCard label="Bank + cash today" value={formatPKR(money)} hint={`${formatPKR(balanceOf(summary, "BANK"))} bank · ${formatPKR(balanceOf(summary, "CASH"))} cash`} href="/finance/accounts" />
        <StatCard label="Payroll" value={formatPKR(data.payroll)} href={`${ledgerHref}&account=EXPENSES`} />
        <StatCard label="Advance salaries" value={formatPKR(data.advances)} href={`${ledgerHref}&account=EXPENSES`} />
      </div>
      <Card title={`${period.year} trends`} subtitle="From the journal" className="mt-6">
        <FinanceCharts data={chartData} />
      </Card>
      <Card title="Recent journal entries" className="mt-6" action={<Link href={ledgerHref} className="text-sm text-teal">Open ledger</Link>}>
        {journal.ready && journal.rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Entry</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Debit</th>
                  <th>Credit</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {journal.rows.map((row) => (
                  <tr key={row.id}>
                    <td><Link href={`/finance/ledger/${row.entryNo}`} className="text-teal">JE-{String(row.entryNo).padStart(5, "0")}</Link></td>
                    <td>{formatDate(row.date)}</td>
                    <td>
                      <div className="font-medium text-navy">{KIND_LABELS[row.kind as keyof typeof KIND_LABELS] ?? row.kind}{row.studentName ? ` · ${row.studentName}` : ""}</div>
                      <div className="text-xs text-slate-500">{row.memo}</div>
                    </td>
                    <td>{ACCOUNTS[row.debitAccount as AccountCode]?.label ?? row.debitAccount}</td>
                    <td>{ACCOUNTS[row.creditAccount as AccountCode]?.label ?? row.creditAccount}</td>
                    <td className="text-right font-semibold text-navy">{formatPKR(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No journal entries in {period.label}.</p>
        )}
      </Card>
    </div>
  );
}
