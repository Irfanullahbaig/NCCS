import Link from "next/link";
import { redirect } from "next/navigation";
import { Wallet, CircleDollarSign, Landmark, Scale } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { balanceOf, getLedgerSummary } from "@/lib/accounting";
import { cn, formatPKR, fullName } from "@/lib/utils";
import { Card, EmptyState, PageHeader, StatCard, ViewOnlyBadge } from "@/components/ui";
import { PayStudentButton, RecordPaymentButton } from "@/components/forms";

export const metadata = { title: "Accounts" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("finance.view");
  const params = await searchParams;
  const canRecord = can(user.role, "fees.record");
  // The journal moved to the accounting ledger; keep old filtered links working.
  const filters = new URLSearchParams();
  for (const key of ["account", "kind", "student", "from", "to"]) if (params[key]) filters.set(key, params[key]!);
  if ([...filters].length) redirect(`/finance/ledger?${filters}`);

  const summary = await getLedgerSummary();
  const studentsRes = await db()
    .from("Student")
    .select("id, firstName, lastName, fatherName, registrationNo, classId, status, deletedAt, class:Class(name, program:Program(name))")
    .order("firstName");
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
  const payable = studentOptions.filter((student) => student.active);

  return (
    <div>
      <PageHeader
        title="Accounts"
        subtitle="Trial balance of the double-entry journal. A fee voucher debits Accounts Receivable and credits Student Fee Income; a payment debits the Cash or Bank Account and credits Accounts Receivable."
        actions={
          <>
            <Link href="/finance/ledger" className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm">Accounting ledger</Link>
            {canRecord ? <RecordPaymentButton students={payable} /> : <ViewOnlyBadge />}
          </>
        }
      />

      {!summary.ready ? (
        <EmptyState
          title="The accounting journal is not set up yet"
          description="Run the database migrations 20261106000000_journal_entries.sql and 20261108000000_journal_cash_account.sql. Every fee and payment already recorded is then posted to the journal automatically."
        />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Accounts Receivable" value={formatPKR(balanceOf(summary, "ACCOUNTS_RECEIVABLE"))} hint={`${receivables.filter((row) => row.balance > 0).length} students owe fees`} icon={<CircleDollarSign className="h-5 w-5" />} tone="rose" />
            <StatCard label="Bank Account" value={formatPKR(balanceOf(summary, "BANK"))} hint="Received minus paid out" icon={<Landmark className="h-5 w-5" />} tone="teal" />
            <StatCard label="Cash Account" value={formatPKR(balanceOf(summary, "CASH"))} hint="Cash received minus cash paid out" icon={<Wallet className="h-5 w-5" />} tone="gold" />
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
                          <Link href={`/finance/ledger?account=${row.code}`} className="font-medium text-navy hover:underline">
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

            <Card id="students" title="Student-wise receivables" subtitle="What each student owes, from the Accounts Receivable account" className="xl:col-span-3">
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
                            <Link href={`/finance/ledger?student=${id}`} className="mr-3 text-xs font-semibold text-orange hover:underline">
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

        </>
      )}
    </div>
  );
}
