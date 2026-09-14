import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { formatPKR, fullName } from "@/lib/utils";
import { PageHeader, EmptyState, Input, Select, ViewOnlyBadge } from "@/components/ui";
import { AddIncomeButton, VoidButton } from "@/components/forms";
import { INCOME_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";

export default async function IncomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("finance.view");
  const params = await searchParams;
  const where: Prisma.IncomeTransactionWhereInput = {
    ...(params.includeVoided === "1" ? {} : { voidedAt: null }),
    ...(params.q
      ? {
          OR: [
            { incomeId: { contains: params.q } },
            { source: { contains: params.q } },
            { referenceNumber: { contains: params.q } },
            { student: { firstName: { contains: params.q } } },
            { student: { lastName: { contains: params.q } } },
          ],
        }
      : {}),
    ...(params.category ? { category: params.category as never } : {}),
    ...(params.paymentMethod ? { paymentMethod: params.paymentMethod as never } : {}),
    ...(params.from || params.to
      ? {
          date: {
            ...(params.from ? { gte: new Date(params.from) } : {}),
            ...(params.to ? { lte: new Date(params.to) } : {}),
          },
        }
      : {}),
  };

  const [rows, students, classes] = await Promise.all([
    prisma.incomeTransaction.findMany({
      where,
      orderBy: { date: "desc" },
      include: { student: true, class: { include: { program: true } } },
    }),
    prisma.student.findMany({
      where: { deletedAt: null },
      include: { class: { include: { program: true } } },
      orderBy: { firstName: "asc" },
    }),
    prisma.class.findMany({ include: { program: true } }),
  ]);

  return (
    <div>
      <PageHeader
        title="Income"
        subtitle="Student fee income automatically updates the student fee record, class dashboard, and outstanding balance."
        actions={
          can(user.role, "finance.create") ? (
            <AddIncomeButton
              students={students.map((student) => ({
                id: student.id,
                name: `${fullName(student.firstName, student.lastName)}`,
                classId: student.classId,
                fatherName: student.fatherName,
                registrationNo: student.registrationNo,
                classLabel: `${student.class.name} ${student.class.program.name}`,
              }))}
              classes={classes.map((item) => ({
                id: item.id,
                name: item.name,
                program: item.program.name,
                feeAmount: item.feeAmount,
              }))}
            />
          ) : (
            <ViewOnlyBadge />
          )
        }
      />
      <form className="mb-4 grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:grid-cols-6">
        <Input name="q" defaultValue={params.q} placeholder="Transaction ID, student, source..." className="md:col-span-2" />
        <Input type="date" name="from" defaultValue={params.from} />
        <Input type="date" name="to" defaultValue={params.to} />
        <Select name="category" defaultValue={params.category ?? ""}>
          <option value="">All categories</option>
          {Object.entries(INCOME_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
        <Select name="paymentMethod" defaultValue={params.paymentMethod ?? ""}>
          <option value="">All methods</option>
          {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
        <button className="h-10 rounded-xl bg-navy text-sm font-medium text-white">Filter</button>
      </form>
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Income ID</th>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Student / source</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={row.voidedAt ? "opacity-50" : ""}>
                    <td>{row.incomeId}</td>
                    <td>{row.date.toLocaleDateString()}</td>
                    <td>{INCOME_CATEGORY_LABELS[row.category]}</td>
                    <td>
                      {row.student ? fullName(row.student.firstName, row.student.lastName) : row.source || "—"}
                      {row.class ? <div className="text-xs text-slate-500">{row.class.name} {row.class.program.name}</div> : null}
                    </td>
                    <td>{PAYMENT_METHOD_LABELS[row.paymentMethod]}</td>
                    <td>{formatPKR(row.amount)}</td>
                    <td>
                      {!row.voidedAt && can(user.role, "finance.void") ? <VoidButton id={row.id} type="income" /> : row.voidedAt ? "Voided" : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No income recorded" description="Add income or record a student fee payment to populate this ledger." />
        )}
      </div>
    </div>
  );
}
