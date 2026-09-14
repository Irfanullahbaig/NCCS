import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { ensureCurrentMonthFees } from "@/lib/finance";
import { currentMonthYear, formatPKR, fullName } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import { STUDENT_TYPE_LABELS, INCOME_CATEGORY_LABELS, EXPENSE_CATEGORY_LABELS } from "@/lib/constants";

const REPORTS: Array<{ type: string; title: string; group: string; analytics?: boolean }> = [
  { type: "students", title: "Student list", group: "Student reports" },
  { type: "class-students", title: "Class-wise students", group: "Student reports" },
  { type: "scholarship", title: "Scholarship students", group: "Student reports" },
  { type: "need-based", title: "Need-based students", group: "Student reports" },
  { type: "self", title: "Self-financed students", group: "Student reports" },
  { type: "staff", title: "Staff list", group: "Staff reports" },
  { type: "assignments", title: "Class/subject assignments", group: "Staff reports" },
  { type: "joining", title: "Joining date report", group: "Staff reports" },
  { type: "daily-income", title: "Daily income", group: "Financial reports" },
  { type: "monthly-income", title: "Monthly income", group: "Financial reports" },
  { type: "monthly-expenses", title: "Monthly expenses", group: "Financial reports" },
  { type: "fee-collection", title: "Student fee collection", group: "Financial reports" },
  { type: "outstanding", title: "Outstanding fees", group: "Financial reports" },
  { type: "class-fees", title: "Class-wise fee collection", group: "Financial reports" },
  { type: "payment-history", title: "Student payment history", group: "Financial reports" },
  { type: "income-vs-expenses", title: "Income vs expenses", group: "Financial reports", analytics: true },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const user = await requirePermission("reports.view");
  await ensureCurrentMonthFees();
  const { type } = await searchParams;
  const groups = ["Student reports", "Staff reports", "Financial reports"];
  const visibleReports = REPORTS.filter((report) => !report.analytics || can(user.role, "finance.analytics"));

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="All figures come from the same student, class, and finance records used by the dashboards."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {groups.map((group) => (
          <Card key={group} title={group}>
            <div className="space-y-2">
              {visibleReports.filter((report) => report.group === group).map((report) => (
                <div key={report.type} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/reports?type=${report.type}`} className="font-medium text-navy hover:text-teal">
                    {report.title}
                  </Link>
                  <span className="flex gap-2 text-xs">
                    <a className="text-teal" href={`/api/export?type=${report.type}&format=csv`}>CSV</a>
                    <Link className="text-teal" href={`/reports/print?type=${report.type}`}>PDF</Link>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
      {type ? (
        <Card title={visibleReports.find((report) => report.type === type)?.title ?? "Report"} className="mt-6">
          {visibleReports.some((report) => report.type === type) ? (
            <ReportPreview type={type} />
          ) : (
            <p className="text-sm text-slate-500">You do not have access to this report.</p>
          )}
        </Card>
      ) : null}
    </div>
  );
}

async function ReportPreview({ type }: { type: string }) {
  const { month, year } = currentMonthYear();
  if (["students", "scholarship", "need-based", "self", "class-students"].includes(type)) {
    const studentType = type === "scholarship" ? "SCHOLARSHIP" : type === "need-based" ? "NEED_BASED" : type === "self" ? "SELF" : undefined;
    const students = await prisma.student.findMany({
      where: { deletedAt: null, ...(studentType ? { studentType } : {}) },
      include: { class: { include: { program: true } } },
      orderBy: [{ class: { name: "asc" } }, { firstName: "asc" }],
    });
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Student</th>
              <th>Father</th>
              <th>Class</th>
              <th>Type</th>
              <th>Fee</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id}>
                <td>{student.registrationNo}</td>
                <td>{fullName(student.firstName, student.lastName)}</td>
                <td>{student.fatherName}</td>
                <td>{student.class.name} — {student.class.program.name}</td>
                <td>{STUDENT_TYPE_LABELS[student.studentType]}</td>
                <td>{formatPKR(student.feeAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (["staff", "assignments", "joining"].includes(type)) {
    const staff = await prisma.staff.findMany({
      include: {
        subjects: { include: { subject: true } },
        assignments: { include: { class: { include: { program: true } } } },
      },
      orderBy: { dateOfJoining: "asc" },
    });
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Staff ID</th>
              <th>Name</th>
              <th>Qualification</th>
              <th>Joined</th>
              <th>Subjects</th>
              <th>Classes</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <tr key={member.id}>
                <td>{member.staffId}</td>
                <td>{fullName(member.firstName, member.lastName)}</td>
                <td>{member.qualification}</td>
                <td>{member.dateOfJoining.toLocaleDateString()}</td>
                <td>{member.subjects.map((row) => row.subject.name).join(", ")}</td>
                <td>{member.assignments.map((row) => `${row.class.name} ${row.class.program.name}`).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === "outstanding" || type === "class-fees" || type === "fee-collection") {
    const records = await prisma.feeRecord.findMany({
      where: { month, year },
      include: { student: { include: { class: { include: { program: true } } } } },
    });
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Class</th>
              <th>Expected</th>
              <th>Paid</th>
              <th>Remaining</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {records
              .filter((record) => (type === "outstanding" ? record.remainingAmount > 0 : true))
              .map((record) => (
                <tr key={record.id}>
                  <td>{fullName(record.student.firstName, record.student.lastName)}</td>
                  <td>{record.student.class.name} {record.student.class.program.name}</td>
                  <td>{formatPKR(record.expectedAmount)}</td>
                  <td>{formatPKR(record.paidAmount)}</td>
                  <td>{formatPKR(record.remainingAmount)}</td>
                  <td>{record.status}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (type === "payment-history") {
    const payments = await prisma.feePayment.findMany({
      where: { voidedAt: null },
      include: { student: { include: { class: { include: { program: true } } } } },
      orderBy: { paymentDate: "desc" },
    });
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Student</th>
              <th>Class</th>
              <th>Amount</th>
              <th>Method</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.paymentDate.toLocaleDateString()}</td>
                <td>{fullName(payment.student.firstName, payment.student.lastName)}</td>
                <td>{payment.student.class.name} {payment.student.class.program.name}</td>
                <td>{formatPKR(payment.amount)}</td>
                <td>{payment.paymentMethod}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const income = await prisma.incomeTransaction.findMany({ where: { voidedAt: null }, orderBy: { date: "desc" } });
  const expenses = await prisma.expenseTransaction.findMany({ where: { voidedAt: null }, orderBy: { date: "desc" } });
  const totalIncome = income.reduce((sum, row) => sum + row.amount, 0);
  const totalExpenses = expenses.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Income {formatPKR(totalIncome)} · Expenses {formatPKR(totalExpenses)} · Net {formatPKR(totalIncome - totalExpenses)}
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>ID</th>
              <th>Date</th>
              <th>Category</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {income.map((row) => (
              <tr key={row.id}>
                <td>Income</td>
                <td>{row.incomeId}</td>
                <td>{row.date.toLocaleDateString()}</td>
                <td>{INCOME_CATEGORY_LABELS[row.category]}</td>
                <td>{formatPKR(row.amount)}</td>
              </tr>
            ))}
            {expenses.map((row) => (
              <tr key={row.id}>
                <td>Expense</td>
                <td>{row.expenseId}</td>
                <td>{row.date.toLocaleDateString()}</td>
                <td>{EXPENSE_CATEGORY_LABELS[row.category]}</td>
                <td>{formatPKR(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
