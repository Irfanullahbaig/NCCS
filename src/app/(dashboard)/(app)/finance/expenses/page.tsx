import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { ImportButton } from "@/components/import-dialog";
import { importTypesFor } from "@/lib/import/specs";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { formatDate, formatPKR } from "@/lib/utils";
import { PageHeader, EmptyState, Input, Select, ViewOnlyBadge } from "@/components/ui";
import { AddExpenseButton } from "@/components/forms";
import { DeleteRecordButton, EditExpenseButton } from "@/components/finance-records";
import { EXPENSE_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("finance.view");
  const params = await searchParams;

  let expenseQuery = db().from("ExpenseTransaction").select("*, salaryPayment:SalaryPayment(id, staffId)").is("voidedAt", null).order("date", { ascending: false });
  if (params.category) expenseQuery = expenseQuery.eq("category", params.category as never);
  if (params.paymentMethod) expenseQuery = expenseQuery.eq("paymentMethod", params.paymentMethod as never);
  const rowsRes = await expenseQuery;
  if (rowsRes.error) throw rowsRes.error;

  const q = params.q?.trim().toLowerCase();
  const rows = (rowsRes.data ?? []).filter((row) => {
    if (!q) return true;
    const haystack = [row.expenseId, row.paidTo, row.description, row.referenceNumber].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(q);
  });

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Record salaries, utilities, rent, and other operating costs."
        actions={
          can(user.role, "finance.create") ? (
            <>
              {importTypesFor(user.role, ["expenses"]).length ? <ImportButton types={["expenses"]} label="Import expenses" /> : null}
              <AddExpenseButton autoOpenOn="new" />
            </>
          ) : (
            <ViewOnlyBadge />
          )
        }
      />
      <form className="mb-4 grid gap-3 rounded-3xl bg-white p-4 shadow-card md:grid-cols-4">
        <Input name="q" defaultValue={params.q} placeholder="Expense ID, paid to, reference..." />
        <Select name="category" defaultValue={params.category ?? ""}>
          <option value="">All categories</option>
          {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
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
      <div className="overflow-hidden rounded-3xl bg-white shadow-card">
        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Expense ID</th>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Paid to</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link href={`/finance/ledger?q=${encodeURIComponent(row.expenseId)}`} className="font-medium text-navy">
                        {row.expenseId}
                      </Link>
                    </td>
                    <td>{formatDate(row.date)}</td>
                    <td>{EXPENSE_CATEGORY_LABELS[row.category]}</td>
                    <td>
                      {row.paidTo}
                      {row.description ? <div className="text-xs text-slate-500">{row.description}</div> : null}
                    </td>
                    <td>{PAYMENT_METHOD_LABELS[row.paymentMethod]}</td>
                    <td>{formatPKR(row.amount)}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        {can(user.role, "finance.edit") ? (
                          <EditExpenseButton
                            expense={{
                              id: row.id,
                              expenseId: row.expenseId,
                              date: row.date,
                              amount: row.amount,
                              category: row.category,
                              paidTo: row.paidTo,
                              paymentMethod: row.paymentMethod,
                              referenceNumber: row.referenceNumber,
                              description: row.description,
                              notes: row.notes,
                              salary: Boolean(salaryOf(row)),
                            }}
                          />
                        ) : null}
                        {can(user.role, "finance.void") ? (
                          <DeleteRecordButton kind="expense" id={row.id} label={`${row.expenseId} · ${formatPKR(row.amount)}`} staffId={salaryOf(row)?.staffId} />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No expenses recorded" description="Add salaries, utilities, rent, and other operating costs." />
        )}
      </div>
    </div>
  );
}

function salaryOf(row: { salaryPayment?: { id: string; staffId: string } | Array<{ id: string; staffId: string }> | null }) {
  return Array.isArray(row.salaryPayment) ? row.salaryPayment[0] : row.salaryPayment;
}
