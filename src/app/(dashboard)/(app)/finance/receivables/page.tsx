import Link from "next/link";
import { AlertCircle, CircleDollarSign, FileText, Scale } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { ImportButton } from "@/components/import-dialog";
import { importTypesFor } from "@/lib/import/specs";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { balanceOf, getLedgerSummary, readAll, voucherNumber } from "@/lib/accounting";
import { calendarDateInKarachi, cn, formatDate, formatPKR, fullName, monthLabel, MONTH_NAMES } from "@/lib/utils";
import { Card, EmptyState, Input, PageHeader, Select, StatCard } from "@/components/ui";
import { FeeBadge } from "@/components/badges";
import { PayStudentButton } from "@/components/forms";
import { LateFeeCell } from "@/components/late-fee";
import { AdjustFeeButton } from "@/components/finance-records";

export const metadata = { title: "Accounts Receivable" };

const STATUS_FILTERS = {
  open: { label: "All open (unpaid, partly paid, overdue)", statuses: ["PENDING", "OVERDUE", "PARTIALLY_PAID"] },
  PAID: { label: "Paid", statuses: ["PAID"] },
  PENDING: { label: "Unpaid", statuses: ["PENDING"] },
  PARTIALLY_PAID: { label: "Partially paid", statuses: ["PARTIALLY_PAID"] },
  OVERDUE: { label: "Overdue", statuses: ["OVERDUE"] },
  WAIVED: { label: "Waived (scholarship)", statuses: ["WAIVED"] },
} as const;

type Voucher = {
  id: string;
  studentId: string;
  classId: string;
  academicYearId: string;
  month: number;
  year: number;
  expectedAmount: number;
  waivedAmount: number;
  fineAmount: number | null;
  fineWaived: boolean;
  fineWaiveReason: string | null;
  paidAmount: number;
  remainingAmount: number;
  status: string;
  dueDate: string;
};

const SHOW = 500;

/**
 * Accounts Receivable register: one row per issued fee voucher. The open
 * balance of the vouchers is the subsidiary ledger behind the Accounts
 * Receivable account, and the page checks that the two agree.
 */
