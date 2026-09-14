import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { formatPKR, fullName, currentMonthYear, toDateInput } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import { EMPLOYMENT_LABELS, GENDER_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { FeeBadge } from "@/components/badges";
import { EditSalaryPaymentButton, RecordSalaryButton, VoidSalaryButton } from "@/components/forms";

export default async function StaffProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("staff.view");
  const { id } = await params;
  const staff = await prisma.staff.findUnique({
    where: { id },
    include: {
      subjects: { include: { subject: true } },
      assignments: { include: { class: { include: { program: true } } } },
      classTeacherOf: { include: { program: true } },
      salaryRecords: {
        include: { payments: { where: { voidedAt: null }, orderBy: { paymentDate: "desc" } } },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      },
    },
  });
  if (!staff) notFound();

  const { month, year } = currentMonthYear();
  const currentRecord = staff.salaryRecords.find((record) => record.month === month && record.year === year);
  const teacherOption = [{
    id: staff.id,
    name: fullName(staff.firstName, staff.lastName),
    salaryAmount: staff.salaryAmount,
    remaining: currentRecord?.remainingAmount ?? staff.salaryAmount,
  }];
  const payments = staff.salaryRecords.flatMap((record) =>
    record.payments.map((payment) => ({ payment, record })),
  );

  return (
    <div>
      <PageHeader
        title={fullName(staff.firstName, staff.lastName)}
        subtitle={`${staff.staffId} · ${EMPLOYMENT_LABELS[staff.employmentStatus]}`}
        actions={
          can(user.role, "salaries.record") && staff.salaryAmount > 0 ? (
            <RecordSalaryButton
              teachers={teacherOption}
              defaultMonth={month}
              defaultYear={year}
              presetStaffId={staff.id}
              label="Record salary"
            />
          ) : null
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="HR details">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Item label="Qualification" value={staff.qualification} />
            <Item label="Joined" value={staff.dateOfJoining.toLocaleDateString()} />
            <Item label="Gender" value={GENDER_LABELS[staff.gender]} />
            <Item label="Contact" value={staff.contactNumber} />
            <Item label="Emergency" value={staff.emergencyContact || "—"} />
            <Item label="Email" value={staff.email || "—"} />
            <Item label="Monthly salary" value={formatPKR(staff.salaryAmount)} />
            <Item label="Address" value={staff.address} />
          </dl>
        </Card>
        <Card title="Assignments">
          <p className="text-sm text-slate-600">
            <strong>Subjects:</strong> {staff.subjects.map((row) => row.subject.name).join(", ") || "None"}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            <strong>Classes:</strong>{" "}
            {staff.assignments.map((row) => `${row.class.name} ${row.class.program.name}`).join(", ") || "None"}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            <strong>Class teacher of:</strong>{" "}
            {staff.classTeacherOf.map((row) => `${row.name} ${row.program.name}`).join(", ") || "None"}
          </p>
        </Card>
      </div>
      <Card title="Salary history" className="mt-4">
        {staff.salaryRecords.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Assigned salary</th>
                  <th>Amount paid</th>
                  <th>Remaining</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {staff.salaryRecords.map((record) => (
                  <tr key={record.id}>
                    <td>{new Date(record.year, record.month - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" })}</td>
                    <td>{formatPKR(record.expectedAmount)}</td>
                    <td>{formatPKR(record.paidAmount)}</td>
                    <td>{formatPKR(record.remainingAmount)}</td>
                    <td><FeeBadge status={record.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No salary payments recorded yet.</p>
        )}
      </Card>
      {payments.length ? (
        <Card title="Payment records" className="mt-4">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Paid</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {payments.map(({ payment, record }) => (
                  <tr key={payment.id}>
                    <td>{new Date(record.year, record.month - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" })}</td>
                    <td>{formatPKR(payment.amount)}</td>
                    <td>{payment.paymentDate.toLocaleDateString()}</td>
                    <td>{PAYMENT_METHOD_LABELS[payment.paymentMethod]}</td>
                    <td>{payment.referenceNumber || "—"}</td>
                    <td className="space-x-2">
                      {can(user.role, "salaries.record") ? (
                        <EditSalaryPaymentButton
                          teachers={teacherOption}
                          defaultMonth={record.month}
                          defaultYear={record.year}
                          initial={{
                            paymentId: payment.id,
                            staffId: staff.id,
                            amount: payment.amount,
                            paymentDate: toDateInput(payment.paymentDate),
                            paymentMethod: payment.paymentMethod,
                            referenceNumber: payment.referenceNumber,
                            notes: payment.notes,
                          }}
                        />
                      ) : null}
                      {can(user.role, "finance.void") ? <VoidSalaryButton id={payment.id} staffId={staff.id} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 font-medium text-navy">{value}</dd>
    </div>
  );
}
