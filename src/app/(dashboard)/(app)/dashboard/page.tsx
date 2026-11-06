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
import { getReceivables } from "@/lib/receivables";
import { periodFromParams } from "@/lib/period";
import { getSchoolName } from "@/lib/school";
import { cn, formatDate, formatPKR, fullName, MONTH_NAMES } from "@/lib/utils";
import { PAYMENT_METHOD_LABELS, SCHOOL_NAME } from "@/lib/constants";
import { Card, Segmented, StatCard } from "@/components/ui";
import { ClassDistributionChart, EnrollmentChart, FinanceTrendChart, SERIES } from "@/components/board-charts";

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
  const showReceivables = can(user.role, "fees.view");
  const [board, recent, schoolName, receivables] = await Promise.all([
    getBoardOverview(period, { finance: showFinance, payroll: showPayroll }),
    getDashboardData(),
    getSchoolName(),
    showReceivables ? getReceivables(period) : null,
  ]);
  const { students, staff, classes, fees, finance, payroll } = board;
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
              <Link href="/finance/outstanding" className="inline-flex h-10 items-center rounded-xl border border-white/50 px-4 text-sm font-semibold text-white hover:bg-white/10">
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
            { label: "Monthly", href: `/?period=month&month=${month}&year=${period.year}`, active: period.mode === "month" },
            { label: "Yearly", href: `/?period=year&year=${period.year}`, active: period.mode === "year" },
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

      {/* Financial overview */}
      <Card title="Financial overview" subtitle={`Totals ${scope}${finance ? `, compared with the previous ${period.mode === "year" ? "year" : "month"}` : ""}`}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {finance ? (
            <>
              <MoneyTile label="Total income" value={finance.income} previous={finance.prevIncome} goodWhenUp href="/finance/income" />
              <MoneyTile label="Total expenses" value={finance.expenses} previous={finance.prevExpenses} goodWhenUp={false} href="/finance/expenses" />
            </>
          ) : (
            <>
              <MoneyTile label="Fees billed" value={fees.billed} href="/finance/fees" />
              <MoneyTile label="Fees collected" value={fees.collected} href="/finance/fees" />
            </>
          )}
          <MoneyTile
            label="Outstanding fees"
            value={fees.outstanding}
            note={`${formatPKR(fees.allTimeOutstanding)} owed across all months`}
            tone={fees.outstanding > 0 ? "bad" : undefined}
            href="/finance/outstanding"
          />
          {finance ? (
            <MoneyTile
              label="Available balance"
              value={finance.balance}
              note={`All income minus all expenses · net ${scope}: ${formatPKR(finance.net)}`}
              tone={finance.balance < 0 ? "bad" : "good"}
              highlight
              href="/finance/ledger"
            />
          ) : (
            <MoneyTile label="Late fees charged" value={fees.lateFees} note={`${formatPKR(fees.unpaidLateFees)} still unpaid`} href="/finance/fees" />
          )}
        </div>
      </Card>

      {/* Receivables */}
      {receivables ? (
        <Card
          title="Receivables"
          subtitle={`Expected fees from all enrolled students ${scope}, split into what is received and what is still owed`}
          action={<Link href={`/finance/receivables?period=${period.mode}&month=${month}&year=${period.year}`} className="text-sm font-medium text-orange">View details</Link>}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <MoneyTile
              label="Expected income"
              value={receivables.expected}
              note={`${receivables.enrolledStudents} enrolled students at their fixed fee`}
              href={`/finance/receivables?period=${period.mode}&month=${month}&year=${period.year}`}
            />
            <MoneyTile
              label="Received (in Income)"
              value={receivables.received}
              note={`${receivables.rate}% of expected`}
              tone="good"
              href="/finance/income?category=STUDENT_FEE"
            />
            <MoneyTile
              label="Receivables"
              value={receivables.receivable}
              note={`${receivables.studentsOwing} student${receivables.studentsOwing === 1 ? "" : "s"} still owe`}
              tone="bad"
              highlight
              href={`/finance/receivables?period=${period.mode}&month=${month}&year=${period.year}`}
            />
          </div>
          <Bar value={receivables.received} total={receivables.expected} color={SERIES.green} />
        </Card>
      ) : null}

      {/* Finance chart + insights */}
      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <FinanceTrendChart money={finance?.monthly ?? []} fees={fees.monthly} year={period.year} showMoney={Boolean(finance)} />
        </Card>
        <Card title="Key insights & alerts" subtitle="What needs management's attention">
          <ul className="space-y-2.5">
            {board.insights.slice(0, 6).map((insight, index) => (
              <InsightRow key={`${insight.title}-${index}`} insight={insight} />
            ))}
          </ul>
        </Card>
      </div>

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
        <Card title="Fee status" subtitle={`Student fee records ${scope}`}>
          <div className="space-y-4">
            <Meter label="Paid in full" value={fees.paid} total={fees.paid + fees.partial + fees.pending + fees.overdue + fees.waivedCount} color={SERIES.green} />
            <Meter label="Part paid" value={fees.partial} total={fees.paid + fees.partial + fees.pending + fees.overdue + fees.waivedCount} color={SERIES.blue} />
            <Meter label="Pending (not yet due)" value={fees.pending} total={fees.paid + fees.partial + fees.pending + fees.overdue + fees.waivedCount} color="#a8a29e" />
            <Meter label="Overdue" value={fees.overdue} total={fees.paid + fees.partial + fees.pending + fees.overdue + fees.waivedCount} color={SERIES.orange} />
            <Meter label="Waived / scholarship" value={fees.waivedCount} total={fees.paid + fees.partial + fees.pending + fees.overdue + fees.waivedCount} color="#d6d0c9" />
          </div>
          <p className="mt-5 text-xs text-slate-500">
            {formatPKR(fees.waived)} waived · {formatPKR(fees.lateFees)} in late fees charged
          </p>
        </Card>
        <Card title="Largest outstanding balances" subtitle="Across all fee months" className="lg:col-span-2 xl:col-span-1" action={<Link href="/finance/outstanding" className="text-sm font-medium text-orange">View all</Link>}>
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
        <Card title="Recent fee payments" action={<Link href="/finance/fees" className="text-sm font-medium text-orange">View all</Link>}>
          <ActivityList
            empty="No payments recorded yet."
            rows={recent.recentPayments.filter((payment) => payment.student).map((payment) => ({
              key: payment.id,
              title: fullName(payment.student.firstName, payment.student.lastName),
              subtitle: `${formatDate(payment.paymentDate)} · ${PAYMENT_METHOD_LABELS[payment.paymentMethod]}`,
              value: formatPKR(payment.amount),
            }))}
          />
        </Card>
        <Card title="Recently added" action={<Link href="/students" className="text-sm font-medium text-orange">Students</Link>}>
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
}: {
  label: string;
  value: number;
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
        {formatPKR(value)}
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
