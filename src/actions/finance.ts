"use server";

import { revalidatePath } from "next/cache";
import { ExpenseCategory, IncomeCategory, PaymentMethod } from "@/lib/enums";
import { requirePermission } from "@/lib/auth";
import { formatPKR, monthLabel, parseDateInput } from "@/lib/utils";
import {
  adjustFeeRecord,
  initiateFeeVouchers,
  recordExpense,
  recordIncome,
  recordStudentPayment,
  setLateFeeWaiver,
  updateExpense,
  updateIncome,
  updateStudentPayment,
  voidExpense,
  voidIncome,
} from "@/lib/finance";

function fail(error: string) {
  return { ok: false as const, error };
}

function refreshFinance() {
  revalidatePath("/dashboard");
  revalidatePath("/finance");
  revalidatePath("/finance/income");
  revalidatePath("/finance/expenses");
  revalidatePath("/finance/fees");
  revalidatePath("/finance/outstanding");
  revalidatePath("/finance/receivables");
  revalidatePath("/students");
  revalidatePath("/students/[id]", "page");
  revalidatePath("/staff/[id]", "page");
  revalidatePath("/classes");
  revalidatePath("/classes/[id]", "page");
  revalidatePath("/finance/salaries");
  revalidatePath("/finance/ledger");
  revalidatePath("/finance/profit-loss");
  revalidatePath("/finance/advances");
  revalidatePath("/reports");
}

