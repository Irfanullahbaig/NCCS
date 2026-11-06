import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { ensureCurrentMonthFees } from "@/lib/finance";
import { currentMonthYear, formatDate, formatPKR, fullName, monthLabel } from "@/lib/utils";
import { PageHeader, EmptyState, ViewOnlyBadge } from "@/components/ui";
import { FeeBadge, TypeBadge } from "@/components/badges";
import { RecordPaymentButton } from "@/components/forms";
import { LateFeeCell } from "@/components/late-fee";
import { AdjustFeeButton } from "@/components/finance-records";

export default async function OutstandingPage() {
  const user = await requirePermission("fees.view");
  await ensureCurrentMonthFees();
  const { month, year } = currentMonthYear();
  const recordsRes = await db()
    .from("FeeRecord")
    .select("*, student:Student(*, class:Class(*, program:Program(*)))")
    .eq("month", month)
    .eq("year", year)
    .in("status", ["PENDING", "PARTIALLY_PAID", "OVERDUE"])
    .order("remainingAmount", { ascending: false });
  if (recordsRes.error) throw recordsRes.error;
  const records = recordsRes.data ?? [];

  const students = records.map((record) => ({
    id: record.student.id,
    name: fullName(record.student.firstName, record.student.lastName),
    classId: record.student.classId,
    remaining: record.remainingAmount,
    fatherName: record.student.fatherName,
    registrationNo: record.student.registrationNo,
    classLabel: `${record.student.class.name} ${record.student.class.program.name}`,
  }));

  return (
    <div>
      <PageHeader
        title="Outstanding fees"
        subtitle="Remaining balances after the 10th include a Rs. 200 late fine. Waived scholarship fees do not appear here."
        actions={
          can(user.role, "fees.record") && students.length ? (
            <RecordPaymentButton students={students} autoOpenOn="pay" />
          ) : !can(user.role, "fees.record") ? (
            <ViewOnlyBadge />
          ) : null
        }
      />
      <div className="overflow-hidden rounded-3xl bg-white shadow-card">
        {records.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Type</th>
                  <th>Remaining</th>
                  <th>Fine</th>
                  <th>Due</th>
                  <th>Status</th>
                  {can(user.role, "finance.edit") ? <th></th> : null}
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
                    <td>{formatPKR(record.remainingAmount)}</td>
                    <td>
                      <LateFeeCell
                        feeRecordId={record.id}
                        fine={record.fineAmount ?? 0}
                        fineWaived={record.fineWaived}
                        reason={record.fineWaiveReason}
                        label={`${fullName(record.student.firstName, record.student.lastName)}, ${monthLabel(record.month, record.year)}`}
                        canWaive={can(user.role, "fees.waive")}
                      />
                    </td>
                    <td>{formatDate(record.dueDate)}</td>
                    <td><FeeBadge status={record.status} /></td>
                    {can(user.role, "finance.edit") ? (
                      <td>
                        <AdjustFeeButton
                          studentId={record.student.id}
                          studentName={fullName(record.student.firstName, record.student.lastName)}
                          defaultMonth={record.month}
                          defaultYear={record.year}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No outstanding fees" description="All current-month balances are paid or waived." />
        )}
      </div>
    </div>
  );
}
