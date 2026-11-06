import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getProfitAndLoss, getYearlyMonthTable } from "@/lib/ledger";
import { periodFromParams } from "@/lib/period";
import { formatPKR } from "@/lib/utils";
import { Card, PageHeader, StatCard } from "@/components/ui";
import { PeriodFilter } from "@/components/period-filter";
import { FinanceCharts } from "@/components/charts";

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("finance.analytics");
  const params = await searchParams;
  const period = periodFromParams(params);
  const [data, yearly] = await Promise.all([
    getProfitAndLoss(period),
    getYearlyMonthTable(period.year),
  ]);
  const query = new URLSearchParams({ period: period.mode, year: String(period.year) });
  if (period.month) query.set("month", String(period.month));
  const ledgerHref = `/finance/ledger?${query.toString()}`;

  return (
    <div>
      <PageHeader
        title="Profit & Loss"
        subtitle={`Calculated only from posted payments and expenses for ${period.label}. Outstanding fees are not income.`}
        actions={<Link href={ledgerHref} className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm">Open ledger</Link>}
      />
      <PeriodFilter action="/finance/profit-loss" period={period} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total income" value={formatPKR(data.totalIncome)} href={`${ledgerHref}&type=income`} />
        <StatCard label="Total expenses" value={formatPKR(data.totalExpenses)} tone="rose" href={`${ledgerHref}&type=expense`} />
        <StatCard label="Payroll" value={formatPKR(data.payroll)} href={`${ledgerHref}&type=SALARIES`} />
        <StatCard label="Outstanding fees" value={formatPKR(data.outstanding)} tone="gold" href="/finance/outstanding" />
        <StatCard label={data.net >= 0 ? "Net profit" : "Net loss"} value={formatPKR(data.net)} tone={data.net >= 0 ? "teal" : "rose"} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Income">
          <Rows
            items={[
              ["Student fees", data.studentFees, `${ledgerHref}&type=STUDENT_FEE`],
              ["Admission / registration", data.admissionFees, `${ledgerHref}&type=ADMISSION_FEE`],
              ["Other income", data.otherIncome, `${ledgerHref}&type=income`],
            ]}
          />
        </Card>
        <Card title="Expenses">
          <Rows
            items={[
              ["Teacher / staff payroll", data.payroll, `${ledgerHref}&type=SALARIES`],
              ["Advance salary", data.advances, `${ledgerHref}&type=ADVANCE_SALARY`],
              ["Rent", data.rent, ledgerHref],
              ["Utilities", data.utilities, ledgerHref],
              ["Supplies", data.supplies, ledgerHref],
              ["Maintenance", data.maintenance, ledgerHref],
              ["Other expenses", data.otherExpenses, `${ledgerHref}&type=expense`],
            ]}
          />
        </Card>
      </div>
      {yearly.length ? (
        <Card title={`${period.year} monthly profit & loss`} className="mt-6">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Fee income</th>
                  <th>Payroll</th>
                  <th>Total expenses</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {yearly.map((row) => (
                  <tr key={row.month}>
                    <td>
                      <Link href={`/finance/profit-loss?period=month&month=${row.month}&year=${period.year}`} className="text-teal">
                        {row.label}
                      </Link>
                    </td>
                    <td>{formatPKR(row.fees)}</td>
                    <td>{formatPKR(row.payroll)}</td>
                    <td>{formatPKR(row.expenses)}</td>
                    <td>{formatPKR(row.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6">
            <FinanceCharts
              data={yearly.map((row) => ({
                label: row.label,
                income: row.income,
                expenses: row.expenses,
                fees: row.fees,
                payroll: row.payroll,
                outstanding: row.outstanding,
                net: row.net,
              }))}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Rows({ items }: { items: Array<[string, number, string]> }) {
  return (
    <dl className="space-y-2 text-sm">
      {items.map(([label, value, href]) => (
        <div key={label} className="flex items-center justify-between gap-3">
          <Link href={href} className="text-slate-600 hover:text-teal">{label}</Link>
          <span className="font-medium text-navy">{formatPKR(value)}</span>
        </div>
      ))}
    </dl>
  );
}
