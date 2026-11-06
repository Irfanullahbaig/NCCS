import Image from "next/image";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { voucherNumber } from "@/lib/accounting";
import { BRAND_LOGO, FEE_STATUS_LABELS, PAYMENT_METHOD_LABELS, SCHOOL_FULL_NAME } from "@/lib/constants";
import { formatDate, formatDateTime, formatPKR, fullName, monthLabel } from "@/lib/utils";
import { PrintToolbar } from "@/components/print-toolbar";

export const metadata = { title: "Payment receipt" };

/**
 * Printable receipt for one fee payment, or for several recorded together
 * (one per fee voucher), passed as comma-separated payment ids.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  await requirePermission("fees.view");
  const ids = decodeURIComponent((await params).paymentId).split(",").map((id) => id.trim()).filter(Boolean).slice(0, 24);
  if (!ids.length) notFound();
  const { data, error } = await db()
    .from("FeePayment")
    .select("*, incomeTransaction:IncomeTransaction(incomeId), feeRecord:FeeRecord(*), student:Student(id, firstName, lastName, fatherName, registrationNo, class:Class(name, program:Program(name)))")
    .in("id", ids);
  if (error) throw error;
  const payments = (data ?? []).sort((a, b) => (a.feeRecord?.year ?? 0) * 12 + (a.feeRecord?.month ?? 0) - ((b.feeRecord?.year ?? 0) * 12 + (b.feeRecord?.month ?? 0)));
  if (!payments.length) notFound();
  const first = payments[0];
  const student = first.student;
  const userIds = [...new Set(payments.map((payment) => payment.createdById).filter((id): id is string => Boolean(id)))];
  const usersRes = userIds.length ? await db().from("User").select("id, name").in("id", userIds) : { data: [] as Array<{ id: string; name: string }> };
  const receivedBy = (usersRes.data ?? []).map((row) => row.name).join(", ");
  const live = payments.filter((payment) => !payment.voidedAt);
  const total = live.reduce((sum, payment) => sum + payment.amount, 0);
  const receiptNos = payments.map((payment) => payment.incomeTransaction?.incomeId ?? payment.id.slice(0, 8));
  const methods = [...new Set(payments.map((payment) => PAYMENT_METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod))].join(", ");
  const references = [...new Set(payments.map((payment) => payment.referenceNumber).filter(Boolean))].join(", ");

  return (
    <div className="report-preview-shell">
      <article className="print-report-page mx-auto max-w-3xl bg-white p-8">
        <PrintToolbar backHref="/finance/receivables" backLabel="Back to receivables" />
        <header className="mb-6 flex items-start justify-between gap-4 border-b pb-4">
          <div>
            <Image src={BRAND_LOGO.src} alt={BRAND_LOGO.alt} width={BRAND_LOGO.width} height={BRAND_LOGO.height} className="mb-3 h-12 w-auto" priority />
            <h1 className="text-xl font-semibold text-navy">{SCHOOL_FULL_NAME}</h1>
            <p className="text-sm text-slate-500">Fee payment receipt</p>
          </div>
          <div className="text-right text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Receipt no.</p>
            <p className="text-lg font-bold text-navy">{receiptNos.join(", ")}</p>
            <p className="text-slate-500">{formatDate(first.paymentDate)}</p>
          </div>
        </header>

        {payments.some((payment) => payment.voidedAt) ? (
          <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">
            A payment on this receipt was deleted and its journal entry reversed. Deleted lines are not counted in the total.
          </p>
        ) : null}

        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Row label="Student" value={student ? fullName(student.firstName, student.lastName) : "—"} />
          <Row label="Student ID" value={student?.registrationNo ?? "—"} />
          <Row label="Father's name" value={student?.fatherName ?? "—"} />
          <Row label="Class / program" value={student?.class ? `${student.class.name} ${student.class.program?.name ?? ""}`.trim() : "—"} />
          <Row label="Payment method" value={methods} />
          <Row label="Transaction reference" value={references || "—"} />
        </dl>

        <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Fee voucher</th>
                <th className="px-3 py-2">Month</th>
                <th className="px-3 py-2 text-right">Voucher</th>
                <th className="px-3 py-2 text-right">Received</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => {
                const record = payment.feeRecord;
                const voucherTotal = record ? Math.max(0, record.expectedAmount - record.waivedAmount) + (record.fineAmount ?? 0) : 0;
                return (
                  <tr key={payment.id} className={payment.voidedAt ? "border-t border-slate-100 text-slate-400 line-through" : "border-t border-slate-100"}>
                    <td className="px-3 py-2">{record ? voucherNumber(record.year, record.month, student?.registrationNo, record.id) : "—"}</td>
                    <td className="px-3 py-2">{record ? monthLabel(record.month, record.year) : "—"}</td>
                    <td className="px-3 py-2 text-right">{formatPKR(voucherTotal)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatPKR(payment.amount)}</td>
                    <td className="px-3 py-2 text-right">{formatPKR(record?.remainingAmount ?? 0)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{record ? FEE_STATUS_LABELS[record.status as keyof typeof FEE_STATUS_LABELS] ?? record.status : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td className="px-3 py-3 font-semibold text-navy" colSpan={3}>Total received</td>
                <td className="px-3 py-3 text-right text-lg font-bold text-navy">{formatPKR(total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Posted to the journal as DR {methods === "Cash" ? "Cash Account" : "Bank Account"} / CR Accounts Receivable for each voucher.
        </p>

        <footer className="mt-10 flex items-end justify-between gap-4 border-t pt-4 text-xs text-slate-500">
          <span>Received by {receivedBy || "—"} · recorded {formatDateTime(first.createdAt)}</span>
          <span className="border-t border-slate-400 px-8 pt-1">Signature</span>
        </footer>
      </article>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium text-navy">{value}</dd>
    </div>
  );
}
