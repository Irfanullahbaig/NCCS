import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  GraduationCap,
  Info,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getBoardOverview, type Insight, type InsightTone } from "@/lib/board";
import { getDashboardData } from "@/lib/queries";
import { getFinanceDashboard, type FinanceDashboard } from "@/lib/finance-dashboard";
import { latestVoucherMonth } from "@/lib/finance";
import { InitiateVouchersButton, RecordPaymentButton } from "@/components/forms";
import { periodFromParams } from "@/lib/period";
import { getSchoolName } from "@/lib/school";
import { cn, formatDate, formatPKR, fullName, MONTH_NAMES } from "@/lib/utils";
import { PAYMENT_METHOD_LABELS, SCHOOL_NAME } from "@/lib/constants";
import { Card, Segmented, StatCard } from "@/components/ui";
import { ClassDistributionChart, EnrollmentChart, LedgerTrendChart, SERIES } from "@/components/board-charts";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("dashboard.view");
  const params = await searchParams;
  // The board view works on whole months or whole years.
  const period = periodFromParams({ ...params, period: params.period === "year" ? "year" : "month" });
  const showFinance = can(user.role, "finance.analytics");
  const showPayroll = can(user.role, "salaries.view");
  const showAccounts = can(user.role, "finance.view");
  const canRecord = can(user.role, "fees.record");
  const [board, recent, schoolName, accounts] = await Promise.all([
    getBoardOverview(period, { finance: showFinance, payroll: showPayroll }),
    getDashboardData(),
    getSchoolName(),
    showAccounts ? getFinanceDashboard(period) : null,
  ]);
  // With the journal in place, the finance sections are built from it.
  const ledger = accounts?.ready ? accounts : null;
  const { students, staff, classes, fees, payroll } = board;
  const month = period.month ?? new Date().getMonth() + 1;
  const scope = period.mode === "year" ? `in ${period.year}` : `in ${period.label}`;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="brand-gradient relative overflow-hidden rounded-3xl px-6 py-6 text-white shadow-card sm:px-8 sm:py-7">
        <div className="relative z-10 max-w-2xl">
          <p className="text-sm text-white/85">
            {board.academicYear ? `Academic year ${board.academicYear}` : "Board overview"} · {period.label}
          </p>
          <h1 className="mt-2 text-2xl font-semibold leading-snug sm:text-3xl">
            {schoolName} performance at a glance
          </h1>
          <p className="mt-2 text-sm text-white/85">
            {students.total} active students in {classes.total} classes, taught and run by {staff.active} active staff.{" "}
            {fees.billed > 0
              ? `${fees.rate}% of fees collected ${scope} (${formatPKR(fees.collected)} of ${formatPKR(fees.billed)}).`
              : `No fees billed ${scope} yet.`}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {can(user.role, "reports.view") ? (
              <Link href="/reports" className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-semibold text-navy hover:bg-white/90">
                Open reports
              </Link>
            ) : null}
            {can(user.role, "fees.view") ? (
              <Link href="/finance/receivables?status=open" className="inline-flex h-10 items-center rounded-xl border border-white/50 px-4 text-sm font-semibold text-white hover:bg-white/10">
                Review outstanding fees
              </Link>
            ) : null}
          </div>
        </div>
        <HeroArt />
      </section>

      {/* Period */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          options={[
            { label: "Monthly", href: `/dashboard?period=month&month=${month}&year=${period.year}`, active: period.mode === "month" },
            { label: "Yearly", href: `/dashboard?period=year&year=${period.year}`, active: period.mode === "year" },
          ]}
        />
        <form action="/dashboard" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="period" value={period.mode} />
          <CalendarDays className="h-4 w-4 text-slate-400" />
          {period.mode === "month" ? (
            <select name="month" defaultValue={month} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm" aria-label="Month">
              {MONTH_NAMES.map((label, index) => (
                <option key={label} value={index + 1}>{label}</option>
              ))}
            </select>
          ) : null}
          <input type="number" name="year" min="2000" max="2100" defaultValue={period.year} className="h-9 w-24 rounded-xl border border-slate-200 bg-white px-3 text-sm" aria-label="Year" />
          <button className="h-9 rounded-xl bg-navy px-4 text-sm font-medium text-white hover:bg-navy-800">Show</button>
        </form>
      </div>

      {/* Finance from the accounting journal comes first */}
      {ledger ? <LedgerSections data={ledger} canRecord={canRecord} insights={board.insights} /> : null}

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Total students"
          value={students.total.toLocaleString("en-PK")}
          hint={`${students.byType[1].count} scholarship · ${students.byType[2].count} need-based`}
          icon={<GraduationCap className="h-5 w-5" />}
          tone="gold"
          tag={`+${students.admittedInPeriod} admitted`}
          href="/students"
        />
        <StatCard
          label="Staff & teachers"
          value={staff.total.toLocaleString("en-PK")}
          hint={`${staff.active} active · ${staff.teaching} teaching classes`}
          icon={<Users className="h-5 w-5" />}
          tone="teal"
          tag={staff.onLeave ? `${staff.onLeave} on leave` : "All present"}
          href="/staff"
        />
        <StatCard
          label="Total classes"
          value={classes.total.toLocaleString("en-PK")}
          hint={`${classes.programs} programs${classes.withoutTeacher ? ` · ${classes.withoutTeacher} need a teacher` : ""}`}
          icon={<BookOpen className="h-5 w-5" />}
          tone="navy"
          tag={staff.studentsPerTeacher ? `${staff.studentsPerTeacher} per teacher` : undefined}
          href="/classes"
        />
        <StatCard
          label="Fee collection"
          value={`${fees.rate}%`}
          hint={`${formatPKR(fees.collected)} of ${formatPKR(fees.billed)}`}
          icon={<Wallet className="h-5 w-5" />}
          tone={fees.rate >= 80 ? "teal" : fees.rate >= 50 ? "gold" : "rose"}
          tag={period.mode === "year" ? String(period.year) : MONTH_NAMES[month - 1]}
          href="/finance/fees"
        />
      </div>

      {accounts && !accounts.ready ? <JournalNotice /> : null}
      {!ledger && !showAccounts ? (
        <Card title="Key insights & alerts" subtitle="What needs management's attention">
          <ul className="space-y-2.5">
            {board.insights.slice(0, 6).map((insight, index) => (
              <InsightRow key={`${insight.title}-${index}`} insight={insight} />
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Students */}
      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <EnrollmentChart data={students.enrollment} total={students.total} />
        </Card>
        <Card>
          <ClassDistributionChart data={classes.rows.map((row) => ({ name: `${row.name} ${row.program}`.trim(), students: row.students }))} />
        </Card>
        <Card title="Student mix" subtitle="Active students by type and gender" className="lg:col-span-2 xl:col-span-1">
          <div className="space-y-4">
            {students.byType.map((row, index) => (
              <Meter key={row.type} label={row.label} value={row.count} total={students.total} color={[SERIES.green, SERIES.orange, SERIES.blue][index]} />
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <MiniStat label="Female" value={students.female} total={students.total} />
            <MiniStat label="Male" value={students.male} total={students.total} />
          </div>
        </Card>
      </div>

      {/* Staff, fee status, defaulters */}
      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <Card title="Staff & teachers" subtitle="Workforce and payroll" action={<Link href="/staff" className="text-sm font-medium text-orange">View all</Link>}>
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Active" value={staff.active} />
            <MiniStat label="On leave" value={staff.onLeave} />
            <MiniStat label="Left" value={staff.left} />
          </div>
          <div className="mt-5 space-y-4">
            <Meter label="Permanent" value={staff.permanent} total={staff.active} color={SERIES.green} />
            <Meter label="Visiting" value={staff.visiting} total={staff.active} color={SERIES.orange} />
            <Meter label="Teaching a class" value={staff.teaching} total={staff.active} color={SERIES.blue} />
          </div>
          {showPayroll ? (
            <div className="mt-5 rounded-2xl bg-slate-50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Payroll {scope}</span>
                <span className="font-semibold text-navy">{payroll.expected ? `${Math.round((payroll.paid / payroll.expected) * 100)}% paid` : "Not generated"}</span>
              </div>
              <Bar value={payroll.paid} total={payroll.expected} color={SERIES.green} />
              <p className="mt-2 text-xs text-slate-500">
                {formatPKR(payroll.paid)} paid · {formatPKR(payroll.pending)} pending
              </p>
            </div>
          ) : null}
        </Card>
        <Card title="Largest outstanding balances" subtitle="Across all fee months" className="xl:col-span-2" action={<Link href="/finance/receivables?status=open" className="text-sm font-medium text-orange">View all</Link>}>
          {board.defaulters.length ? (
            <ul className="divide-y divide-slate-100">
              {board.defaulters.map((row) => (
                <li key={row.id}>
                  <Link href={`/students/${row.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-peach text-sm font-semibold text-orange">
                      {row.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-navy">{row.name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {row.className} · {row.months} month{row.months === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-navy">{formatPKR(row.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl bg-sage px-4 py-6 text-center text-sm text-teal">Every student is fully paid up.</p>
          )}
        </Card>
      </div>

      {/* Academic overview + attendance */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card
          title="Academic overview"
          subtitle={`Class-wise strength, staffing and fee collection ${scope}`}
          className="xl:col-span-2"
          action={<Link href="/classes" className="text-sm font-medium text-orange">All classes</Link>}
        >
          {classes.rows.length ? (
            <div className="table-wrap -mx-2">
              <table>
                <thead>
                  <tr>
                    <th>Class</th>
                    <th>Class teacher</th>
                    <th>Students</th>
                    <th>Subjects</th>
                    <th>Fee collection</th>
                    <th>Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link href={`/classes/${row.id}`} className="font-medium text-navy hover:text-orange">{row.name}</Link>
                        <div className="text-xs text-slate-500">{row.program}</div>
                      </td>
                      <td>{row.teacher ?? <span className="rounded-full bg-peach px-2 py-0.5 text-xs font-semibold text-orange">Unassigned</span>}</td>
                      <td>{row.students}</td>
                      <td>{row.subjects}</td>
                      <td className="min-w-40">
                        {row.billed ? (
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(100, row.rate)}%`, background: row.rate >= 80 ? SERIES.green : row.rate >= 50 ? SERIES.blue : SERIES.orange }} />
                            </div>
                            <span className="w-10 text-right text-xs font-semibold text-navy">{row.rate}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">No fees billed</span>
                        )}
                      </td>
                      <td>{row.outstanding ? formatPKR(row.outstanding) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No active classes yet.</p>
          )}
          <p className="mt-3 flex items-start gap-2 text-xs text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Exam marks are not recorded in {SCHOOL_NAME} yet, so grades and pass rates are not shown. Once results are entered, class performance can be added here.
          </p>
        </Card>
        <Card title="Attendance" subtitle="Students and staff">
          <div className="flex h-full flex-col items-center justify-center rounded-2xl bg-slate-50 px-5 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-peach text-orange">
              <CalendarDays className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-navy">Attendance is not tracked yet</p>
            <p className="mt-1 max-w-xs text-xs text-slate-500">
              {SCHOOL_NAME} does not record daily attendance today, so no rates are shown rather than made-up numbers. When attendance is added, student and staff attendance rates will appear here.
            </p>
          </div>
        </Card>
      </div>

      {/* Recent activity */}
      <div className="grid gap-5 xl:grid-cols-2">
        {ledger ? null : <Card title="Recent fee payments" action={<Link href="/finance/fees" className="text-sm font-medium text-orange">View all</Link>}>
          <ActivityList
            empty="No payments recorded yet."
            rows={recent.recentPayments.filter((payment) => payment.student).map((payment) => ({
              key: payment.id,
              title: fullName(payment.student.firstName, payment.student.lastName),
              subtitle: `${formatDate(payment.paymentDate)} · ${PAYMENT_METHOD_LABELS[payment.paymentMethod]}`,
              value: formatPKR(payment.amount),
            }))}
          />
        </Card>}
        <Card title="Recently added" className={ledger ? "xl:col-span-2" : undefined} action={<Link href="/students" className="text-sm font-medium text-orange">Students</Link>}>
          <ActivityList
            empty="No students or staff added yet."
            rows={[
              ...recent.recentStudents.map((student) => ({
                key: `s-${student.id}`,
                title: fullName(student.firstName, student.lastName),
                subtitle: `Student · ${`${student.class?.name ?? ""} ${student.class?.program?.name ?? ""}`.trim()}`,
                value: formatDate(student.createdAt),
                at: student.createdAt,
                href: `/students/${student.id}`,
              })),
              ...recent.recentStaff.map((member) => ({
                key: `t-${member.id}`,
                title: fullName(member.firstName, member.lastName),
                subtitle: `Staff · ${member.qualification}`,
                value: formatDate(member.createdAt),
                at: member.createdAt,
                href: `/staff/${member.id}`,
              })),
            ]
              .sort((a, b) => String(b.at).localeCompare(String(a.at)))
              .slice(0, 6)}
          />
        </Card>
      </div>
    </div>
  );
}

function JournalNotice() {
  return (
    <Card title="Accounts" subtitle="Accounts Receivable and Bank Account">
      <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
        The accounting journal is not set up in the database yet. Run the migrations
        <code className="mx-1 rounded bg-white px-1">20261106000000_journal_entries.sql</code>
        then
        <code className="mx-1 rounded bg-white px-1">20261108000000_journal_cash_account.sql</code>
        and the dashboard&apos;s finance figures will be built from it, starting with every fee and payment already recorded.
      </p>
    </Card>
  );
}

/** Finance sections built from the double-entry journal. */
function LedgerSections({ data, canRecord, insights }: { data: FinanceDashboard; canRecord: boolean; insights: Insight[] }) {
  const { current, previous, balances, vouchers, outstanding } = data;
  const voucherTotal = vouchers.generated || 1;
  const ageTotal = outstanding.byAge.reduce((sum, row) => sum + row.amount, 0);
  const range = `&from=${data.range.from}&to=${data.range.to}`;
  return (
    <>
      <Card
        title="Finance"
        subtitle={`${data.periodLabel} · every figure is calculated from the accounting journal`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {canRecord ? <InitiateVouchersButton classes={data.classes} latest={latestVoucherMonth()} size="sm" /> : null}
            {canRecord ? <RecordPaymentButton students={data.students} label="Record payment" size="sm" variant="outline" /> : null}
            <Link href="/finance/accounts" className="text-sm font-medium text-orange">Open accounts</Link>
          </div>
        }
      >
        {canRecord && !data.issuedThisMonth ? (
          <p className="mb-4 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Fee vouchers for {data.currentMonthLabel} have not been initiated yet, so nothing has been charged for this month.
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MoneyTile
            label="Total accrued income"
            value={current.totalIncome}
            previous={previous.totalIncome}
            goodWhenUp
            note={`${formatPKR(current.feeIncome)} student fees from vouchers${current.otherIncome ? ` · ${formatPKR(current.otherIncome)} other` : ""}`}
            href={`/finance/ledger?account=FEE_INCOME${range}`}
          />
          <MoneyTile
            label="Total Accounts Receivable"
            value={balances.receivable}
            note={`Owed today · ${outstanding.studentsOwing} student${outstanding.studentsOwing === 1 ? "" : "s"}`}
            tone="bad"
            href="/finance/ledger?account=ACCOUNTS_RECEIVABLE"
          />
          <MoneyTile
            label="Total collections"
            value={current.collections}
            previous={previous.collections}
            goodWhenUp
            note={`Fee payments received in ${data.periodLabel}`}
            tone="good"
            href={`/finance/ledger?kind=FEE_PAYMENT${range}`}
          />
          <MoneyTile
            label="Bank balance"
            value={balances.bank}
            note={`${formatPKR(balances.bankIn)} in · ${formatPKR(balances.bankOut)} out`}
            highlight
            href="/finance/ledger?account=BANK"
          />
          <MoneyTile
            label="Cash balance"
            value={balances.cash}
            note={`${formatPKR(balances.cashIn)} in · ${formatPKR(balances.cashOut)} out`}
            highlight
            href="/finance/ledger?account=CASH"
          />
          <MoneyTile
            label="Outstanding fees"
            value={data.outstandingOnVouchers}
            note={
              Math.abs(data.outstandingOnVouchers - balances.receivable) < 0.01
                ? "Unpaid on fee vouchers · matches the ledger"
                : `Unpaid on fee vouchers · ledger shows ${formatPKR(balances.receivable)}`
            }
            tone="bad"
            href="/finance/receivables?status=open"
          />
          <MoneyTile
            label="Total fee vouchers"
            value={vouchers.generated}
            display={vouchers.generated.toLocaleString("en-PK")}
            note={`${data.periodLabel} · ${vouchers.paid} paid · ${vouchers.partial} partial · ${vouchers.unpaid} unpaid`}
            href={`/finance/receivables?${data.periodMonth ? `month=${data.periodMonth}&` : ""}year=${data.year}`}
          />
          <MoneyTile
            label="Overdue fees"
            value={data.overdue.amount}
            note={`${data.overdue.count} voucher${data.overdue.count === 1 ? "" : "s"} past the due date`}
            tone="bad"
            href="/finance/receivables?status=OVERDUE"
          />
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>Expenses in {data.periodLabel}: <strong className="text-navy">{formatPKR(current.expenses)}</strong></span>
          <span>{balances.entries.toLocaleString("en-PK")} journal entries</span>
          <span className={balances.balanced ? "text-teal" : "text-rose-700"}>
            {balances.balanced ? "✓ Debits equal credits" : "Debits and credits differ"} ({formatPKR(balances.totalDebit)})
          </span>
        </p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <Card title="Fee vouchers" subtitle={`Vouchers for ${data.periodLabel}`} action={<Link href="/finance/receivables" className="text-sm font-medium text-orange">View all</Link>}>
          {vouchers.generated ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="Generated" value={vouchers.generated} />
                <MiniStat label="Paid" value={vouchers.paid} total={vouchers.generated} />
                <MiniStat label="Partially paid" value={vouchers.partial} total={vouchers.generated} />
                <MiniStat label="Unpaid" value={vouchers.unpaid} total={vouchers.generated} />
              </div>
              <div className="mt-4 space-y-3">
                <Meter label="Paid" value={vouchers.paid} total={voucherTotal} color={SERIES.green} />
                <Meter label="Partially paid" value={vouchers.partial} total={voucherTotal} color={SERIES.blue} />
                <Meter label={`Unpaid${vouchers.overdue ? ` (${vouchers.overdue} overdue)` : ""}`} value={vouchers.unpaid} total={voucherTotal} color={SERIES.orange} />
                {vouchers.waived ? <Meter label="Scholarship (waived)" value={vouchers.waived} total={voucherTotal} color="#d6d0c9" /> : null}
              </div>
              <p className="mt-4 text-xs text-slate-500">
                {formatPKR(vouchers.issued)} issued · {formatPKR(vouchers.collected)} paid · {formatPKR(vouchers.outstanding)} outstanding
              </p>
            </>
          ) : (
            <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No fee vouchers have been issued for {data.periodLabel}.
            </p>
          )}
        </Card>

        <Card title="Outstanding fees" subtitle="What students still owe, across all months" action={<Link href="/finance/receivables?status=open" className="text-sm font-medium text-orange">Accounts Receivable</Link>}>
          <p className={cn("text-2xl font-bold tracking-tight", balances.receivable > 0 ? "text-rose-700" : "text-navy")}>{formatPKR(balances.receivable)}</p>
          <div className="mt-4 space-y-3">
            {outstanding.byAge.map((row, index) => (
              <div key={row.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{row.label} <span className="text-xs text-slate-400">({row.count} voucher{row.count === 1 ? "" : "s"})</span></span>
                  <span className="font-semibold text-navy">{formatPKR(row.amount)}</span>
                </div>
                <Bar value={row.amount} total={ageTotal} color={[SERIES.blue, SERIES.orange, "#be123c"][index]} />
              </div>
            ))}
          </div>
          {outstanding.byClass.length ? (
            <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 text-sm">
              {outstanding.byClass.slice(0, 5).map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-slate-600">{row.label} <span className="text-xs text-slate-400">· {row.students} student{row.students === 1 ? "" : "s"}</span></span>
                  <span className="shrink-0 font-semibold text-navy">{formatPKR(row.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-2xl bg-sage px-4 py-4 text-center text-sm text-teal">Every student is fully paid up.</p>
          )}
        </Card>

        <Card title="Recent transactions" subtitle="Latest vouchers and payments" className="lg:col-span-2 xl:col-span-1" action={<Link href="/finance/ledger" className="text-sm font-medium text-orange">Ledger</Link>}>
          {data.recent.length ? (
            <ul className="divide-y divide-slate-100">
              {data.recent.map((row) => (
                <li key={row.key}>
                  <Link href={row.href} className="flex items-start gap-3 py-2.5 hover:opacity-80">
                    <span
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        row.kind === "PAYMENT" ? "bg-sage text-teal" : row.kind === "VOUCHERS" ? "bg-peach text-orange" : "bg-slate-100 text-slate-500",
                      )}
                    >
                      {row.kind === "PAYMENT" ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-navy">{row.title}</span>
                      <span className="block truncate text-xs text-slate-500">{formatDate(row.date)} · {row.detail}</span>
                      <span className="block truncate text-xs text-slate-400">{row.recordedBy ?? "System"}</span>
                    </span>
                    <span className={cn("shrink-0 text-sm font-semibold", row.kind === "PAYMENT" ? "text-teal" : "text-navy")}>{formatPKR(row.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No vouchers or payments yet.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <LedgerTrendChart months={data.months} year={data.year} receivableNow={balances.receivable} />
        </Card>
        <Card title="Key insights & alerts" subtitle="What needs management's attention">
          <ul className="space-y-2.5">
            {insights.slice(0, 6).map((insight, index) => (
              <InsightRow key={`${insight.title}-${index}`} insight={insight} />
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function change(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function MoneyTile({
  label,
  value,
  previous,
  goodWhenUp,
  note,
  tone,
  highlight,
  href,
  display,
}: {
  label: string;
  value: number;
  /** Shown instead of the value as money, e.g. a count. */
  display?: string;
  previous?: number;
  goodWhenUp?: boolean;
  note?: string;
  tone?: "good" | "bad";
  highlight?: boolean;
  href: string;
}) {
  const delta = previous === undefined ? null : change(value, previous);
  const good = delta === null ? null : goodWhenUp ? delta >= 0 : delta <= 0;
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-2xl p-4 transition hover:-translate-y-0.5",
        highlight ? "bg-navy text-white" : "bg-slate-50 hover:bg-slate-100",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={cn("text-sm", highlight ? "text-white/70" : "text-slate-500")}>{label}</p>
        {delta !== null ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              good ? "bg-sage text-teal" : "bg-rose-50 text-rose-700",
            )}
            title="Change from the previous period"
          >
            {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta)}%
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-2 text-xl font-bold tracking-tight sm:text-2xl",
          highlight ? "text-white" : tone === "bad" && value > 0 ? "text-rose-700" : "text-navy",
        )}
      >
        {display ?? formatPKR(value)}
      </p>
      {note ? <p className={cn("mt-1 text-xs", highlight ? "text-white/70" : "text-slate-500")}>{note}</p> : null}
    </Link>
  );
}

const INSIGHT_STYLE: Record<InsightTone, { icon: typeof Info; box: string; iconClass: string; label: string }> = {
  critical: { icon: CircleAlert, box: "bg-rose-50", iconClass: "text-rose-600", label: "Urgent" },
  warning: { icon: TriangleAlert, box: "bg-amber-50", iconClass: "text-amber-600", label: "Watch" },
  info: { icon: Info, box: "bg-slate-50", iconClass: "text-slate-500", label: "Note" },
  good: { icon: CircleCheck, box: "bg-sage", iconClass: "text-teal", label: "On track" },
};

function InsightRow({ insight }: { insight: Insight }) {
  const style = INSIGHT_STYLE[insight.tone];
  const Icon = style.icon;
  return (
    <li className={cn("rounded-2xl p-3.5", style.box)}>
      <div className="flex gap-3">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.iconClass)} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy">
            <span className="sr-only">{style.label}: </span>
            {insight.title}
          </p>
          <p className="mt-0.5 text-xs text-slate-600">{insight.detail}</p>
          {insight.href ? (
            <Link href={insight.href} className="mt-1.5 inline-flex text-xs font-semibold text-orange hover:underline">
              {insight.cta ?? "Open"} →
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function Bar({ value, total, color }: { value: number; total: number; color: string }) {
  const width = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200/70">
      <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
    </div>
  );
}

function Meter({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const share = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-slate-600">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          {label}
        </span>
        <span className="font-semibold text-navy">
          {value} <span className="text-xs font-normal text-slate-400">· {share}%</span>
        </span>
      </div>
      <Bar value={value} total={total} color={color} />
    </div>
  );
}

function MiniStat({ label, value, total }: { label: string; value: number; total?: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-navy">
        {value}
        {total ? <span className="ml-1 text-xs font-normal text-slate-400">{total ? Math.round((value / total) * 100) : 0}%</span> : null}
      </p>
    </div>
  );
}

function ActivityList({
  rows,
  empty,
}: {
  rows: Array<{ key: string; title: string; subtitle: string; value: string; href?: string }>;
  empty: string;
}) {
  if (!rows.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((row) => {
        const body = (
          <>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage text-sm font-semibold text-teal">{row.title.slice(0, 1)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-navy">{row.title}</span>
              <span className="block truncate text-xs text-slate-500">{row.subtitle}</span>
            </span>
            <span className="shrink-0 text-sm font-semibold text-navy">{row.value}</span>
          </>
        );
        return (
          <li key={row.key}>
            {row.href ? (
              <Link href={row.href} className="flex items-center gap-3 py-2.5 hover:opacity-80">{body}</Link>
            ) : (
              <div className="flex items-center gap-3 py-2.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Isometric bar illustration for the hero, drawn inline so it works offline. */
function HeroArt() {
  return (
    <svg viewBox="0 0 260 180" className="pointer-events-none absolute -bottom-4 right-2 hidden h-44 w-auto opacity-95 md:block lg:right-8" aria-hidden>
      <path d="M20 128 130 74l110 54-110 54Z" fill="#ffffff" fillOpacity="0.9" />
      <path d="M20 128v8l110 54v-8Z" fill="#e6e1da" />
      <path d="M240 128v8l-110 54v-8Z" fill="#d6d0c9" />
      {[
        { x: 70, h: 52, top: "#ffffff", left: "#e4f1e9", right: "#cfe6d8" },
        { x: 100, h: 88, top: "#ffffff", left: "#e4f1e9", right: "#cfe6d8" },
        { x: 130, h: 64, top: "#3a9a6f", left: "#2e7d5b", right: "#25664a" },
        { x: 160, h: 108, top: "#ffffff", left: "#e4f1e9", right: "#cfe6d8" },
        { x: 190, h: 76, top: "#ffffff", left: "#e4f1e9", right: "#cfe6d8" },
      ].map((bar, index) => {
        const base = 122 + (index % 2 ? 4 : 0);
        const x = bar.x;
        const y = base - bar.h;
        return (
          <g key={x}>
            <path d={`M${x - 14} ${y + 7} ${x} ${y} ${x + 14} ${y + 7} ${x} ${y + 14}Z`} fill={bar.top} />
            <path d={`M${x - 14} ${y + 7} ${x} ${y + 14} ${x} ${base + 14} ${x - 14} ${base + 7}Z`} fill={bar.left} />
            <path d={`M${x + 14} ${y + 7} ${x} ${y + 14} ${x} ${base + 14} ${x + 14} ${base + 7}Z`} fill={bar.right} />
          </g>
        );
      })}
      <path d="M58 60c30-22 52 6 78-14s46-22 70-6" fill="none" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="2" strokeDasharray="4 5" />
      <circle cx="206" cy="40" r="4" fill="#ffffff" />
    </svg>
  );
}