function refreshPeople(studentIds: Array<string | null | undefined> = [], staffId?: string | null) {
  for (const id of studentIds) if (id) revalidatePath(`/students/${id}`);
  if (staffId) {
    revalidatePath("/finance/salaries");
    revalidatePath(`/staff/${staffId}`);
  }
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function voidReason(formData: FormData) {
  const reason = text(formData, "reason");
  if (!reason) throw new Error("Enter a reason for deleting this record");
  return reason;
}

export async function recordPaymentAction(formData: FormData) {
  const user = await requirePermission("fees.record");
  try {
    const studentId = String(formData.get("studentId") ?? "");
    const amount = Number(formData.get("amount") ?? 0);
    const paymentDate = String(formData.get("paymentDate") ?? "");
    const paymentMethod = String(formData.get("paymentMethod") ?? "") as PaymentMethod;
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    const category = (String(formData.get("feeType") ?? "STUDENT_FEE") || "STUDENT_FEE") as IncomeCategory;
    if (!studentId || !paymentDate || !paymentMethod) return fail("Student, date, and payment method are required");

    // Each selected fee voucher arrives as "YYYY-MM" with its own amount field.
    const periods = [...new Set(formData.getAll("period").map(String))]
      .map((value) => {
        const [year, month] = value.split("-").map(Number);
        return { key: value, year, month };
      })
      .filter((period) => period.year >= 2000 && period.month >= 1 && period.month <= 12)
      .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
    // Older single-year form fields.
    if (!periods.length) {
      const year = Number(formData.get("year") ?? 0);
      for (const month of formData.getAll("months").map(Number).filter((value) => value >= 1 && value <= 12)) {
        periods.push({ key: String(month), year, month });
      }
    }
    if (!periods.length || periods.some((period) => !period.year)) return fail("Select at least one fee month");

    let recorded = 0;
    for (const period of periods) {
      const monthAmount = Number(formData.get(`amount_${period.key}`) || amount);
      if (!monthAmount) continue;
      recorded += 1;
      await recordStudentPayment({
        studentId,
        amount: monthAmount,
        paymentDate: parseDateInput(paymentDate),
        paymentMethod,
        referenceNumber: referenceNumber || null,
        notes: notes || null,
        month: period.month,
        year: period.year,
        category,
        userId: user.id,
      });
    }
    if (!recorded) return fail("Enter an amount for at least one month");
    refreshFinance();
    revalidatePath(`/students/${studentId}`);
    return { ok: true as const };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to record payment");
  }
}

export async function createIncomeAction(formData: FormData) {
  const user = await requirePermission("finance.create");
  try {
    const date = String(formData.get("date") ?? "");
    const amount = Number(formData.get("amount") ?? 0);
    const category = String(formData.get("category") ?? "") as IncomeCategory;
    const source = String(formData.get("source") ?? "").trim();
    const studentId = String(formData.get("studentId") ?? "");
    const classId = String(formData.get("classId") ?? "");
    const paymentMethod = String(formData.get("paymentMethod") ?? "") as PaymentMethod;
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    const year = Number(formData.get("year") ?? 0);
    const months = formData.getAll("months").map(Number).filter((month) => month >= 1 && month <= 12);
    if (!date || !category || !paymentMethod) return fail("Date, category, and payment method are required");
    if (category === "STUDENT_FEE" && (!year || !months.length)) {
      return fail("Select the fee year and at least one month");
    }

    if (category === "STUDENT_FEE") {
      for (const month of months) {
        await recordIncome({
          date: parseDateInput(date),
          amount,
          category,
          source: source || null,
          studentId: studentId || null,
          classId: classId || null,
          paymentMethod,
          referenceNumber: referenceNumber || null,
          notes: notes || null,
          month,
          year,
          userId: user.id,
        });
      }
    } else {
      await recordIncome({
        date: parseDateInput(date),
        amount,
        category,
        source: source || null,
        studentId: studentId || null,
        classId: classId || null,
        paymentMethod,
        referenceNumber: referenceNumber || null,
        notes: notes || null,
        userId: user.id,
      });
    }
    refreshFinance();
    return { ok: true as const };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to add income");
  }
}

export async function createExpenseAction(formData: FormData) {
  const user = await requirePermission("finance.create");
  try {
    const date = String(formData.get("date") ?? "");
    const amount = Number(formData.get("amount") ?? 0);
    const category = String(formData.get("category") ?? "") as ExpenseCategory;
    const paidTo = String(formData.get("paidTo") ?? "").trim();
    const paymentMethod = String(formData.get("paymentMethod") ?? "") as PaymentMethod;
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    if (!date || !category || !paidTo || !paymentMethod) return fail("Please complete all required expense fields");

    await recordExpense({
      date: parseDateInput(date),
      amount,
      category,
      paidTo,
      paymentMethod,
      referenceNumber: referenceNumber || null,
      description: description || null,
      notes: notes || null,
      userId: user.id,
    });
    refreshFinance();
    return { ok: true as const };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to add expense");
  }
}

export async function voidIncomeAction(formData: FormData) {
  const user = await requirePermission("finance.void");
  try {
    await voidIncome({
      id: String(formData.get("id") ?? ""),
      reason: voidReason(formData),
      userId: user.id,
    });
    refreshFinance();
    return { ok: true as const };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to delete income");
  }
}

export async function voidExpenseAction(formData: FormData) {
  const user = await requirePermission("finance.void");
  try {
    await voidExpense({
      id: String(formData.get("id") ?? ""),
      reason: voidReason(formData),
      userId: user.id,
    });
    refreshFinance();
    return { ok: true as const };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to delete expense");
  }
}

export async function waiveLateFeeAction(formData: FormData) {
  const user = await requirePermission("fees.waive");
  try {
    const record = await setLateFeeWaiver({
      feeRecordId: String(formData.get("feeRecordId") ?? ""),
      waive: true,
      reason: String(formData.get("reason") ?? ""),
      userId: user.id,
    });
    refreshFinance();
    revalidatePath(`/students/${record.studentId}`);
    return { ok: true as const };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to waive the late fee");
  }
}

export async function restoreLateFeeAction(formData: FormData) {
  const user = await requirePermission("fees.waive");
  try {
    const record = await setLateFeeWaiver({
      feeRecordId: String(formData.get("feeRecordId") ?? ""),
      waive: false,
      userId: user.id,
    });
    refreshFinance();
    revalidatePath(`/students/${record.studentId}`);
    return { ok: true as const };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to restore the late fee");
  }
}

export async function updateIncomeAction(formData: FormData) {
  const user = await requirePermission("finance.edit");
  try {
    const date = text(formData, "date");
    const paymentMethod = text(formData, "paymentMethod") as PaymentMethod;
    const category = text(formData, "category") as IncomeCategory;
    if (!date || !paymentMethod || !category) return fail("Date, category, and payment method are required");
    const result = await updateIncome({
      id: text(formData, "id"),
      date: parseDateInput(date),
      amount: Number(formData.get("amount") ?? 0),
      category,
      source: text(formData, "source") || null,
      studentId: text(formData, "studentId") || null,
      classId: text(formData, "classId") || null,
      paymentMethod,
      referenceNumber: text(formData, "referenceNumber") || null,
      notes: text(formData, "notes") || null,
      month: Number(formData.get("month") ?? 0) || null,
      year: Number(formData.get("year") ?? 0) || null,
      userId: user.id,
    });
    refreshFinance();
    refreshPeople(result.studentIds);
    return { ok: true as const };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to update income");
  }
}

export async function updateFeePaymentAction(formData: FormData) {
  const user = await requirePermission("finance.edit");
  try {
    const paymentDate = text(formData, "paymentDate");
    const paymentMethod = text(formData, "paymentMethod") as PaymentMethod;
    if (!paymentDate || !paymentMethod) return fail("Payment date and method are required");
    const result = await updateStudentPayment({
      paymentId: text(formData, "id"),
      amount: Number(formData.get("amount") ?? 0),
      paymentDate: parseDateInput(paymentDate),
      paymentMethod,
      referenceNumber: text(formData, "referenceNumber") || null,
      notes: text(formData, "notes") || null,
      studentId: text(formData, "studentId") || null,
      month: Number(formData.get("month") ?? 0) || null,
      year: Number(formData.get("year") ?? 0) || null,
      userId: user.id,
    });
    refreshFinance();
    refreshPeople(result.studentIds);
    return { ok: true as const };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to update payment");
  }
}

export async function updateExpenseAction(formData: FormData) {
  const user = await requirePermission("finance.edit");
  try {
    const date = text(formData, "date");
    const paymentMethod = text(formData, "paymentMethod") as PaymentMethod;
    const category = text(formData, "category") as ExpenseCategory;
    if (!date || !paymentMethod || !category) return fail("Date, category, and payment method are required");
    const result = await updateExpense({
      id: text(formData, "id"),
      date: parseDateInput(date),
      amount: Number(formData.get("amount") ?? 0),
      category,
      paidTo: text(formData, "paidTo"),
      paymentMethod,
      referenceNumber: text(formData, "referenceNumber") || null,
      description: text(formData, "description") || null,
      notes: text(formData, "notes") || null,
      userId: user.id,
    });
    refreshFinance();
    refreshPeople([], result.staffId);
    return { ok: true as const };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to update expense");
  }
}

export async function adjustFeeAction(formData: FormData) {
  const user = await requirePermission("finance.edit");
  try {
    const studentId = text(formData, "studentId");
    const month = Number(formData.get("month") ?? 0);
    const year = Number(formData.get("year") ?? 0);
    if (!studentId || month < 1 || month > 12 || !year) return fail("Select the student and fee month");
    await adjustFeeRecord({
      studentId,
      month,
      year,
      expectedAmount: Number(formData.get("expectedAmount") ?? NaN),
      waivedAmount: Number(formData.get("waivedAmount") || 0),
      reason: text(formData, "reason"),
      userId: user.id,
    });
    refreshFinance();
    refreshPeople([studentId]);
    return { ok: true as const };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to adjust the fee");
  }
}

export async function initiateVouchersAction(formData: FormData) {
  const user = await requirePermission("fees.record");
  try {
    const month = Number(formData.get("month") ?? 0);
    const year = Number(formData.get("year") ?? 0);
    const classId = text(formData, "classId") || null;
    const result = await initiateFeeVouchers({ month, year, classId, userId: user.id });
    refreshFinance();
    revalidatePath("/finance/accounts");
    const label = monthLabel(result.month, result.year);
    const message = result.created
      ? `${result.created} fee voucher${result.created === 1 ? "" : "s"} issued for ${label} (${formatPKR(result.amount)} posted to Accounts Receivable)` +
        (result.existing ? `. ${result.existing} already had one.` : ".")
      : result.existing
        ? `Every student already has a voucher for ${label}. Nothing new was charged.`
        : `No active students to charge for ${label}.`;
    return { ok: true as const, created: result.created, message };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to initiate fee vouchers");
  }
}
