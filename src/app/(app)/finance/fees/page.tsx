import Link from "next/link";
import { AlertCircle, BadgePercent, Banknote, CircleDollarSign, Clock, Split, Users, Wallet } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { ensureCurrentMonthFees } from "@/lib/finance";
import { currentMonthYear, formatDate, formatPKR, fullName, monthLabel, MONTH_NAMES } from "@/lib/utils";
import { PageHeader, EmptyState, ViewOnlyBadge, StatCard, Select, Input } from "@/components/ui";
import { FeeBadge, TypeBadge } from "@/components/badges";
import { RecordPaymentButton } from "@/components/forms";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";

export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("fees.view");
  await ensureCurrentMonthFees();
  const params = await searchParams;
  const fallback = currentMonthYear();
  const month = Number(params.month) || fallback.month;
  const year = Number(params.year) || fallback.year;
  const recordsRes = await db()
    .from("FeeRecord")
    .select("*, student:Student(*, class:Class(*, program:Program(*))), payments:FeePayment(*)")
    .eq("month", month)
    .eq("year", year)
    .order("remainingAmount", { ascending: false });
  if (recordsRes.error) throw recordsRes.error;
  const records = (recordsRes.data ?? []).map((record) => ({
    ...record,
    payments: (record.payments ?? [])
      .filter((payment) => !payment.voidedAt)
      .sort((a, b) => String(b.paymentDate).localeCompare(String(a.paymentDate))),
  }));

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

  const payable = records.reduce((sum, record) => sum + record.expectedAmount + (record.fineAmount ?? 0), 0);
  const paid = records.reduce((sum, record) => sum + record.paidAmount, 0);
  const waived = records.reduce((sum, record) => sum + record.waivedAmount, 0);
  const outstanding = records.reduce((sum, record) => sum + record.remainingAmount, 0);
  const fines = records.reduce((sum, record) => sum + (record.fineAmount ?? 0), 0);
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
        subtitle={`Fee month ${monthLabel(month, year)}. Unpaid fees after the 10th add a Rs. 200 late fine.`}
        actions={can(user.role, "fees.record") ? <RecordPaymentButton students={students} /> : <ViewOnlyBadge />}
      />
      <form className="mb-4 grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:grid-cols-4">
        <Select name="month" defaultValue={String(month)}>
          {MONTH_NAMES.map((label, index) => (
            <option key={label} value={index + 1}>{label}</option>
          ))}
        </Select>
        <Input type="number" name="year" min="2000" defaultValue={year} />
        <button className="h-10 rounded-xl bg-navy text-sm font-medium text-white">Apply</button>
      </form>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students" value={records.length} hint={monthLabel(month, year)} icon={<Users className="h-5 w-5" />} tone="navy" />
        <StatCard label="Payable" value={formatPKR(payable)} hint="Total expected fees" icon={<CircleDollarSign className="h-5 w-5" />} />
        <StatCard label="Paid" value={formatPKR(paid)} hint={`${collectedShare}% of payable`} icon={<Banknote className="h-5 w-5" />} tone="teal" />
        <StatCard label="Outstanding" value={formatPKR(outstanding)} hint="Remaining to collect" icon={<AlertCircle className="h-5 w-5" />} tone="rose" />
        <StatCard label="Late fines" value={formatPKR(fines)} hint="Rs. 200 after the 10th" icon={<Clock className="h-5 w-5" />} tone="gold" />
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
                  <th>Fine</th>
                  <th>Paid</th>
                  <th>Remaining</th>
                  <th>Last payment</th>
                  <th>Receipt</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const last = record.payments[0];
                  return (
                    <tr key={record.id}>
                      <td>
                        <Link href={`/students/${record.student.id}`} className="font-medium text-navy">
                          {fullName(record.student.firstName, record.student.lastName)}
                        </Link>
                        <div className="text-xs text-slate-500">{record.student.registrationNo}</div>
                      </td>
                      <td>{record.student.class.name} — {record.student.class.program.name}</td>
                      <td><TypeBadge type={record.student.studentType} /></td>
                      <td>{formatPKR(record.expectedAmount)}</td>
                      <td>{(record.fineAmount ?? 0) > 0 ? formatPKR(record.fineAmount) : "—"}</td>
                      <td>{formatPKR(record.paidAmount)}</td>
                      <td>{formatPKR(record.remainingAmount)}</td>
                      <td>{last ? `${formatDate(last.paymentDate)} · ${PAYMENT_METHOD_LABELS[last.paymentMethod]}` : "—"}</td>
                      <td>{last?.referenceNumber || last?.id.slice(0, 8) || "—"}</td>
                      <td><FeeBadge status={record.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No fee records" description="Add students or choose another month. Monthly fee records are generated for the current period automatically." />
        )}
      </div>
    </div>
  );
}
