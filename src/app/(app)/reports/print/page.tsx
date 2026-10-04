import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { PAYMENT_METHOD_LABELS, SCHOOL_FULL_NAME } from "@/lib/constants";
import { currentMonthYear, formatDate, formatDateTime, formatPKR, fullName, monthLabel } from "@/lib/utils";
import { PrintToolbar } from "@/components/print-toolbar";
import { getLedgerEntries, getProfitAndLoss, getYearlyMonthTable } from "@/lib/ledger";
import { periodFromParams } from "@/lib/period";
import { isAdvancePayment } from "@/lib/salary";
import { getMonthlyStudentProgress } from "@/lib/progress";

export default async function PrintReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("reports.export");
  const params = await searchParams;
  const type = params.type ?? "students";
  if (type === "profit-loss" && !can(user.role, "finance.analytics")) {
    return <div className="p-8 text-sm text-slate-600">You do not have access to Profit & Loss reports.</div>;
  }
  const period = periodFromParams(params);
  const { month, year } = currentMonthYear();
  const financial = [
    "profit-loss",
    "ledger",
    "payroll",
    "advances",
    "fee-collection",
    "payment-history",
    "income-vs-expenses",
    "monthly-income",
    "monthly-expenses",
    "outstanding",
    "class-fees",
    "daily-income",
  ].includes(type);

  return (
    <div className="mx-auto max-w-5xl bg-white p-8 print:max-w-none">
      <PrintToolbar />
      <header className="mb-6 border-b pb-4">
        <img src="/nccs-logo-mark.png" alt="NCCS" className="mb-3 h-10 w-auto" />
        <h1 className="text-2xl font-semibold text-navy">{SCHOOL_FULL_NAME}</h1>
        <p className="text-sm text-slate-500">
          Report: {type.replaceAll("-", " ")} · Period: {financial ? period.label : monthLabel(month, year)} · Generated {formatDateTime(new Date())}
        </p>
      </header>
      {type === "student-progress" ? (
        <ProgressPrint params={params} />
      ) : financial ? (
        <FinancialPrint type={type} params={params} />
      ) : (
        <DirectoryPrint type={type} />
      )}
    </div>
  );
}

