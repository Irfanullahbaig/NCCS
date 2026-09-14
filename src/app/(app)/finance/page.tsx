import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getFinanceDashboard } from "@/lib/queries";
import { formatPKR, parseDateInput } from "@/lib/utils";
import { Card, PageHeader, StatCard, Select, Input, ViewOnlyBadge } from "@/components/ui";
import { FinanceCharts } from "@/components/charts";
import { AddExpenseButton, AddIncomeButton } from "@/components/forms";
import { INCOME_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { fullName } from "@/lib/utils";

export default async function FinanceDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("finance.analytics");
  const params = await searchParams;
  const [data, classes, programs, years, students] = await Promise.all([
    getFinanceDashboard({
      from: params.from ? parseDateInput(params.from) : undefined,
      to: params.to ? parseDateInput(params.to) : undefined,
      academicYearId: params.academicYearId,
      classId: params.classId,
      programId: params.programId,
      category: params.category,
      paymentMethod: params.paymentMethod,
    }),
    prisma.class.findMany({ include: { program: true }, orderBy: { name: "asc" } }),
    prisma.program.findMany({ orderBy: { name: "asc" } }),
    prisma.academicYear.findMany({ orderBy: { startDate: "desc" } }),
    prisma.student.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      include: { class: { include: { program: true } } },
      orderBy: { firstName: "asc" },
    }),
  ]);

  const classOptions = classes.map((item) => ({
    id: item.id,
    name: item.name,
    program: item.program.name,
    feeAmount: item.feeAmount,
  }));
  const studentOptions = students.map((student) => ({
    id: student.id,
    name: `${fullName(student.firstName, student.lastName)}`,
    classId: student.classId,
    fatherName: student.fatherName,
    registrationNo: student.registrationNo,
    classLabel: `${student.class.name} ${student.class.program.name}`,
  }));

  return (
    <div>
      <PageHeader
        title="Financial dashboard"
        subtitle="Income, expenses, and fee collection are calculated from posted transactions — never from a manual status field."
        actions={
          can(user.role, "finance.create") ? (
            <>
              <Link href="/finance/outstanding" className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-sm">Outstanding</Link>
              <AddExpenseButton />
              <AddIncomeButton students={studentOptions} classes={classOptions} />
            </>
          ) : (
            <ViewOnlyBadge />
          )
        }
      />
      <form className="mb-4 grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:grid-cols-7">
        <Input type="date" name="from" defaultValue={params.from} />
        <Input type="date" name="to" defaultValue={params.to} />
        <Select name="academicYearId" defaultValue={params.academicYearId ?? ""}>
          <option value="">Academic year</option>
          {years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
        </Select>
        <Select name="classId" defaultValue={params.classId ?? ""}>
          <option value="">Class</option>
          {classOptions.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.program}</option>)}
        </Select>
        <Select name="programId" defaultValue={params.programId ?? ""}>
          <option value="">Program</option>
          {programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
        </Select>
        <Select name="category" defaultValue={params.category ?? ""}>
          <option value="">Income category</option>
          {Object.entries(INCOME_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <Select name="paymentMethod" defaultValue={params.paymentMethod ?? ""}>
          <option value="">Payment method</option>
          {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <button className="h-10 rounded-xl bg-navy text-sm font-medium text-white md:col-span-7 lg:col-span-1">Filter</button>
      </form>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total income" value={formatPKR(data.totalIncome)} />
        <StatCard label="Total expenses" value={formatPKR(data.totalExpenses)} tone="rose" />
        <StatCard label="Net balance" value={formatPKR(data.netBalance)} tone="navy" />
        <StatCard label="Fee collection" value={formatPKR(data.feeCollection)} />
        <StatCard label="Outstanding fees" value={formatPKR(data.outstanding)} tone="gold" />
        <StatCard label="Today's income" value={formatPKR(data.todayIncome)} />
        <StatCard label="This month's income" value={formatPKR(data.monthIncome)} tone="teal" />
        <StatCard label="This month's expenses" value={formatPKR(data.monthExpenses)} tone="rose" />
      </div>
      <Card title="Trends" className="mt-6">
        <FinanceCharts data={data.monthlySeries} />
      </Card>
      <Card title="Recent income" className="mt-6" action={<Link href="/finance/income" className="text-sm text-teal">All income</Link>}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Category</th>
                <th>Source</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.recentIncome.map((row) => (
                <tr key={row.id}>
                  <td>{row.incomeId}</td>
                  <td>{row.date.toLocaleDateString()}</td>
                  <td>{INCOME_CATEGORY_LABELS[row.category]}</td>
                  <td>{row.source || (row.student ? fullName(row.student.firstName, row.student.lastName) : "—")}</td>
                  <td>{formatPKR(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
