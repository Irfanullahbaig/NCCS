import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { periodFromParams } from "@/lib/period";
import { getReceivables } from "@/lib/receivables";
import { formatPKR } from "@/lib/utils";
import { Card, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { PeriodFilter } from "@/components/period-filter";

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission("fees.view");
  const params = await searchParams;
  // Opens on the whole year so every month owed so far is in view.
  const period = periodFromParams(params.period ? params : { ...params, period: "year" });
  const data = await getReceivables(period);

  return (
    <div>
      <PageHeader
        title="Receivables"
        subtitle="Expected fees for every enrolled student, from their fixed monthly fee. Paid amounts are already in Income; the rest is still receivable."
      />
      <PeriodFilter action="/finance/receivables" period={period} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Expected income"
          value={formatPKR(data.expected)}
          hint={`${data.enrolledStudents} enrolled students · ${period.label}`}
          tone="navy"
        />
        <StatCard
          label="Received (in Income)"
          value={formatPKR(data.received)}
          hint={`${data.rate}% of expected`}
          tone="teal"
          href="/finance/income?category=STUDENT_FEE"
        />
        <StatCard
          label="Receivables"
          value={formatPKR(data.receivable)}
          hint="Still to be collected"
          tone="rose"
        />
        <StatCard
          label="Students owing"
          value={data.studentsOwing.toLocaleString("en-PK")}
          hint="With a balance in this period"
          tone="gold"
        />
      </div>

      {data.months.length > 1 ? (
        <Card title="By month" subtitle="Expected, received and still receivable for each fee month" className="mt-6">
          <div className="table-wrap -mx-2">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Expected</th>
                  <th>Received</th>
                  <th>Receivable</th>
                  <th>Collected</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((row) => (
                  <tr key={row.key}>
                    <td className="font-medium text-navy">{row.label}</td>
                    <td>{formatPKR(row.expected)}</td>
                    <td>{formatPKR(row.received)}</td>
                    <td className={row.receivable > 0 ? "font-semibold text-rose-700" : undefined}>{formatPKR(row.receivable)}</td>
                    <td>{row.expected > 0 ? `${Math.round((row.received / row.expected) * 100)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card title="By student" subtitle="Largest balances first" className="mt-6">
        {data.students.length ? (
          <div className="table-wrap -mx-2">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Monthly fee</th>
                  <th>Expected</th>
                  <th>Received</th>
                  <th>Receivable</th>
                  <th>Months due</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/students/${row.id}`} className="font-medium text-navy">{row.name}</Link>
                      {row.status !== "ACTIVE" ? (
                        <div className="text-xs text-slate-500">{row.status.toLowerCase().replaceAll("_", " ")}</div>
                      ) : null}
                    </td>
                    <td>{row.className}</td>
                    <td>{row.monthlyFee ? formatPKR(row.monthlyFee) : "Scholarship"}</td>
                    <td>{formatPKR(row.expected)}</td>
                    <td>{formatPKR(row.received)}</td>
                    <td className={row.receivable > 0 ? "font-semibold text-rose-700" : undefined}>{formatPKR(row.receivable)}</td>
                    <td title={row.dueLabels.join(", ")}>
                      {row.monthsDue ? row.dueLabels.length > 2 ? `${row.monthsDue} months` : row.dueLabels.join(", ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Nothing expected in this period" description="No enrolled students had a fee due in the months selected." />
        )}
      </Card>
    </div>
  );
}
