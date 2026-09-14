import Link from "next/link";
import { AlertCircle, BadgePercent, Banknote, CircleDollarSign, Clock, Split, Users, Wallet } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { ensureCurrentMonthFees } from "@/lib/finance";
import { currentMonthYear, formatPKR, fullName, monthLabel } from "@/lib/utils";
import { PageHeader, EmptyState, ViewOnlyBadge, StatCard } from "@/components/ui";
import { FeeBadge, TypeBadge } from "@/components/badges";
import { RecordPaymentButton } from "@/components/forms";

export default async function FeesPage() {
  const user = await requirePermission("fees.view");
  await ensureCurrentMonthFees();
  const { month, year } = currentMonthYear();
  const records = await prisma.feeRecord.findMany({
    where: { month, year },
    include: { student: { include: { class: { include: { program: true } } } } },
    orderBy: { remainingAmount: "desc" },
  });

  const students = records
    .filter((record) => record.status !== "WAIVED" && record.remainingAmount > 0)
    .map((record) => ({
      id: record.student.id,
      name: fullName(record.student.firstName, record.student.lastName),
      classId: record.student.classId,
      remaining: record.remainingAmount,
      fatherName: record.student.fatherName,
      registrationNo: record.student.registrationNo,
      classLabel: `${record.student.class.name} ${record.student.class.program.name}`,
    }));

  const payable = records.reduce((sum, record) => sum + record.expectedAmount, 0);
  const paid = records.reduce((sum, record) => sum + record.paidAmount, 0);
  const waived = records.reduce((sum, record) => sum + record.waivedAmount, 0);
  const outstanding = records.reduce((sum, record) => sum + record.remainingAmount, 0);
  const collectedShare = payable > 0 ? Math.round((paid / payable) * 100) : 0;
  const statusCounts = {
    paid: records.filter((record) => record.status === "PAID").length,
    partial: records.filter((record) => record.status === "PARTIALLY_PAID").length,
    pending: records.filter((record) => record.status === "PENDING").length,
    overdue: records.filter((record) => record.status === "OVERDUE").length,
    waived: records.filter((record) => record.status === "WAIVED").length,
  };

  return (
    <div>
      <PageHeader
        title="Student fees"
        subtitle={`Current period ${monthLabel(month, year)}. Status is derived from expected amount, payments, and waivers.`}
        actions={can(user.role, "fees.record") ? <RecordPaymentButton students={students} /> : <ViewOnlyBadge />}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students" value={records.length} hint={monthLabel(month, year)} icon={<Users className="h-5 w-5" />} tone="navy" />
        <StatCard label="Payable" value={formatPKR(payable)} hint="Total expected fees" icon={<CircleDollarSign className="h-5 w-5" />} />
        <StatCard label="Paid" value={formatPKR(paid)} hint={`${collectedShare}% of payable`} icon={<Banknote className="h-5 w-5" />} tone="teal" />
        <StatCard label="Outstanding" value={formatPKR(outstanding)} hint="Remaining to collect" icon={<AlertCircle className="h-5 w-5" />} tone="rose" />
        <StatCard label="Waived" value={formatPKR(waived)} hint={`${statusCounts.waived} scholarship / waived`} icon={<BadgePercent className="h-5 w-5" />} tone="sky" />
        <StatCard label="Fully paid" value={statusCounts.paid} hint="Students" icon={<Wallet className="h-5 w-5" />} tone="teal" />
        <StatCard label="Partially paid" value={statusCounts.partial} hint="Students" icon={<Split className="h-5 w-5" />} tone="gold" />
        <StatCard label="Pending / overdue" value={statusCounts.pending + statusCounts.overdue} hint={`${statusCounts.overdue} overdue`} icon={<Clock className="h-5 w-5" />} tone="rose" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {records.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Type</th>
                  <th>Expected</th>
                  <th>Paid</th>
                  <th>Waived</th>
                  <th>Remaining</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <Link href={`/students/${record.student.id}`} className="font-medium text-navy">
                        {fullName(record.student.firstName, record.student.lastName)}
                      </Link>
                    </td>
                    <td>{record.student.class.name} — {record.student.class.program.name}</td>
                    <td><TypeBadge type={record.student.studentType} /></td>
                    <td>{formatPKR(record.expectedAmount)}</td>
                    <td>{formatPKR(record.paidAmount)}</td>
                    <td>{formatPKR(record.waivedAmount)}</td>
                    <td>{formatPKR(record.remainingAmount)}</td>
                    <td><FeeBadge status={record.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No fee records" description="Add students to generate monthly fee records automatically." />
        )}
      </div>
    </div>
  );
}
