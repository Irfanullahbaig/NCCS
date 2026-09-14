import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SCHOOL_FULL_NAME } from "@/lib/constants";
import { currentMonthYear, formatPKR, fullName } from "@/lib/utils";
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
  const rows = feeTypes.includes(type)
    ? await prisma.feeRecord.findMany({
        where: { month, year, ...(type === "outstanding" ? { remainingAmount: { gt: 0 } } : {}) },
        include: { student: { include: { class: { include: { program: true } } } } },
        orderBy: { remainingAmount: "desc" },
      })
    : [];
  const students = feeTypes.includes(type)
    ? []
    : await prisma.student.findMany({
        where: {
          deletedAt: null,
          ...(type === "scholarship" ? { studentType: "SCHOLARSHIP" } : {}),
          ...(type === "need-based" ? { studentType: "NEED_BASED" } : {}),
          ...(type === "self" ? { studentType: "SELF" } : {}),
        },
        include: { class: { include: { program: true } } },
        orderBy: { firstName: "asc" },
      });

  return (
    <div className="mx-auto max-w-5xl bg-white p-8 print:max-w-none">
      <PrintToolbar />
      <header className="mb-6 border-b pb-4">
        <img src="/nccs-logo-mark.png" alt="NCCS" className="mb-3 h-10 w-auto" />
        <h1 className="text-2xl font-semibold text-navy">{SCHOOL_FULL_NAME}</h1>
        <p className="text-sm text-slate-500">
          Report: {type} · Generated {new Date().toLocaleString()}
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
