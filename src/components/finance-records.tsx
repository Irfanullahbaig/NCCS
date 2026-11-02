"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  adjustFeeAction,
  updateExpenseAction,
  updateFeePaymentAction,
  updateIncomeAction,
  voidExpenseAction,
  voidIncomeAction,
} from "@/actions/finance";
import { voidSalaryPaymentAction } from "@/actions/salary";
import { Button, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";
import {
  classOptionLabel,
  Modal,
  StudentSearchField,
  useFeeMonths,
  useSubmit,
  type ClassOption,
  type StudentOption,
} from "@/components/forms";
import { EXPENSE_CATEGORY_LABELS, INCOME_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { calendarDateInKarachi, formatPKR, MONTH_NAMES } from "@/lib/utils";

/** Edit, adjust and delete controls for financial records (Admin and Accountant). */

function dateInput(value: string) {
  return String(value).slice(0, 10);
}

function FormFooter({ error, pending, onClose, label }: { error: string | null; pending: boolean; onClose: () => void; label: string }) {
  return (
    <div className="space-y-3 sm:col-span-2">
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving..." : label}</Button>
      </div>
    </div>
  );
}

function MethodField({ defaultValue }: { defaultValue: string }) {
  return (
    <Field label="Payment method">
      <Select name="paymentMethod" defaultValue={defaultValue} required>
        {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </Select>
    </Field>
  );
}

function EditTrigger({ onClick, label = "Edit" }: { onClick: () => void; label?: string }) {
  return (
    <Button size="sm" variant="outline" onClick={onClick}>
      <Pencil className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Button>
  );
}

// ---------------------------------------------------------------- Delete

type DeleteKind = "income" | "expense" | "salary";

const DELETE_ACTIONS = {
  income: voidIncomeAction,
  expense: voidExpenseAction,
  salary: voidSalaryPaymentAction,
};

/**
 * Deleting never erases the row: it is marked deleted with a reason, drops out
 * of every total, and stays visible in the audit history.
 */
export function DeleteRecordButton({
  kind,
  id,
  label,
  staffId,
  linkedFee,
}: {
  kind: DeleteKind;
  id: string;
  /** What is being deleted, e.g. "INC-2026-0012 · Rs. 5,000". */
  label: string;
  staffId?: string;
  /** True when this income is a student fee payment, so the fee balance reopens. */
  linkedFee?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { error, pending, submit } = useSubmit();
  return (
    <>
      <Button size="sm" variant="ghost" className="text-rose-700 hover:bg-rose-50" onClick={() => setOpen(true)}>
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        Delete
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Delete this record?">
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            await submit(DELETE_ACTIONS[kind], new FormData(event.currentTarget), "Record deleted. Totals have been updated.", () => setOpen(false));
          }}
        >
          <input type="hidden" name="id" value={id} />
          {staffId ? <input type="hidden" name="staffId" value={staffId} /> : null}
          <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">
            <p className="font-semibold">{label}</p>
            <p className="mt-1">
              It will be removed from all totals, balances and reports.
              {linkedFee ? " The student's fee for that month will show as unpaid again." : ""}
              {kind === "salary" ? " The staff member's salary for that month will show as unpaid again." : ""}
              {" "}The original stays in the audit history.
            </p>
          </div>
          <Field label="Reason for deleting">
            <Textarea name="reason" required placeholder="e.g. Entered twice by mistake" />
          </Field>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="danger" disabled={pending}>{pending ? "Deleting..." : "Delete record"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------- Fee payments

export type FeePaymentInitial = {
  id: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  referenceNumber: string | null;
  notes: string | null;
  studentId: string;
  month: number;
  year: number;
};

function FeePaymentEditForm({
  open,
  onClose,
  payment,
  students,
}: {
  open: boolean;
  onClose: () => void;
  payment: FeePaymentInitial;
  /** When given, the payment can also be moved to another student. */
  students?: StudentOption[];
}) {
  const { error, pending, submit } = useSubmit();
  const [studentId, setStudentId] = useState(payment.studentId);
  const thisYear = new Date().getFullYear();
  const years = [...new Set([payment.year, thisYear - 1, thisYear, thisYear + 1])].sort();

  return (
    <Modal open={open} onClose={onClose} title="Edit fee payment">
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          await submit(updateFeePaymentAction, new FormData(event.currentTarget), "Payment updated. Fee balance and totals recalculated.", onClose);
        }}
      >
        <input type="hidden" name="id" value={payment.id} />
        {students ? (
          <Field label="Student" className="sm:col-span-2">
            <StudentSearchField students={students} value={studentId} required onChange={(student) => setStudentId(student?.id ?? "")} />
          </Field>
        ) : (
          <input type="hidden" name="studentId" value={payment.studentId} />
        )}
        <Field label="Fee month">
          <Select name="month" defaultValue={payment.month}>
            {MONTH_NAMES.map((label, index) => (
              <option key={label} value={index + 1}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Fee year">
          <Select name="year" defaultValue={payment.year}>
            {years.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </Select>
        </Field>
        <Field label="Amount paid"><Input type="number" min="1" name="amount" defaultValue={payment.amount} required /></Field>
        <Field label="Payment date">
          <Input type="date" name="paymentDate" defaultValue={dateInput(payment.paymentDate)} max={calendarDateInKarachi()} required />
        </Field>
        <MethodField defaultValue={payment.paymentMethod} />
        <Field label="Reference number"><Input name="referenceNumber" defaultValue={payment.referenceNumber ?? ""} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={payment.notes ?? ""} /></Field>
        <p className="text-xs text-slate-500 sm:col-span-2">
          Changing the student or fee month moves this payment: a corrected receipt is recorded and the old one is kept as deleted in the history.
        </p>
        <FormFooter error={error} pending={pending} onClose={onClose} label="Save changes" />
      </form>
    </Modal>
  );
}

export function EditFeePaymentButton({ payment, students }: { payment: FeePaymentInitial; students?: StudentOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <EditTrigger onClick={() => setOpen(true)} />
      {open ? <FeePaymentEditForm open onClose={() => setOpen(false)} payment={payment} students={students} /> : null}
    </>
  );
}

// ---------------------------------------------------------------- Income

export type IncomeInitial = {
  id: string;
  incomeId: string;
  date: string;
  amount: number;
  category: string;
  source: string | null;
  studentId: string | null;
  classId: string | null;
  paymentMethod: string;
  referenceNumber: string | null;
  notes: string | null;
  /** Set when this income is a student fee payment. */
  feePayment?: Omit<FeePaymentInitial, "amount" | "paymentDate" | "paymentMethod" | "referenceNumber" | "notes"> | null;
};

function IncomeEditForm({
  open,
  onClose,
  income,
  students,
  classes,
}: {
  open: boolean;
  onClose: () => void;
  income: IncomeInitial;
  students: StudentOption[];
  classes: ClassOption[];
}) {
  const { error, pending, submit } = useSubmit();
  const [studentId, setStudentId] = useState(income.studentId ?? "");
  const [classId, setClassId] = useState(income.classId ?? "");
  // Student fees are changed through their fee payment, so they cannot be picked here.
  const categories = Object.entries(INCOME_CATEGORY_LABELS).filter(([value]) => value !== "STUDENT_FEE" || income.category === "STUDENT_FEE");

  return (
    <Modal open={open} onClose={onClose} title={`Edit income ${income.incomeId}`}>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          await submit(updateIncomeAction, new FormData(event.currentTarget), "Income updated. Totals recalculated.", onClose);
        }}
      >
        <input type="hidden" name="id" value={income.id} />
        <Field label="Date"><Input type="date" name="date" defaultValue={dateInput(income.date)} max={calendarDateInKarachi()} required /></Field>
        <Field label="Amount"><Input type="number" min="1" name="amount" defaultValue={income.amount} required /></Field>
        <Field label="Income category">
          <Select name="category" defaultValue={income.category} required>
            {categories.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Source"><Input name="source" defaultValue={income.source ?? ""} /></Field>
        <Field label="Student" className="sm:col-span-2">
          <StudentSearchField
            students={students}
            value={studentId}
            placeholder="Optional"
            onChange={(student) => {
              setStudentId(student?.id ?? "");
              if (student?.classId) setClassId(student.classId);
            }}
          />
        </Field>
        <Field label="Class">
          <Select name="classId" value={classId} onChange={(event) => setClassId(event.target.value)}>
            <option value="">Optional</option>
            {classes.map((item) => (
              <option key={item.id} value={item.id}>{classOptionLabel(item)}</option>
            ))}
          </Select>
        </Field>
        <MethodField defaultValue={income.paymentMethod} />
        <Field label="Reference number"><Input name="referenceNumber" defaultValue={income.referenceNumber ?? ""} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={income.notes ?? ""} /></Field>
        <FormFooter error={error} pending={pending} onClose={onClose} label="Save changes" />
      </form>
    </Modal>
  );
}

export function EditIncomeButton({
  income,
  students,
  classes,
}: {
  income: IncomeInitial;
  students: StudentOption[];
  classes: ClassOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <EditTrigger onClick={() => setOpen(true)} />
      {!open ? null : income.feePayment ? (
        <FeePaymentEditForm
          open
          onClose={() => setOpen(false)}
          students={students}
          payment={{
            ...income.feePayment,
            amount: income.amount,
            paymentDate: income.date,
            paymentMethod: income.paymentMethod,
            referenceNumber: income.referenceNumber,
            notes: income.notes,
          }}
        />
      ) : (
        <IncomeEditForm open onClose={() => setOpen(false)} income={income} students={students} classes={classes} />
      )}
    </>
  );
}

// ---------------------------------------------------------------- Expenses

export type ExpenseInitial = {
  id: string;
  expenseId: string;
  date: string;
  amount: number;
  category: string;
  paidTo: string;
  paymentMethod: string;
  referenceNumber: string | null;
  description: string | null;
  notes: string | null;
  /** Salary and advance payments keep their category and payee. */
  salary?: boolean;
};

export function EditExpenseButton({ expense }: { expense: ExpenseInitial }) {
  const [open, setOpen] = useState(false);
  const { error, pending, submit } = useSubmit();
  const close = () => setOpen(false);
  return (
    <>
      <EditTrigger onClick={() => setOpen(true)} />
      <Modal open={open} onClose={close} title={`Edit expense ${expense.expenseId}`}>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            await submit(updateExpenseAction, new FormData(event.currentTarget), "Expense updated. Totals recalculated.", close);
          }}
        >
          <input type="hidden" name="id" value={expense.id} />
          <Field label="Date"><Input type="date" name="date" defaultValue={dateInput(expense.date)} max={calendarDateInKarachi()} required /></Field>
          <Field label="Amount"><Input type="number" min="1" name="amount" defaultValue={expense.amount} required /></Field>
          {expense.salary ? (
            <>
              <input type="hidden" name="category" value={expense.category} />
              <input type="hidden" name="paidTo" value={expense.paidTo} />
              <p className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-600 sm:col-span-2">
                Salary payment to <span className="font-semibold text-navy">{expense.paidTo}</span>. The staff member&apos;s salary record is updated as well.
              </p>
            </>
          ) : (
            <>
              <Field label="Category">
                <Select name="category" defaultValue={expense.category} required>
                  {Object.entries(EXPENSE_CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Paid to"><Input name="paidTo" defaultValue={expense.paidTo} required /></Field>
            </>
          )}
          <MethodField defaultValue={expense.paymentMethod} />
          <Field label="Reference number"><Input name="referenceNumber" defaultValue={expense.referenceNumber ?? ""} /></Field>
          {expense.salary ? null : (
            <Field label="Description" className="sm:col-span-2"><Input name="description" defaultValue={expense.description ?? ""} /></Field>
          )}
          <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={expense.notes ?? ""} /></Field>
          <FormFooter error={error} pending={pending} onClose={close} label="Save changes" />
        </form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------- Receivables

/** Change the fee or discount a student owes for one month. */
export function AdjustFeeButton({
  studentId,
  studentName,
  defaultMonth,
  defaultYear,
  label = "Adjust",
}: {
  studentId: string;
  studentName: string;
  defaultMonth?: number;
  defaultYear?: number;
  label?: string;
}) {
  const now = new Date();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(defaultYear ?? now.getFullYear());
  const [month, setMonth] = useState(defaultMonth ?? now.getMonth() + 1);
  // Typed values; until the user types, the month's saved fee and discount are shown.
  const [typed, setTyped] = useState<{ expected?: string; waived?: string }>({});
  const { error, pending, submit } = useSubmit();
  const fees = useFeeMonths(open ? studentId : "", year);
  const current = fees.months.find((row) => row.month === month);
  const close = () => setOpen(false);

  const expected = typed.expected ?? (current ? String(current.expected) : "");
  const waived = typed.waived ?? (current ? String(current.waived) : "");

  const newExpected = Number(expected) || 0;
  const newWaived = Number(waived) || 0;
  const newBalance = current ? Math.max(0, newExpected - newWaived + current.fine - current.paid) : 0;

  return (
    <>
      <EditTrigger onClick={() => { setTyped({}); setOpen(true); }} label={label} />
      <Modal open={open} onClose={close} title={`Adjust fee — ${studentName}`}>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            await submit(adjustFeeAction, new FormData(event.currentTarget), "Fee adjusted. Receivables and totals recalculated.", close);
          }}
        >
          <input type="hidden" name="studentId" value={studentId} />
          <Field label="Fee month">
            <Select name="month" value={month} onChange={(event) => { setMonth(Number(event.target.value)); setTyped({}); }}>
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={index + 1}>{name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Fee year">
            <Input type="number" name="year" min="2000" max="2100" value={year} onChange={(event) => { setYear(Number(event.target.value)); setTyped({}); }} required />
          </Field>
          <div className="rounded-2xl bg-slate-50 p-4 text-sm sm:col-span-2">
            {fees.loading ? (
              <p className="text-slate-500">Loading this month&apos;s fee...</p>
            ) : fees.error ? (
              <p className="text-rose-700">{fees.error}</p>
            ) : current?.blocked ? (
              <p className="text-slate-600">{current.blockedReason}, so there is no fee to adjust.</p>
            ) : current ? (
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Fee" value={formatPKR(current.expected)} />
                <Stat label="Discount" value={formatPKR(current.waived)} />
                <Stat label="Paid" value={formatPKR(current.paid)} />
                <Stat label="Still owed" value={formatPKR(current.remaining)} />
              </dl>
            ) : null}
          </div>
          <Field label="Fee for this month">
            <Input type="number" min="0" name="expectedAmount" value={expected} onChange={(event) => setTyped({ ...typed, expected: event.target.value })} required />
          </Field>
          <Field label="Discount / waiver">
            <Input type="number" min="0" name="waivedAmount" value={waived} onChange={(event) => setTyped({ ...typed, waived: event.target.value })} />
          </Field>
          <Field label="Reason for the change" className="sm:col-span-2">
            <Textarea name="reason" required placeholder="e.g. Sibling discount agreed by the principal" />
          </Field>
          {current && !current.blocked ? (
            <p className="text-sm text-slate-600 sm:col-span-2">
              New balance for {MONTH_NAMES[month - 1]} {year}: <span className="font-semibold text-navy">{formatPKR(newBalance)}</span>
              {current.fine ? ` (includes ${formatPKR(current.fine)} late fee)` : ""}
            </p>
          ) : null}
          <FormFooter error={error} pending={pending || Boolean(current?.blocked)} onClose={close} label="Save adjustment" />
        </form>
      </Modal>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-semibold text-navy">{value}</dd>
    </div>
  );
}
