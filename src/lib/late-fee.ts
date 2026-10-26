import type { FeeStatus } from "@/lib/enums";
import { LATE_FEE_AMOUNT, LATE_FEE_DAY } from "@/lib/constants";
import { calendarDateFromValue, calendarDateInKarachi, feeDueDateIso, monthLabel } from "@/lib/utils";

/** Safe to import from client components: no database access here. */

export type LateFeePolicy = {
  /** Charge the late fee when part (but not all) of the fee was paid by the due date. */
  chargeOnPartial: boolean;
  /** First fee month ("YYYY-MM") that can carry a late fee. Earlier months never do. */
  startMonth: string;
};

export const DEFAULT_LATE_FEE_POLICY: LateFeePolicy = {
  chargeOnPartial: true,
  startMonth: "2026-10",
};

export const LATE_FEE_SETTING_KEYS = {
  chargeOnPartial: "lateFeeChargeOnPartial",
  startMonth: "lateFeeStartMonth",
} as const;

export type FeePaymentLike = { amount: number; paymentDate: Date | string; voidedAt?: string | null };

export type FeeStateInput = {
  year: number;
  month: number;
  expected: number;
  waived: number;
  fineWaived?: boolean | null;
  admissionDate?: Date | string | null;
  payments: FeePaymentLike[];
  policy: LateFeePolicy;
  now?: Date;
};

export type LateFeeReason =
  | "charged"
  | "not-due-yet"
  | "paid-on-time"
  | "partial-on-time"
  | "joined-after-due"
  | "before-start"
  | "fee-waived"
  | "late-fee-waived";

export function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function admissionMonthKey(admissionDate: Date | string) {
  return calendarDateFromValue(admissionDate).slice(0, 7);
}

/** Fee months before the month the student joined are never charged. */
export function isBeforeAdmission(year: number, month: number, admissionDate?: Date | string | null) {
  if (!admissionDate) return false;
  return monthKey(year, month) < admissionMonthKey(admissionDate);
}

export function sumOnTime(payments: FeePaymentLike[], year: number, month: number) {
  const due = feeDueDateIso(year, month);
  return payments
    .filter((payment) => !payment.voidedAt && calendarDateFromValue(payment.paymentDate) <= due)
    .reduce((sum, payment) => sum + Math.round(Number(payment.amount)), 0);
}

/**
 * Works out the late fee from scratch every time, so voiding, back-dating or
 * waiving a payment always lands on the same answer.
 */
export function lateFeeFor(input: FeeStateInput): { fine: number; reason: LateFeeReason } {
  const expected = Math.max(0, Math.round(input.expected));
  const waived = Math.max(0, Math.round(input.waived));
  if (expected > 0 && waived >= expected) return { fine: 0, reason: "fee-waived" };
  if (input.fineWaived) return { fine: 0, reason: "late-fee-waived" };
  if (monthKey(input.year, input.month) < input.policy.startMonth) return { fine: 0, reason: "before-start" };

  const due = feeDueDateIso(input.year, input.month);
  if (calendarDateInKarachi(input.now ?? new Date()) <= due) return { fine: 0, reason: "not-due-yet" };
  if (input.admissionDate && calendarDateFromValue(input.admissionDate) > due) {
    return { fine: 0, reason: "joined-after-due" };
  }

  const onTime = sumOnTime(input.payments, input.year, input.month);
  if (onTime + waived >= expected) return { fine: 0, reason: "paid-on-time" };
  if (onTime > 0 && !input.policy.chargeOnPartial) return { fine: 0, reason: "partial-on-time" };
  return { fine: LATE_FEE_AMOUNT, reason: "charged" };
}

/**
 * Last day before an unpaid fee counts as overdue. A student who joins after
 * the due date gets until the end of their first month.
 */
function overdueAfter(input: FeeStateInput) {
  const due = feeDueDateIso(input.year, input.month);
  if (input.admissionDate && calendarDateFromValue(input.admissionDate) > due) {
    const lastDay = new Date(Date.UTC(input.year, input.month, 0)).getUTCDate();
    return `${monthKey(input.year, input.month)}-${String(lastDay).padStart(2, "0")}`;
  }
  return due;
}

export function computeFeeState(input: FeeStateInput): {
  paid: number;
  fine: number;
  remaining: number;
  status: FeeStatus;
  reason: LateFeeReason;
} {
  const expected = Math.max(0, Math.round(input.expected));
  const waived = Math.max(0, Math.round(input.waived));
  const paid = input.payments
    .filter((payment) => !payment.voidedAt)
    .reduce((sum, payment) => sum + Math.round(Number(payment.amount)), 0);
  const { fine, reason } = lateFeeFor(input);
  const remaining = Math.max(0, expected + fine - paid - waived);

  let status: FeeStatus;
  if (expected > 0 && waived >= expected && remaining <= 0) status = "WAIVED";
  else if (remaining <= 0) status = "PAID";
  else if (paid > 0) status = "PARTIALLY_PAID";
  else if (calendarDateInKarachi(input.now ?? new Date()) > overdueAfter(input)) status = "OVERDUE";
  else status = "PENDING";

  return { paid, fine, remaining, status, reason };
}

export function lateFeeReasonLabel(reason: LateFeeReason, year: number, month: number) {
  const due = `${LATE_FEE_DAY} ${monthLabel(month, year)}`;
  switch (reason) {
    case "charged":
      return `Charged because the fee was not fully paid by ${due}.`;
    case "not-due-yet":
      return `No late fee unless the fee is still unpaid after ${due}.`;
    case "paid-on-time":
      return `No late fee: paid in full by ${due}.`;
    case "partial-on-time":
      return `No late fee: part of the fee was paid by ${due}.`;
    case "joined-after-due":
      return `No late fee: the student joined after ${due}.`;
    case "before-start":
      return "No late fee: this month is before late fees started.";
    case "fee-waived":
      return "No late fee: the whole fee is waived.";
    case "late-fee-waived":
      return "Late fee waived.";
  }
}
