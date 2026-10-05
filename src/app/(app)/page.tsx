import Link from "next/link";
import {
  Banknote,
  GraduationCap,
  Users,
  BookOpen,
  Wallet,
  AlertCircle,
} from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getDashboardData } from "@/lib/queries";
import { getPeriodFinance, getYearlyMonthTable } from "@/lib/ledger";
import { periodFromParams } from "@/lib/period";
import { formatDate, formatPKR, fullName, monthLabel } from "@/lib/utils";
import { Card, PageHeader, StatCard } from "@/components/ui";
import { PeriodFilter } from "@/components/period-filter";
import { FeeBadge, TypeBadge } from "@/components/badges";
import { FinanceCharts } from "@/components/charts";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("dashboard.view");
  const params = await searchParams;
  const period = periodFromParams(params);
  const showAnalytics = can(user.role, "finance.analytics");
  const [data, pnl, yearly] = await Promise.all([
    getDashboardData(),
    showAnalytics ? getPeriodFinance(period) : Promise.resolve(null),
    showAnalytics ? getYearlyMonthTable(period.year) : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={showAnalytics ? `School snapshot for ${period.label}.` : `School snapshot for ${monthLabel(data.month, data.year)}.`}
        actions={
          <div className="flex flex-wrap gap-2">
            {can(user.role, "students.view") ? <Link className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm" href="/students">Students</Link> : null}
            {can(user.role, "fees.record") ? <Link className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm" href="/finance/fees">Record fees</Link> : null}
            {can(user.role, "salaries.view") ? <Link className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm" href="/finance/salaries">Payroll</Link> : null}
            {can(user.role, "reports.view") ? <Link className="inline-flex h-10 items-center rounded-xl bg-navy px-3 text-sm font-medium text-white" href="/reports">Reports</Link> : null}
          </div>
        }
      />
      {showAnalytics ? <PeriodFilter action="/" period={period} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students" value={data.totalStudents} hint={`${data.scholarshipStudents} scholarship · ${data.needBasedStudents} need-based · ${data.selfFinancedStudents} self`} icon={<GraduationCap className="h-5 w-5" />} tone="navy" href="/students" />
        <StatCard label="Teachers / staff" value={data.totalStaff} icon={<Users className="h-5 w-5" />} tone="teal" href="/staff" />
        <StatCard label="Classes" value={data.totalClasses} icon={<BookOpen className="h-5 w-5" />} tone="sky" href="/classes" />
        <StatCard label="Pending fees" value={formatPKR(data.pendingFees)} icon={<AlertCircle className="h-5 w-5" />} tone="rose" href="/finance/outstanding" />
      </div>

      {showAnalytics && pnl ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <StatCard label="Fees collected" value={formatPKR(pnl.collected)} hint={period.label} href="/finance/fees" icon={<Banknote className="h-5 w-5" />} />
          <StatCard label="Income" value={formatPKR(pnl.totalIncome)} href="/finance" icon={<Wallet className="h-5 w-5" />} />
          <StatCard label={pnl.net >= 0 ? "Net profit" : "Net loss"} value={formatPKR(pnl.net)} href="/finance/profit-loss" icon={<Wallet className="h-5 w-5" />} tone={pnl.net >= 0 ? "teal" : "rose"} />
        </div>
      ) : null}

      {showAnalytics && pnl ? (
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          <Card title={`${period.year} trends`} className="xl:col-span-2" action={<Link href="/finance" className="text-sm text-teal">Finance</Link>}>
            <FinanceCharts
              compact
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
          </Card>
          <Card title="This period">
            <dl className="space-y-4 text-sm">
              <Row label="Income" value={formatPKR(pnl.totalIncome)} />
              <Row label="Expenses" value={formatPKR(pnl.totalExpenses)} />
              <Row label="Payroll" value={formatPKR(pnl.payroll + pnl.advances)} />
              <Row label="Outstanding fees" value={formatPKR(pnl.outstanding)} />
              <Row label="Net" value={formatPKR(pnl.net)} emphasis />
            </dl>
            <Link href="/finance/ledger" className="mt-6 inline-flex text-sm text-teal">Open ledger</Link>
          </Card>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card title="Pending student fees" action={<Link href="/finance/outstanding" className="text-sm text-teal">View all</Link>}>
          <div className="table-wrap">
            {data.pendingFeeRecords.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Type</th>
                    <th>Remaining</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pendingFeeRecords.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <Link href={`/students/${record.student?.id}`} className="font-medium text-navy">
                          {fullName(record.student?.firstName ?? "", record.student?.lastName ?? "")}
                        </Link>
                      </td>
                      <td><TypeBadge type={record.student?.studentType ?? "SELF"} /></td>
                      <td>{formatPKR(record.remainingAmount)}</td>
                      <td><FeeBadge status={record.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-500">No pending fees this month.</p>
            )}
          </div>
        </Card>
        <Card title="Recent fee payments" action={<Link href="/finance/fees" className="text-sm text-teal">View all</Link>}>
          <RecentTable
            empty="No payments recorded yet."
            rows={data.recentPayments.filter((payment) => payment.student).map((payment) => [
              fullName(payment.student.firstName, payment.student.lastName),
              `${payment.student.class?.name ?? ""} ${payment.student.class?.program?.name ?? ""}`.trim(),
              formatPKR(payment.amount),
              PAYMENT_METHOD_LABELS[payment.paymentMethod],
              formatDate(payment.paymentDate),
            ])}
            headers={["Student", "Class", "Amount", "Method", "Date"]}
          />
        </Card>
        <Card title="Recent students" action={<Link href="/students" className="text-sm text-teal">Students</Link>}>
          <RecentTable
            empty="No students added yet."
            headers={["Student", "Class", "Type", "Added"]}
            rows={data.recentStudents.map((student) => [
              fullName(student.firstName, student.lastName),
              `${student.class?.name ?? ""} ${student.class?.program?.name ?? ""}`.trim(),
              STUDENT_LABEL(student.studentType),
              formatDate(student.createdAt),
            ])}
          />
        </Card>
        <Card title="Recent staff" action={<Link href="/staff" className="text-sm text-teal">Staff</Link>}>
          <RecentTable
            empty="No staff added yet."
            headers={["Staff", "Qualification", "Status", "Added"]}
            rows={data.recentStaff.map((staff) => [
              fullName(staff.firstName, staff.lastName),
              staff.qualification,
              staff.employmentStatus.replace("_", " "),
              formatDate(staff.createdAt),
            ])}
          />
        </Card>
      </div>
    </div>
  );
}

function STUDENT_LABEL(type: string) {
  if (type === "SCHOLARSHIP") return "Scholarship";
  if (type === "NEED_BASED") return "Need-Based";
  return "Self";
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={emphasis ? "text-base font-semibold text-navy" : "font-medium text-navy"}>{value}</dd>
    </div>
  );
}

function RecentTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: Array<Array<string>>;
  empty: string;
}) {
  if (!rows.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
