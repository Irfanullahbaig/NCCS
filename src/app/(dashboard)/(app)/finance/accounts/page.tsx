import Link from "next/link";
import { Banknote, CircleDollarSign, Landmark, Scale } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import {
  ACCOUNT_CODES,
  ACCOUNTS,
  balanceOf,
  getJournal,
  getLedgerSummary,
  KIND_LABELS,
  type AccountCode,
} from "@/lib/accounting";
import { cn, formatDate, formatPKR, fullName } from "@/lib/utils";
import { Card, EmptyState, Input, PageHeader, Select, StatCard, ViewOnlyBadge } from "@/components/ui";
import { PayStudentButton, RecordPaymentButton } from "@/components/forms";

export const metadata = { title: "Accounts" };

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Karachi",
  }).format(new Date(value));
}

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("finance.view");
  const params = await searchParams;
  const canRecord = can(user.role, "fees.record");
  const account = ACCOUNT_CODES.includes(params.account as AccountCode) ? (params.account as AccountCode) : undefined;
  const kind = params.kind && params.kind in KIND_LABELS ? params.kind : undefined;
  const dateOk = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined);

  const summary = await getLedgerSummary();
  const [journal, studentsRes] = await Promise.all([
    getJournal({ account, kind, studentId: params.student, from: dateOk(params.from), to: dateOk(params.to) }),
    db()
      .from("Student")
      .select("id, firstName, lastName, fatherName, registrationNo, classId, status, deletedAt, class:Class(name, program:Program(name))")
      .order("firstName"),
  ]);
  if (studentsRes.error) throw studentsRes.error;

  const owed = summary.ready ? summary.receivableByStudent : new Map<string, number>();
  const studentOptions = (studentsRes.data ?? []).map((student) => ({
    id: student.id,
    name: fullName(student.firstName, student.lastName),
    classId: student.classId,
    fatherName: student.fatherName ?? undefined,
    registrationNo: student.registrationNo ?? undefined,
    classLabel: student.class ? `${student.class.name} ${student.class.program?.name ?? ""}`.trim() : undefined,
    remaining: owed.get(student.id) ?? 0,
    active: student.status === "ACTIVE" && !student.deletedAt,
  }));
  const byId = new Map(studentOptions.map((student) => [student.id, student]));
  const receivables = [...owed]
    .filter(([, balance]) => Math.abs(balance) >= 0.01)
    .map(([id, balance]) => ({ id, balance, student: byId.get(id) }))
    .sort((a, b) => b.balance - a.balance);
  const filteredStudent = params.student ? byId.get(params.student) : undefined;
  const payable = studentOptions.filter((student) => student.active);

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle="Double-entry journal. Charging a fee debits Accounts Receivable and credits Fee Income; a payment debits the Bank Account and credits Accounts Receivable."
        actions={canRecord ? <RecordPaymentButton students={payable} /> : <ViewOnlyBadge />}
      />

      {!summary.ready ? (
        <EmptyState
          title="The accounting journal is not set up yet"
          description="Run the database migration 20261106000000_journal_entries.sql. Every fee and payment already recorded is then posted to the journal automatically."
        />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Accounts Receivable" value={formatPKR(balanceOf(summary, "ACCOUNTS_RECEIVABLE"))} hint={`${receivables.filter((row) => row.balance > 0).length} students owe fees`} icon={<CircleDollarSign className="h-5 w-5" />} tone="rose" />
            <StatCard label="Bank Account" value={formatPKR(balanceOf(summary, "BANK"))} hint="Received minus paid out" icon={<Landmark className="h-5 w-5" />} tone="teal" />
            <StatCard label="Fee Income" value={formatPKR(balanceOf(summary, "FEE_INCOME"))} hint="Fees charged to students" icon={<Banknote className="h-5 w-5" />} tone="gold" />
            <StatCard
              label="Debits = Credits"
              value={Math.abs(summary.totalDebit - summary.totalCredit) < 0.01 ? "Balanced" : "Out of balance"}
              hint={`${formatPKR(summary.totalDebit)} on each side`}
              icon={<Scale className="h-5 w-5" />}
              tone="navy"
            />
          </div>

          <div className="mb-6 grid gap-5 xl:grid-cols-5">
            <Card title="Trial balance" subtitle="Every account, all time" className="xl:col-span-2">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th className="text-right">Debit</th>
                      <th className="text-right">Credit</th>
                      <th className="text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.accounts.map((row) => (
                      <tr key={row.code}>
                        <td>
                          <Link href={`/finance/accounts?account=${row.code}#journal`} className="font-medium text-navy hover:underline">
                            {row.label}
                          </Link>
                          <div className="text-xs capitalize text-slate-500">{row.type}</div>
                        </td>
                        <td className="text-right">{formatPKR(row.debit)}</td>
                        <td className="text-right">{formatPKR(row.credit)}</td>
                        <td className="text-right font-semibold text-navy">{formatPKR(row.balance)}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td>Total</td>
                      <td className="text-right">{formatPKR(summary.totalDebit)}</td>
                      <td className="text-right">{formatPKR(summary.totalCredit)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>

            <Card id="students" title="Student-wise receivables" subtitle="What each student owes, from their fee charges and payments" className="xl:col-span-3">
              {receivables.length ? (
                <div className="table-wrap max-h-[420px] overflow-y-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Class</th>
                        <th className="text-right">Receivable</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {receivables.map(({ id, balance, student }) => (
                        <tr key={id}>
                          <td>
                            <Link href={`/students/${id}`} className="font-medium text-navy">{student?.name ?? "Removed student"}</Link>
                            <div className="text-xs text-slate-500">{student?.registrationNo}</div>
                          </td>
                          <td>{student?.classLabel ?? "—"}</td>
                          <td className={cn("text-right font-semibold", balance > 0 ? "text-rose-700" : "text-teal")}>
                            {formatPKR(balance)}
                            {balance < 0 ? <div className="text-xs font-normal">in credit</div> : null}
                          </td>
                          <td className="whitespace-nowrap text-right">
                            <Link href={`/finance/accounts?student=${id}#journal`} className="mr-3 text-xs font-semibold text-orange hover:underline">
                              History
                            </Link>
                            {canRecord && student?.active && balance > 0 ? <PayStudentButton student={student} /> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No student owes anything right now.</p>
              )}
            </Card>
          </div>

          <Card
            id="journal"
            title="Journal"
            subtitle={
              filteredStudent
                ? `Entries for ${filteredStudent.name}`
                : account
                  ? `Entries touching ${ACCOUNTS[account].label}`
                  : "Every posting, newest first. Entries are never edited; corrections are new entries."
            }
          >
            <form className="mb-4 grid gap-3 md:grid-cols-6" action="/finance/accounts#journal">
              {params.student ? <input type="hidden" name="student" value={params.student} /> : null}
              <Select name="account" defaultValue={account ?? ""} aria-label="Account">
                <option value="">All accounts</option>
                {ACCOUNT_CODES.map((code) => (
                  <option key={code} value={code}>{ACCOUNTS[code].label}</option>
                ))}
              </Select>
              <Select name="kind" defaultValue={kind ?? ""} aria-label="Type">
                <option value="">All types</option>
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
              <Input type="date" name="from" defaultValue={dateOk(params.from)} aria-label="From date" />
              <Input type="date" name="to" defaultValue={dateOk(params.to)} aria-label="To date" />
              <button className="h-10 rounded-xl bg-navy text-sm font-medium text-white">Apply</button>
              <Link href="/finance/accounts#journal" className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 text-sm text-slate-600">
                Clear
              </Link>
            </form>
            {journal.ready && journal.rows.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>No.</th>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Debit (DR)</th>
                      <th>Credit (CR)</th>
                      <th className="text-right">Amount</th>
                      <th>Student</th>
                      <th>Recorded by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journal.rows.map((entry) => (
                      <tr key={entry.id}>
                        <td className="text-xs text-slate-500">JE-{String(entry.entryNo).padStart(5, "0")}</td>
                        <td className="whitespace-nowrap">{formatDate(entry.date)}</td>
                        <td>
                          <div className="font-medium text-navy">{KIND_LABELS[entry.kind as keyof typeof KIND_LABELS] ?? entry.kind}{entry.revision > 1 ? " · adjustment" : ""}</div>
                          <div className="text-xs text-slate-500">{entry.memo}</div>
                        </td>
                        <td>{ACCOUNTS[entry.debitAccount as AccountCode]?.label ?? entry.debitAccount}</td>
                        <td>{ACCOUNTS[entry.creditAccount as AccountCode]?.label ?? entry.creditAccount}</td>
                        <td className="text-right font-semibold text-navy">{formatPKR(entry.amount)}</td>
                        <td>
                          {entry.studentId && entry.studentName ? (
                            <Link href={`/finance/accounts?student=${entry.studentId}#journal`} className="text-navy hover:underline">
                              {entry.studentName}
                            </Link>
                          ) : (
                            "—"
                          )}
                          {entry.registrationNo ? <div className="text-xs text-slate-500">{entry.registrationNo}</div> : null}
                        </td>
                        <td>
                          {entry.recordedBy ?? "System"}
                          <div className="text-xs text-slate-500">{dateTime(entry.createdAt)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {journal.truncated ? <p className="mt-3 text-xs text-slate-500">Showing the latest {journal.rows.length} entries. Narrow the filters to see older ones.</p> : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No journal entries match these filters.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
