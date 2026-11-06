import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { getProfitAndLoss, getYearlyMonthTable } from "@/lib/ledger";
import { isoRange, periodFromParams } from "@/lib/period";
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
  const range = isoRange(period);
  const ledgerHref = `/finance/ledger?from=${range.from}&to=${range.to}`;

  return (
    <div>
      <PageHeader
        title="Profit & Loss"
        subtitle={`Accrual basis for ${period.label}: student fee income is recorded when vouchers are issued, whether or not they are paid yet. From the accounting journal.`}
        actions={<Link href={ledgerHref} className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm">Open ledger</Link>}
      />
      <PeriodFilter action="/finance/profit-loss" period={period} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Accrued income" value={formatPKR(data.totalIncome)} hint={`${formatPKR(data.collected)} collected`} href={`${ledgerHref}&account=FEE_INCOME`} />
        <StatCard label="Total expenses" value={formatPKR(data.totalExpenses)} tone="rose" href={`${ledgerHref}&account=EXPENSES`} />
        <StatCard label="Payroll" value={formatPKR(data.payroll)} href={`${ledgerHref}&account=EXPENSES`} />
        <StatCard label="Accounts Receivable" value={formatPKR(data.outstanding)} hint={`At the end of ${period.label}`} tone="gold" href="/finance/receivables" />
        <StatCard label={data.net >= 0 ? "Net profit" : "Net loss"} value={formatPKR(data.net)} tone={data.net >= 0 ? "teal" : "rose"} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Income">
          <Rows
            items={[
              ["Student fee income (vouchers)", data.studentFees, `${ledgerHref}&account=FEE_INCOME`],
              ["Admission / registration", data.admissionFees, `${ledgerHref}&account=OTHER_INCOME`],
              ["Other income", data.otherIncome, `${ledgerHref}&account=OTHER_INCOME`],
            ]}
          />
        </Card>
        <Card title="Expenses">
          <Rows
            items={[
              ["Teacher / staff payroll", data.payroll, `${ledgerHref}&account=EXPENSES`],
              ["Advance salary", data.advances, `${ledgerHref}&account=EXPENSES`],
              ["Rent", data.rent, `${ledgerHref}&account=EXPENSES`],
              ["Utilities", data.utilities, `${ledgerHref}&account=EXPENSES`],
              ["Supplies", data.supplies, `${ledgerHref}&account=EXPENSES`],
              ["Maintenance", data.maintenance, `${ledgerHref}&account=EXPENSES`],
              ["Other expenses", data.otherExpenses, `${ledgerHref}&account=EXPENSES`],
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
                  <th>Accrued fee income</th>
                  <th>Collections</th>
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
                    <td>{formatPKR(row.collections)}</td>
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
                collections: row.collections,
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
