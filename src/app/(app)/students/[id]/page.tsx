import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getStudentById } from "@/lib/queries";
import { formatDate, formatPKR, fullName, monthLabel, toDateInput } from "@/lib/utils";
import { Card, PageHeader, Select } from "@/components/ui";
import { FeeBadge, TypeBadge } from "@/components/badges";
import { EditStudentButton, RecordPaymentButton } from "@/components/forms";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";

export default async function StudentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("students.view");
  const { id } = await params;
  const query = await searchParams;
  const data = await getStudentById(id);
  if (!data) notFound();
  const { student, currentFee, totalPaid, totalOutstanding, month, year } = data;
  const yearFilter = Number(query.year) || 0;
  const feeHistory = yearFilter
    ? student.feeRecords.filter((record) => record.year === yearFilter)
    : student.feeRecords;
  const years = [...new Set(student.feeRecords.map((record) => record.year))].sort((a, b) => b - a);

  const classesRes = await db().from("Class").select("*, program:Program(*)").eq("status", "ACTIVE");
  if (classesRes.error) throw classesRes.error;
  const classOptions = (classesRes.data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    program: item.program.name,
    feeAmount: item.feeAmount,
  }));

  return (
    <div>
      <PageHeader
        title={fullName(student.firstName, student.lastName)}
        subtitle={`${student.class.name} — ${student.class.program.name} · ${student.registrationNo}`}
        actions={
          <>
            {can(user.role, "students.edit") ? (
              <EditStudentButton
                classes={classOptions}
                initial={{
                  id: student.id,
                  registrationNo: student.registrationNo,
                  firstName: student.firstName,
                  lastName: student.lastName,
                  fatherName: student.fatherName,
                  classId: student.classId,
                  dateOfAdmission: toDateInput(student.dateOfAdmission),
                  gender: student.gender,
                  contactNumber: student.contactNumber,
                  email: student.email,
                  address: student.address,
                  studentType: student.studentType,
                  feeAmount: student.feeAmount,
                  status: student.status,
                }}
              />
            ) : null}
            {can(user.role, "fees.record") && currentFee?.status !== "WAIVED" ? (
              <RecordPaymentButton
                students={[{ id: student.id, name: fullName(student.firstName, student.lastName), classId: student.classId, remaining: currentFee?.remainingAmount }]}
                presetStudentId={student.id}
              />
            ) : null}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Profile" className="lg:col-span-1">
          <dl className="space-y-3 text-sm">
            <Info label="Father's name" value={student.fatherName} />
            <Info label="Student type" value={<TypeBadge type={student.studentType} />} />
            <Info label="Monthly fee" value={formatPKR(student.feeAmount)} />
            <Info label="Current status" value={<FeeBadge status={currentFee?.status ?? "PENDING"} />} />
            <Info label="Contact" value={student.contactNumber} />
            <Info label="Email" value={student.email || "—"} />
            <Info label="Gender" value={student.gender} />
            <Info label="Admission" value={formatDate(student.dateOfAdmission)} />
            <Info label="Address" value={student.address} />
            <Info label="Class teacher" value={student.class.classTeacher ? fullName(student.class.classTeacher.firstName, student.class.classTeacher.lastName) : "Unassigned"} />
          </dl>
          <Link href={`/classes/${student.classId}`} className="mt-4 inline-block text-sm text-teal">
            Open class dashboard
          </Link>
        </Card>
        <div className="grid gap-4 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Mini label={`${monthLabel(month, year)} paid`} value={formatPKR(currentFee?.paidAmount ?? 0)} />
            <Mini label="Late fine" value={formatPKR(currentFee?.fineAmount ?? 0)} />
            <Mini label="Total paid" value={formatPKR(totalPaid)} />
            <Mini label="Total outstanding" value={formatPKR(totalOutstanding)} />
          </div>
          <Card title="Fee history">
            <form className="mb-4 flex flex-wrap gap-3">
              <Select name="year" defaultValue={yearFilter ? String(yearFilter) : ""}>
                <option value="">All academic / calendar years</option>
                {years.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </Select>
              <button className="h-10 rounded-xl bg-navy px-4 text-sm font-medium text-white">Filter</button>
            </form>
            {feeHistory.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Year</th>
                      <th>Expected</th>
                      <th>Fine</th>
                      <th>Paid</th>
                      <th>Remaining</th>
                      <th>Status</th>
                      <th>Payment date</th>
                      <th>Method</th>
                      <th>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeHistory.map((record) => {
                      const last = [...record.payments].sort((a, b) => String(b.paymentDate).localeCompare(String(a.paymentDate)))[0];
                      return (
                        <tr key={record.id}>
                          <td>{monthLabel(record.month, record.year).split(" ")[0]}</td>
                          <td>{record.year}</td>
                          <td>{formatPKR(record.expectedAmount)}</td>
                          <td>{(record.fineAmount ?? 0) > 0 ? formatPKR(record.fineAmount) : "—"}</td>
                          <td>{formatPKR(record.paidAmount)}</td>
                          <td>{formatPKR(record.remainingAmount)}</td>
                          <td><FeeBadge status={record.status} /></td>
                          <td>{last ? formatDate(last.paymentDate) : "—"}</td>
                          <td>{last ? PAYMENT_METHOD_LABELS[last.paymentMethod] : "—"}</td>
                          <td>{last?.referenceNumber || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No fee records for the selected year.</p>
            )}
          </Card>
          <Card title="Payment history">
            {student.payments.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Reference</th>
                      <th>Period</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {student.payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{formatDate(payment.paymentDate)}</td>
                        <td>{formatPKR(payment.amount)}</td>
                        <td>{PAYMENT_METHOD_LABELS[payment.paymentMethod]}</td>
                        <td>{payment.referenceNumber || "—"}</td>
                        <td>{monthLabel(payment.feeRecord.month, payment.feeRecord.year)}</td>
                        <td><FeeBadge status={payment.feeRecord.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No payments recorded for this student.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 font-medium text-navy">{value}</dd>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-navy">{value}</p>
    </div>
  );
}