export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("fees.view");
  const params = await searchParams;
  const canRecord = can(user.role, "fees.record");
  const canAdjust = can(user.role, "finance.edit");
  const canWaive = can(user.role, "fees.waive");
  const importTypes = importTypesFor(user.role, ["receivables", "fees"]);

  const statusKey = params.status && params.status in STATUS_FILTERS ? (params.status as keyof typeof STATUS_FILTERS) : params.voucher ? "" : "open";
  const month = Number(params.month) || 0;
  const year = Number(params.year) || 0;
  const q = params.q?.trim().toLowerCase() ?? "";

  const summary = await getLedgerSummary();
  const [vouchers, studentsRes, classesRes, sessionsRes] = await Promise.all([
    readAll<Voucher>(() =>
      db()
        .from("FeeRecord")
        .select("id, studentId, classId, academicYearId, month, year, expectedAmount, waivedAmount, fineAmount, fineWaived, fineWaiveReason, paidAmount, remainingAmount, status, dueDate")
        .order("id"),
    ),
    db().from("Student").select("id, firstName, lastName, fatherName, registrationNo, classId, status, deletedAt, class:Class(name, program:Program(name))"),
    db().from("Class").select("id, name, program:Program(name)").order("name"),
    db().from("AcademicYear").select("id, name, startDate").order("startDate", { ascending: false }),
  ]);
  if (studentsRes.error) throw studentsRes.error;
  if (classesRes.error) throw classesRes.error;
  if (sessionsRes.error) throw sessionsRes.error;

  const students = new Map((studentsRes.data ?? []).map((student) => [student.id, student]));
  const classLabel = (value: { name: string; program?: { name: string } | null } | null | undefined) => (value ? `${value.name} ${value.program?.name ?? ""}`.trim() : "—");
  const classes = (classesRes.data ?? []).map((row) => ({ id: row.id, label: classLabel(row) }));
  const classById = new Map(classes.map((row) => [row.id, row.label]));
  const sessions = sessionsRes.data ?? [];
  const today = calendarDateInKarachi();

  const allOpen = vouchers.filter((row) => row.remainingAmount > 0);
  const subledger = allOpen.reduce((sum, row) => sum + row.remainingAmount, 0);
  const ledgerReceivable = summary.ready ? balanceOf(summary, "ACCOUNTS_RECEIVABLE") : null;
  const difference = ledgerReceivable === null ? 0 : Math.round((ledgerReceivable - subledger) * 100) / 100;

  const statuses: readonly string[] | null = statusKey ? STATUS_FILTERS[statusKey].statuses : null;
  const rows = vouchers
    .filter((row) => !params.voucher || row.id === params.voucher)
    .filter((row) => !statuses || statuses.includes(row.status))
    .filter((row) => !params.class || row.classId === params.class)
    .filter((row) => !params.session || row.academicYearId === params.session)
    .filter((row) => !month || row.month === month)
    .filter((row) => !year || row.year === year)
    .map((row) => {
      const student = students.get(row.studentId);
      return {
        ...row,
        number: voucherNumber(row.year, row.month, student?.registrationNo, row.id),
        total: Math.max(0, row.expectedAmount - row.waivedAmount) + (row.fineAmount ?? 0),
        studentName: student ? fullName(student.firstName, student.lastName) : "Removed student",
        registrationNo: student?.registrationNo ?? "",
        classText: classById.get(row.classId) ?? classLabel(student?.class),
        student,
      };
    })
    .filter((row) => !q || [row.studentName, row.registrationNo, row.number, row.classText].join(" ").toLowerCase().includes(q))
    .sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month) || b.remainingAmount - a.remainingAmount || a.studentName.localeCompare(b.studentName));

  const shown = rows.slice(0, SHOW);
  const filteredOutstanding = rows.reduce((sum, row) => sum + row.remainingAmount, 0);
  const overdue = allOpen.filter((row) => row.status === "OVERDUE" || (row.dueDate && row.dueDate.slice(0, 10) < today));
  const overdueAmount = overdue.reduce((sum, row) => sum + row.remainingAmount, 0);
  const years = [...new Set(vouchers.map((row) => row.year))].sort((a, b) => b - a);

  return (
    <div>
      <PageHeader
        title="Accounts Receivable"
        subtitle="Every issued fee voucher with what has been paid and what is still owed. Issuing a voucher debits Accounts Receivable; each payment credits it."
        actions={importTypes.length ? <ImportButton types={importTypes} label="Import" /> : null}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Total outstanding" value={formatPKR(subledger)} hint={`${new Set(allOpen.map((row) => row.studentId)).size} students · ${allOpen.length} open vouchers`} icon={<CircleDollarSign className="h-5 w-5" />} tone="rose" />
        <StatCard label="Overdue" value={formatPKR(overdueAmount)} hint={`${overdue.length} vouchers past their due date`} icon={<AlertCircle className="h-5 w-5" />} tone="gold" href="/finance/receivables?status=OVERDUE" />
        <StatCard label="Vouchers issued" value={vouchers.length.toLocaleString("en-PK")} hint={`${vouchers.filter((row) => row.status === "PAID").length} paid · ${vouchers.filter((row) => row.status === "PARTIALLY_PAID").length} partly paid`} icon={<FileText className="h-5 w-5" />} tone="navy" />
        <StatCard
          label="Matches the ledger"
          value={ledgerReceivable === null ? "Journal not set up" : Math.abs(difference) < 0.01 ? "Yes" : `Off by ${formatPKR(difference)}`}
          hint={ledgerReceivable === null ? "Run the journal migrations" : `Accounts Receivable account: ${formatPKR(ledgerReceivable)}`}
          icon={<Scale className="h-5 w-5" />}
          tone={ledgerReceivable !== null && Math.abs(difference) < 0.01 ? "teal" : "rose"}
          href="/finance/ledger?account=ACCOUNTS_RECEIVABLE"
        />
      </div>

      <form className="mb-4 grid gap-3 rounded-3xl bg-white p-4 shadow-card md:grid-cols-3 xl:grid-cols-7" action="/finance/receivables">
        <Input name="q" defaultValue={params.q} placeholder="Student, ID or voucher no." aria-label="Search student" className="xl:col-span-2" />
        <Select name="class" defaultValue={params.class ?? ""} aria-label="Class">
          <option value="">All classes</option>
          {classes.map((row) => (
            <option key={row.id} value={row.id}>{row.label}</option>
          ))}
        </Select>
        <Select name="month" defaultValue={month ? String(month) : ""} aria-label="Fee month">
          <option value="">All months</option>
          {MONTH_NAMES.map((label, index) => (
            <option key={label} value={index + 1}>{label}</option>
          ))}
        </Select>
        <Select name="year" defaultValue={year ? String(year) : ""} aria-label="Fee year">
          <option value="">All years</option>
          {years.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </Select>
        <Select name="session" defaultValue={params.session ?? ""} aria-label="Academic session">
          <option value="">All sessions</option>
          {sessions.map((row) => (
            <option key={row.id} value={row.id}>{row.name}</option>
          ))}
        </Select>
        <Select name="status" defaultValue={statusKey} aria-label="Status">
          <option value="">Any status</option>
          {Object.entries(STATUS_FILTERS).map(([value, item]) => (
            <option key={value} value={value}>{item.label}</option>
          ))}
        </Select>
        <div className="flex gap-2 md:col-span-3 xl:col-span-7 xl:justify-end">
          <button className="h-10 rounded-xl bg-navy px-5 text-sm font-medium text-white">Apply</button>
          <Link href="/finance/receivables" className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm text-slate-600">Clear</Link>
        </div>
      </form>

      <Card
        title={`${rows.length.toLocaleString("en-PK")} voucher${rows.length === 1 ? "" : "s"}`}
        subtitle={`Outstanding on these vouchers: ${formatPKR(filteredOutstanding)}`}
      >
        {shown.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Fee month</th>
                  <th>Voucher no.</th>
                  <th className="text-right">Voucher amount</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Remaining</th>
                  <th>Late fee</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const payable = row.student && row.student.status === "ACTIVE" && !row.student.deletedAt && row.remainingAmount > 0;
                  return (
                    <tr key={row.id} className={cn(params.voucher === row.id && "bg-amber-50/60")}>
                      <td>
                        <Link href={`/students/${row.studentId}`} className="font-medium text-navy">{row.studentName}</Link>
                        <div className="text-xs text-slate-500">{row.registrationNo || "—"}</div>
                      </td>
                      <td>{row.classText}</td>
                      <td className="whitespace-nowrap">{monthLabel(row.month, row.year)}</td>
                      <td className="whitespace-nowrap text-xs">
                        <Link href={`/finance/ledger?q=${encodeURIComponent(row.number)}`} className="text-teal hover:underline">{row.number}</Link>
                      </td>
                      <td className="text-right">{formatPKR(row.total)}</td>
                      <td className="text-right">{formatPKR(row.paidAmount)}</td>
                      <td className={cn("text-right font-semibold", row.remainingAmount > 0 ? "text-rose-700" : "text-teal")}>{formatPKR(row.remainingAmount)}</td>
                      <td>
                        <LateFeeCell
                          feeRecordId={row.id}
                          fine={row.fineAmount ?? 0}
                          fineWaived={row.fineWaived}
                          reason={row.fineWaiveReason}
                          label={`${row.studentName}, ${monthLabel(row.month, row.year)}`}
                          canWaive={canWaive}
                        />
                      </td>
                      <td className="whitespace-nowrap">{formatDate(row.dueDate)}</td>
                      <td><FeeBadge status={row.status} /></td>
                      <td className="whitespace-nowrap text-right">
                        <div className="flex justify-end gap-2">
                          {canRecord && payable && row.student ? (
                            <PayStudentButton
                              student={{
                                id: row.studentId,
                                name: row.studentName,
                                classId: row.student.classId,
                                fatherName: row.student.fatherName ?? undefined,
                                registrationNo: row.registrationNo || undefined,
                                classLabel: row.classText,
                                remaining: row.remainingAmount,
                              }}
                              label={row.paidAmount > 0 ? "Record payment" : "Mark as paid"}
                              voucher={{ month: row.month, year: row.year }}
                            />
                          ) : null}
                          {canAdjust ? (
                            <AdjustFeeButton studentId={row.studentId} studentName={row.studentName} defaultMonth={row.month} defaultYear={row.year} />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td colSpan={4}>Total{rows.length > SHOW ? ` (first ${SHOW} shown)` : ""}</td>
                  <td className="text-right">{formatPKR(rows.reduce((sum, row) => sum + row.total, 0))}</td>
                  <td className="text-right">{formatPKR(rows.reduce((sum, row) => sum + row.paidAmount, 0))}</td>
                  <td className="text-right">{formatPKR(filteredOutstanding)}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState title="No fee vouchers match" description="Change the filters, or issue vouchers from Student Fees → Initiate fee vouchers." />
        )}
      </Card>
    </div>
  );
}
