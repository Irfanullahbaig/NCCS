import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getClassDashboard } from "@/lib/queries";
import { formatPKR, fullName, monthLabel } from "@/lib/utils";
import { Card, PageHeader, StatCard, EmptyState } from "@/components/ui";
import { FeeBadge, TypeBadge } from "@/components/badges";
import { RecordPaymentButton } from "@/components/forms";

export default async function ClassDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("classes.view");
  const { id } = await params;
  const data = await getClassDashboard(id);
  if (!data) notFound();
  const { schoolClass, rows, totals, month, year } = data;

  const paymentStudents = rows
    .filter((row) => row.status !== "WAIVED" && row.remaining > 0)
    .map((row) => ({
      id: row.student.id,
      name: fullName(row.student.firstName, row.student.lastName),
      classId: schoolClass.id,
      remaining: row.remaining,
      fatherName: row.student.fatherName,
      registrationNo: row.student.registrationNo,
      classLabel: `${schoolClass.name} ${schoolClass.program.name}`,
    }));

  return (
    <div>
      <PageHeader
        title={`${schoolClass.name} — ${schoolClass.program.name}`}
        subtitle={`${schoolClass.academicYear.name} · ${monthLabel(month, year)} · Class teacher: ${schoolClass.classTeacher ? fullName(schoolClass.classTeacher.firstName, schoolClass.classTeacher.lastName) : "Unassigned"}`}
        actions={can(user.role, "fees.record") && paymentStudents.length ? <RecordPaymentButton students={paymentStudents} /> : null}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total students" value={totals.students} />
        <StatCard label="Paid" value={totals.paid} tone="teal" />
        <StatCard label="Partially paid" value={totals.partial} tone="gold" />
        <StatCard label="Pending" value={totals.pending} tone="rose" />
        <StatCard label="Expected fees" value={formatPKR(totals.expected)} />
        <StatCard label="Collected" value={formatPKR(totals.collected)} tone="navy" />
        <StatCard label="Outstanding" value={formatPKR(totals.outstanding)} tone="rose" />
        <StatCard label="Waived" value={totals.waived} tone="sky" />
      </div>
      <Card title="Student fee tracking" className="mt-6">
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Student type</th>
                  <th>Fee</th>
                  <th>Paid</th>
                  <th>Remaining</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.student.id}>
                    <td>
                      <Link href={`/students/${row.student.id}`} className="font-medium text-navy">
                        {fullName(row.student.firstName, row.student.lastName)}
                      </Link>
                    </td>
                    <td><TypeBadge type={row.studentType} /></td>
                    <td>{formatPKR(row.fee)}</td>
                    <td>{formatPKR(row.paid)}</td>
                    <td>{formatPKR(row.remaining)}</td>
                    <td><FeeBadge status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No students in this class" description="Add students to this class to start tracking fees." />
        )}
      </Card>
    </div>
  );
}