async function FinancialPrint({
  type,
  params,
}: {
  type: string;
  params: Record<string, string | undefined>;
}) {
  const period = periodFromParams(params);
  const pnl = await getProfitAndLoss(period);
  const yearly = await getYearlyMonthTable(period.year);
  const ledger = await getLedgerEntries(period);
  const feeIncome = ledger.filter((row) => row.direction === "income");
  const expenses = ledger.filter((row) => row.direction === "expense" && row.type !== "SALARIES" && row.type !== "ADVANCE_SALARY");
  const payrollRows = ledger.filter((row) => row.type === "SALARIES" || row.type === "ADVANCE_SALARY");

  const salaryRes = await db()
    .from("SalaryRecord")
    .select("*, staff:Staff(*), payments:SalaryPayment(*)")
    .gte("year", period.mode === "year" ? period.year : period.year)
    .lte("year", period.year);
  if (salaryRes.error) throw salaryRes.error;
  let salaries = salaryRes.data ?? [];
  if (period.mode === "month" && period.month) {
    salaries = salaries.filter((row) => row.month === period.month && row.year === period.year);
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-lg font-semibold text-navy">Financial summary</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <Summary label="Total income" value={formatPKR(pnl.totalIncome)} />
          <Summary label="Total expenses" value={formatPKR(pnl.totalExpenses)} />
          <Summary label="Fees collected" value={formatPKR(pnl.studentFees)} />
          <Summary label="Outstanding fees" value={formatPKR(pnl.outstanding)} />
          <Summary label="Payroll" value={formatPKR(pnl.payroll)} />
          <Summary label="Advance salary" value={formatPKR(pnl.advances)} />
          <Summary label="Other expenses" value={formatPKR(pnl.otherExpenses + pnl.rent + pnl.utilities + pnl.supplies + pnl.maintenance)} />
          <Summary label="Net profit / loss" value={formatPKR(pnl.net)} />
        </div>
      </section>

      {(type === "profit-loss" || type === "income-vs-expenses" || period.mode === "year") ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-navy">{period.year} monthly profit & loss</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Income</th>
                  <th>Fees</th>
                  <th>Payroll</th>
                  <th>Expenses</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {yearly.map((row) => (
                  <tr key={row.month}>
                    <td>{row.label}</td>
                    <td>{formatPKR(row.income)}</td>
                    <td>{formatPKR(row.fees)}</td>
                    <td>{formatPKR(row.payroll)}</td>
                    <td>{formatPKR(row.expenses)}</td>
                    <td>{formatPKR(row.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {type !== "payroll" && type !== "advances" && type !== "monthly-expenses" ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-navy">Student fee transactions</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Student</th>
                  <th>Program</th>
                  <th>Fee month</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Receipt ID</th>
                </tr>
              </thead>
              <tbody>
                {feeIncome.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.date)}</td>
                    <td>{row.person}</td>
                    <td>{row.program || "—"}</td>
                    <td>{row.monthLabel || "—"}</td>
                    <td>{formatPKR(row.amount)}</td>
                    <td>{PAYMENT_METHOD_LABELS[row.method as keyof typeof PAYMENT_METHOD_LABELS] ?? row.method}</td>
                    <td>{row.receiptId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {type !== "fee-collection" && type !== "payment-history" && type !== "monthly-income" ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-navy">Payroll</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Salary</th>
                  <th>Advance</th>
                  <th>Paid</th>
                  <th>Remaining</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {salaries.map((record) => {
                  const payments = (record.payments ?? []).filter((payment) => !payment.voidedAt);
                  const advance = payments.filter((payment) => isAdvancePayment(payment.notes)).reduce((sum, payment) => sum + payment.amount, 0);
                  if (type === "advances" && advance <= 0) return null;
                  return (
                    <tr key={record.id}>
                      <td>{fullName(record.staff.firstName, record.staff.lastName)} · {record.staff.staffId}</td>
                      <td>{formatPKR(record.expectedAmount)}</td>
                      <td>{formatPKR(advance)}</td>
                      <td>{formatPKR(record.paidAmount)}</td>
                      <td>{formatPKR(record.remainingAmount)}</td>
                      <td>{record.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {type === "ledger" || type === "monthly-expenses" || type === "income-vs-expenses" || type === "profit-loss" ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-navy">Expenses</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Payee</th>
                  <th>Amount</th>
                  <th>Method</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.date)}</td>
                    <td>{row.type.replaceAll("_", " ")}</td>
                    <td>{row.person}</td>
                    <td>{formatPKR(row.amount)}</td>
                    <td>{PAYMENT_METHOD_LABELS[row.method as keyof typeof PAYMENT_METHOD_LABELS] ?? row.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {type === "ledger" ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-navy">Full ledger</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Person</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.date)}</td>
                    <td>{row.transactionId}</td>
                    <td>{row.source}</td>
                    <td>{row.person}</td>
                    <td>{formatPKR(row.signedAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {payrollRows.length && type === "advances" ? (
        <p className="text-xs text-slate-500">Advance amounts are included in payroll paid totals and are not added a second time to expenses.</p>
      ) : null}
    </div>
  );
}

async function DirectoryPrint({ type }: { type: string }) {
  const studentsRes = await db()
    .from("Student")
    .select("*, class:Class(*, program:Program(*))")
    .is("deletedAt", null)
    .order("firstName", { ascending: true });
  if (studentsRes.error) throw studentsRes.error;
  const students = (studentsRes.data ?? []).filter((student) => {
    if (type === "scholarship") return student.studentType === "SCHOLARSHIP";
    if (type === "need-based") return student.studentType === "NEED_BASED";
    if (type === "self") return student.studentType === "SELF";
    return true;
  });

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
              <th>Joined</th>
              <th>Qualification</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => (
              <tr key={member.id}>
                <td>{member.staffId}</td>
                <td>{fullName(member.firstName, member.lastName)}</td>
                <td>{formatDate(member.dateOfJoining)}</td>
                <td>{member.qualification}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Class</th>
            <th>Type</th>
            <th>Fee</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.id}>
              <td>{fullName(student.firstName, student.lastName)}</td>
              <td>{student.class.name} {student.class.program.name}</td>
              <td>{student.studentType}</td>
              <td>{formatPKR(student.feeAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function ProgressPrint({ params }: { params: Record<string, string | undefined> }) {
  const fallback = currentMonthYear();
  const month = Number(params.month) || fallback.month;
  const year = Number(params.year) || fallback.year;
  const data = await getMonthlyStudentProgress({ month, year, classId: params.classId });
  if (!data.groups.length) {
    return <p className="text-sm text-slate-500">No active students found for this period.</p>;
  }
  return (
    <div className="space-y-10">
      {data.groups.map((group) => (
        <section key={group.classId} className="break-after-page">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-navy">Monthly student progress report</h2>
            <p className="text-sm text-slate-600">
              {group.className} — {group.programName} · {data.label} · Class teacher: {group.teacher}
            </p>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sr</th>
                  <th>Student ID</th>
                  <th>Student</th>
                  <th>Father</th>
                  {group.subjects.map((subject) => (
                    <th key={subject.id}>{subject.name}</th>
                  ))}
                  <th>Fee status</th>
                  <th>Teacher remarks</th>
                </tr>
              </thead>
              <tbody>
                {group.students.map((student) => (
                  <tr key={student.id}>
                    <td>{student.sr}</td>
                    <td>{student.registrationNo}</td>
                    <td>{student.name}</td>
                    <td>{student.fatherName}</td>
                    {group.subjects.map((subject) => (
                      <td key={subject.id} className="min-w-[4rem]"></td>
                    ))}
                    <td>{student.feeStatus}</td>
                    <td className="min-w-[8rem]"></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-8 text-sm text-slate-600">
            <p>Class teacher signature: ______________________</p>
            <p>Principal signature: ______________________</p>
          </div>
        </section>
      ))}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-navy">{value}</p>
    </div>
  );
}
