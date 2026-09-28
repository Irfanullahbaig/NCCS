import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { SCHOOL_FULL_NAME } from "@/lib/constants";
import { currentMonthYear, formatDateTime, formatPKR, fullName } from "@/lib/utils";
import { PrintToolbar } from "@/components/print-toolbar";

export default async function PrintReportPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  await requirePermission("reports.export");
  const { type = "students" } = await searchParams;
  const { month, year } = currentMonthYear();
  const feeTypes = ["outstanding", "class-fees", "fee-collection", "payment-history"];
  let rows: Array<{
    id: string;
    expectedAmount: number;
    paidAmount: number;
    remainingAmount: number;
    student: { firstName: string; lastName: string; studentType: string; class: { name: string; program: { name: string } } };
  }> = [];
  let students: Array<{
    id: string;
    firstName: string;
    lastName: string;
    studentType: string;
    feeAmount: number;
    class: { name: string; program: { name: string } };
  }> = [];

  if (feeTypes.includes(type)) {
    const recordsRes = await db()
      .from("FeeRecord")
      .select("*, student:Student(*, class:Class(*, program:Program(*)))")
      .eq("month", month)
      .eq("year", year)
      .order("remainingAmount", { ascending: false });
    if (recordsRes.error) throw recordsRes.error;
    rows = (recordsRes.data ?? []).filter((record) => (type === "outstanding" ? record.remainingAmount > 0 : true));
  } else {
    const studentsRes = await db()
      .from("Student")
      .select("*, class:Class(*, program:Program(*))")
      .is("deletedAt", null)
      .order("firstName", { ascending: true });
    if (studentsRes.error) throw studentsRes.error;
    students = (studentsRes.data ?? []).filter((student) => {
      if (type === "scholarship") return student.studentType === "SCHOLARSHIP";
      if (type === "need-based") return student.studentType === "NEED_BASED";
      if (type === "self") return student.studentType === "SELF";
      return true;
    });
  }

  return (
    <div className="mx-auto max-w-5xl bg-white p-8 print:max-w-none">
      <PrintToolbar />
      <header className="mb-6 border-b pb-4">
        <img src="/nccs-logo-mark.png" alt="NCCS" className="mb-3 h-10 w-auto" />
        <h1 className="text-2xl font-semibold text-navy">{SCHOOL_FULL_NAME}</h1>
        <p className="text-sm text-slate-500">
          Report: {type} · Generated {formatDateTime(new Date())}
        </p>
      </header>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Class</th>
              <th>Type</th>
              <th>Fee / Expected</th>
              <th>Paid</th>
              <th>Remaining</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((record) => (
              <tr key={record.id}>
                <td>{fullName(record.student.firstName, record.student.lastName)}</td>
                <td>{record.student.class.name} {record.student.class.program.name}</td>
                <td>{record.student.studentType}</td>
                <td>{formatPKR(record.expectedAmount)}</td>
                <td>{formatPKR(record.paidAmount)}</td>
                <td>{formatPKR(record.remainingAmount)}</td>
              </tr>
            ))}
            {students.map((student) => (
              <tr key={student.id}>
                <td>{fullName(student.firstName, student.lastName)}</td>
                <td>{student.class.name} {student.class.program.name}</td>
                <td>{student.studentType}</td>
                <td>{formatPKR(student.feeAmount)}</td>
                <td>—</td>
                <td>—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
