"use server";

import { revalidatePath } from "next/cache";
import { ExpenseCategory, IncomeCategory, PaymentMethod } from "@/lib/enums";
import { requirePermission } from "@/lib/auth";
import { parseDateInput } from "@/lib/utils";
import {
  recordExpense,
  recordIncome,
  recordStudentPayment,
  voidExpense,
  voidIncome,
} from "@/lib/finance";

function fail(error: string) {
  return { ok: false as const, error };
}

function refreshFinance() {
  revalidatePath("/");
  revalidatePath("/finance");
  revalidatePath("/finance/income");
  revalidatePath("/finance/expenses");
  revalidatePath("/finance/fees");
  revalidatePath("/finance/outstanding");
  revalidatePath("/students");
  revalidatePath("/classes");
  revalidatePath("/finance/ledger");
  revalidatePath("/finance/profit-loss");
  revalidatePath("/finance/advances");
  revalidatePath("/reports");
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
    const year = Number(formData.get("year") ?? 0);
    const category = (String(formData.get("feeType") ?? "STUDENT_FEE") || "STUDENT_FEE") as IncomeCategory;
    const months = formData.getAll("months").map(Number).filter((month) => month >= 1 && month <= 12);
    if (!studentId || !paymentDate || !paymentMethod) return fail("Student, date, and payment method are required");
    if (!year || !months.length) return fail("Select the fee year and at least one month");

    for (const month of months) {
      const monthAmount = Number(formData.get(`amount_${month}`) || amount);
      if (!monthAmount) continue;
      await recordStudentPayment({
        studentId,
        amount: monthAmount,
        paymentDate: parseDateInput(paymentDate),
        paymentMethod,
        referenceNumber: referenceNumber || null,
        notes: notes || null,
        month,
        year,
        category,
        userId: user.id,
      });
    }
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
    if (!date || !category || !paymentMethod) return fail("Date, category, and payment method are required");

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
      reason: String(formData.get("reason") ?? "Voided by admin").trim() || "Voided by admin",
      userId: user.id,
    });
    refreshFinance();
    return { ok: true as const };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to void income");
  }
}

export async function voidExpenseAction(formData: FormData) {
  const user = await requirePermission("finance.void");
  try {
    await voidExpense({
      id: String(formData.get("id") ?? ""),
      reason: String(formData.get("reason") ?? "Voided by admin").trim() || "Voided by admin",
      userId: user.id,
    });
    refreshFinance();
    return { ok: true as const };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to void expense");
  }
}
