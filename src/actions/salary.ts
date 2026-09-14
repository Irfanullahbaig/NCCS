"use server";

import { revalidatePath } from "next/cache";
import { PaymentMethod } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { parseDateInput } from "@/lib/utils";
import { recordSalaryPayment, updateSalaryPayment, voidSalaryPayment } from "@/lib/salary";

function fail(error: string) {
  return { ok: false as const, error };
}

function refreshSalary(staffId?: string) {
  revalidatePath("/");
  revalidatePath("/finance/salaries");
  revalidatePath("/finance/expenses");
  revalidatePath("/staff");
  revalidatePath("/reports");
  if (staffId) revalidatePath(`/staff/${staffId}`);
}

export async function recordSalaryPaymentAction(formData: FormData) {
  const user = await requirePermission("salaries.record");
  try {
    const staffId = String(formData.get("staffId") ?? "");
    const amount = Number(formData.get("amount") ?? 0);
    const paymentDate = String(formData.get("paymentDate") ?? "");
    const paymentMethod = String(formData.get("paymentMethod") ?? "") as PaymentMethod;
    const month = Number(formData.get("month") ?? 0);
    const year = Number(formData.get("year") ?? 0);
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    if (!staffId || !paymentDate || !paymentMethod || !month || !year) {
      return fail("Teacher, salary month, payment date, and method are required");
    }
    await recordSalaryPayment({
      staffId,
      amount,
      paymentDate: parseDateInput(paymentDate),
      paymentMethod,
      month,
      year,
      referenceNumber: referenceNumber || null,
      notes: notes || null,
      userId: user.id,
    });
    refreshSalary(staffId);
    return { ok: true as const };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to record salary payment");
  }
}

export async function updateSalaryPaymentAction(formData: FormData) {
  const user = await requirePermission("salaries.record");
  try {
    const paymentId = String(formData.get("paymentId") ?? "");
    const staffId = String(formData.get("staffId") ?? "");
    const amount = Number(formData.get("amount") ?? 0);
    const paymentDate = String(formData.get("paymentDate") ?? "");
    const paymentMethod = String(formData.get("paymentMethod") ?? "") as PaymentMethod;
    const referenceNumber = String(formData.get("referenceNumber") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    if (!paymentId || !paymentDate || !paymentMethod) return fail("Payment details are required");
    await updateSalaryPayment({
      paymentId,
      amount,
      paymentDate: parseDateInput(paymentDate),
      paymentMethod,
      referenceNumber: referenceNumber || null,
      notes: notes || null,
      userId: user.id,
    });
    refreshSalary(staffId);
    return { ok: true as const };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to update salary payment");
  }
}

export async function voidSalaryPaymentAction(formData: FormData) {
  const user = await requirePermission("finance.void");
  try {
    const paymentId = String(formData.get("id") ?? "");
    const staffId = String(formData.get("staffId") ?? "");
    await voidSalaryPayment({
      paymentId,
      reason: String(formData.get("reason") ?? "Voided by admin").trim() || "Voided by admin",
      userId: user.id,
    });
    refreshSalary(staffId);
    return { ok: true as const };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to void salary payment");
  }
}
