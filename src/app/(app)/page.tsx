import Link from "next/link";
import {
  Banknote,
  GraduationCap,
  Users,
  BookOpen,
  Wallet,
  AlertCircle,
  BadgePercent,
  HeartHandshake,
} from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getDashboardData } from "@/lib/queries";
import { formatPKR, fullName, monthLabel } from "@/lib/utils";
import { Card, PageHeader, StatCard } from "@/components/ui";
import { FeeBadge, TypeBadge } from "@/components/badges";
import { FinanceCharts } from "@/components/charts";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";

export default async function DashboardPage() {
  const user = await requirePermission("dashboard.view");
  const data = await getDashboardData();
  const showAnalytics = can(user.role, "finance.analytics");

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={
          showAnalytics
            ? `Live academic and finance overview for ${monthLabel(data.month, data.year)}.`
            : `Operational overview for ${monthLabel(data.month, data.year)}.`
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total students" value={data.totalStudents} icon={<GraduationCap className="h-5 w-5" />} tone="navy" />
        <StatCard label="Teachers / staff" value={data.totalStaff} icon={<Users className="h-5 w-5" />} tone="teal" />
        <StatCard label="Classes" value={data.totalClasses} icon={<BookOpen className="h-5 w-5" />} tone="sky" />
        <StatCard label="Pending fees" value={formatPKR(data.pendingFees)} icon={<AlertCircle className="h-5 w-5" />} tone="rose" />
        <StatCard label="Scholarship" value={data.scholarshipStudents} icon={<BadgePercent className="h-5 w-5" />} tone="sky" />
        <StatCard label="Need-based" value={data.needBasedStudents} icon={<HeartHandshake className="h-5 w-5" />} tone="gold" />
        <StatCard label="Self-financed" value={data.selfFinancedStudents} icon={<GraduationCap className="h-5 w-5" />} />
        {showAnalytics ? (
          <>
            <StatCard label="Fee collected" value={formatPKR(data.totalFeeCollected)} hint="Current month" icon={<Banknote className="h-5 w-5" />} />
            <StatCard label="Today's income" value={formatPKR(data.todayIncome)} icon={<Wallet className="h-5 w-5" />} />
            <StatCard label="Monthly income" value={formatPKR(data.monthlyIncome)} icon={<Wallet className="h-5 w-5" />} tone="navy" />
          </>
        ) : null}
      </div>

      {showAnalytics ? (
      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card title="Monthly income summary" className="xl:col-span-2">
          <FinanceCharts data={data.monthlySeries} />
        </Card>
        <Card title="Net position">
          <dl className="space-y-3 text-sm">
            <Row label="Total income" value={formatPKR(data.totalIncome)} />
            <Row label="Total expenses" value={formatPKR(data.totalExpenses)} />
            <Row label="Net balance" value={formatPKR(data.netBalance)} />
            <Row label="Expected fees" value={formatPKR(data.expectedFees)} />
            <Row label="This month expenses" value={formatPKR(data.monthlyExpenses)} />
          </dl>
        </Card>
      </div>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card title="Recent fee payments" action={<Link href="/finance/fees" className="text-sm text-teal">View all</Link>}>
          <RecentTable
            empty="No payments recorded yet."
            rows={data.recentPayments.map((payment) => [
              fullName(payment.student.firstName, payment.student.lastName),
              `${payment.student.class.name} ${payment.student.class.program.name}`,
              formatPKR(payment.amount),
              PAYMENT_METHOD_LABELS[payment.paymentMethod],
              payment.paymentDate.toLocaleDateString(),
            ])}
            headers={["Student", "Class", "Amount", "Method", "Date"]}
          />
        </Card>
        <Card title="Pending student fees" action={<Link href="/finance/outstanding" className="text-sm text-teal">Outstanding</Link>}>
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
                        <Link href={`/students/${record.student.id}`} className="font-medium text-navy">
                          {fullName(record.student.firstName, record.student.lastName)}
                        </Link>
                      </td>
                      <td><TypeBadge type={record.student.studentType} /></td>
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
        <Card title="Recent student registrations">
          <RecentTable
            empty="No students added yet."
            headers={["Student", "Class", "Type", "Added"]}
            rows={data.recentStudents.map((student) => [
              fullName(student.firstName, student.lastName),
              `${student.class.name} ${student.class.program.name}`,
              STUDENT_LABEL(student.studentType),
              student.createdAt.toLocaleDateString(),
            ])}
          />
        </Card>
        <Card title="Recent staff additions">
          <RecentTable
            empty="No staff added yet."
            headers={["Staff", "Qualification", "Status", "Added"]}
            rows={data.recentStaff.map((staff) => [
              fullName(staff.firstName, staff.lastName),
              staff.qualification,
              staff.employmentStatus.replace("_", " "),
              staff.createdAt.toLocaleDateString(),
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-navy">{value}</dd>
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
