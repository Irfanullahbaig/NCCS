import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { ensureCurrentMonthFees } from "@/lib/finance";
import { currentMonthYear, formatDate, formatPKR, fullName } from "@/lib/utils";
import { Card, PageHeader } from "@/components/ui";
import { ReportPeriodLaunch, ProgressReportLaunch } from "@/components/report-period";
import { getMonthlyStudentProgress } from "@/lib/progress";
import { STUDENT_TYPE_LABELS, INCOME_CATEGORY_LABELS, EXPENSE_CATEGORY_LABELS, FACULTY_TYPE_LABELS } from "@/lib/constants";

const REPORTS: Array<{ type: string; title: string; group: string; analytics?: boolean }> = [
  { type: "students", title: "Student list", group: "Student reports" },
  { type: "class-students", title: "Class-wise students", group: "Student reports" },
  { type: "scholarship", title: "Scholarship students", group: "Student reports" },
  { type: "need-based", title: "Need-based students", group: "Student reports" },
  { type: "self", title: "Self-financed students", group: "Student reports" },
  { type: "student-progress", title: "Monthly student progress", group: "Student reports" },
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
  { type: "ledger", title: "Transaction ledger", group: "Financial reports" },
  { type: "payroll", title: "Payroll", group: "Financial reports" },
  { type: "advances", title: "Advance salaries", group: "Financial reports" },
  { type: "profit-loss", title: "Profit & Loss", group: "Financial reports", analytics: true },
  { type: "income-vs-expenses", title: "Income vs expenses", group: "Financial reports", analytics: true },
];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("reports.view");
  await ensureCurrentMonthFees();
  const params = await searchParams;
  const type = params.type;
  const groups = ["Student reports", "Staff reports", "Financial reports"];
  const visibleReports = REPORTS.filter((report) => !report.analytics || can(user.role, "finance.analytics"));
  const classesRes = await db().from("Class").select("*, program:Program(*)").order("name", { ascending: true });
  if (classesRes.error) throw classesRes.error;
  const classes = (classesRes.data ?? []).map((item) => ({
    id: item.id,
    label: `${item.name} — ${item.program.name}`,
  }));

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="All figures come from the same student, class, and finance records used by the dashboards."
        actions={
          can(user.role, "reports.export") ? (
            <div className="flex flex-wrap gap-2">
              <ProgressReportLaunch classes={classes} />
              <ReportPeriodLaunch
                types={visibleReports
                  .filter((report) => report.group === "Financial reports")
                  .map((report) => ({ type: report.type, title: report.title }))}
              />
            </div>
          ) : null
        }
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
            <ReportPreview type={type} params={params} />
          ) : (
            <p className="text-sm text-slate-500">You do not have access to this report.</p>
          )}
        </Card>
      ) : null}
    </div>
  );
}

async function ReportPreview({ type, params }: { type: string; params: Record<string, string | undefined> }) {
  const fallback = currentMonthYear();
  const month = Number(params.month) || fallback.month;
  const year = Number(params.year) || fallback.year;
  if (type === "student-progress") {
    const data = await getMonthlyStudentProgress({ month, year, classId: params.classId });
    return (
      <div className="space-y-6">
        <p className="text-sm text-slate-600">{data.label}. Print this report for class teachers to complete subject remarks.</p>
        {data.groups.map((group) => (
          <div key={group.classId}>
            <h3 className="mb-2 text-sm font-semibold text-navy">{group.className} — {group.programName}</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Sr</th>
                    <th>ID</th>
                    <th>Student</th>
                    <th>Father</th>
                    {group.subjects.map((subject) => <th key={subject.id}>{subject.name}</th>)}
                    <th>Fee</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {group.students.map((student) => (
                    <tr key={student.id}>
                      <td>{student.sr}</td>
                      <td>{student.registrationNo}</td>
                      <td>{student.name}</td>
                      <td>{student.fatherName}</td>
                      {group.subjects.map((subject) => <td key={subject.id}>—</td>)}
                      <td>{student.feeStatus}</td>
                      <td></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (["students", "scholarship", "need-based", "self", "class-students"].includes(type)) {
    const studentType = type === "scholarship" ? "SCHOLARSHIP" : type === "need-based" ? "NEED_BASED" : type === "self" ? "SELF" : undefined;
    const studentsRes = await db()
      .from("Student")
      .select("*, class:Class(*, program:Program(*))")
      .is("deletedAt", null);
    if (studentsRes.error) throw studentsRes.error;
    let students = studentsRes.data ?? [];
    if (studentType) students = students.filter((student) => student.studentType === studentType);
    students = students.sort(
      (a, b) => (a.class?.name ?? "").localeCompare(b.class?.name ?? "") || a.firstName.localeCompare(b.firstName),
    );
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
    const staffRes = await db()
      .from("Staff")
      .select("*, subjects:StaffSubject(*, subject:Subject(*)), assignments:StaffAssignment(*, class:Class(*, program:Program(*)))")
      .order("dateOfJoining", { ascending: true });
    if (staffRes.error) throw staffRes.error;
    const staff = staffRes.data ?? [];
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Staff ID</th>
              <th>Name</th>
              <th>Faculty</th>
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
                <td>{FACULTY_TYPE_LABELS[member.facultyType ?? "PERMANENT"]}</td>
                <td>{member.qualification}</td>
                <td>{formatDate(member.dateOfJoining)}</td>
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
    const recordsRes = await db()
      .from("FeeRecord")
      .select("*, student:Student(*, class:Class(*, program:Program(*)))")
      .eq("month", month)
      .eq("year", year);
    if (recordsRes.error) throw recordsRes.error;
    const records = recordsRes.data ?? [];
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Class</th>
              <th>Expected</th>
              <th>Fine</th>
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
                  <td>{formatPKR(record.fineAmount ?? 0)}</td>
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
    const paymentsRes = await db()
      .from("FeePayment")
      .select("*, student:Student(*, class:Class(*, program:Program(*)))")
      .is("voidedAt", null)
      .order("paymentDate", { ascending: false });
    if (paymentsRes.error) throw paymentsRes.error;
    const payments = paymentsRes.data ?? [];
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
                <td>{formatDate(payment.paymentDate)}</td>
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

  const [incomeRes, expensesRes] = await Promise.all([
    db().from("IncomeTransaction").select("*").is("voidedAt", null).order("date", { ascending: false }),
    db().from("ExpenseTransaction").select("*").is("voidedAt", null).order("date", { ascending: false }),
  ]);
  if (incomeRes.error) throw incomeRes.error;
  if (expensesRes.error) throw expensesRes.error;
  const income = incomeRes.data ?? [];
  const expenses = expensesRes.data ?? [];
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
                <td>{formatDate(row.date)}</td>
                <td>{INCOME_CATEGORY_LABELS[row.category]}</td>
                <td>{formatPKR(row.amount)}</td>
              </tr>
            ))}
            {expenses.map((row) => (
              <tr key={row.id}>
                <td>Expense</td>
                <td>{row.expenseId}</td>
                <td>{formatDate(row.date)}</td>
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
