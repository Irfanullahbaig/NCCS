import type { ExpenseCategory, Gender, IncomeCategory, PaymentMethod, StudentStatus, StudentType } from "@/lib/enums";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { syncLedger } from "@/lib/accounting";
import {
  adjustFeeRecord,
  getStudentFeeMonths,
  invalidateFeeMaintenance,
  recalculateFeeRecord,
  recordExpense,
  recordIncome,
  recordStudentPayment,
  type FeeMonthState,
} from "@/lib/finance";
import { createStudentRecord } from "@/lib/students";
import {
  EXPENSE_CATEGORY_LABELS,
  GENDER_LABELS,
  INCOME_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  STUDENT_STATUS_LABELS,
  STUDENT_TYPE_LABELS,
} from "@/lib/constants";
import { parseAmountValue, parseDateValue, parseEnumValue, parseMonthValue, readImportRows } from "@/lib/import/csv";
import {
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  IMPORT_SPECS,
  type ImportPreview,
  type ImportResult,
  type ImportType,
  type PreviewRow,
} from "@/lib/import/specs";
import { calendarDateFromValue, calendarDateInKarachi, formatPKR, monthLabel, parseDateInput } from "@/lib/utils";

/**
 * CSV import: every row is checked against the live database first (preview),
 * and the same checks run again right before saving. Rows are saved through the
 * same functions the forms use, so fees, income and receivables stay in step.
 * If any row fails while saving, everything this file added is undone.
 */

type Undo = () => Promise<void>;
type Planned = PreviewRow & { run?: () => Promise<Undo> };
type Raw = Record<string, string>;

function lower(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

// ---------------------------------------------------------------- Shared lookups

type StudentRef = {
  id: string;
  registrationNo: string;
  firstName: string;
  lastName: string;
  fatherName: string;
  classId: string;
  dateOfAdmission: string;
  deletedAt: string | null;
};

async function loadStudents() {
  const res = await db()
    .from("Student")
    .select("id, registrationNo, firstName, lastName, fatherName, classId, dateOfAdmission, deletedAt");
  if (res.error) throw res.error;
  const all = (res.data ?? []) as StudentRef[];
  return { all, byReg: new Map(all.map((student) => [lower(student.registrationNo), student])) };
}

type Students = Awaited<ReturnType<typeof loadStudents>>;

function findStudent(students: Students, registrationNo: string, messages: string[]) {
  if (!registrationNo) {
    messages.push("Registration No is missing");
    return null;
  }
  const student = students.byReg.get(lower(registrationNo));
  if (!student) messages.push(`No student with registration number ${registrationNo}`);
  else if (student.deletedAt) messages.push(`Student ${registrationNo} has been deleted`);
  return student && !student.deletedAt ? student : null;
}

function requireText(raw: Raw, key: string, label: string, messages: string[]) {
  const value = (raw[key] ?? "").trim();
  if (!value) messages.push(`${label} is missing`);
  return value;
}

function requireAmount(raw: Raw, key: string, label: string, messages: string[], options: { allowZero?: boolean } = {}) {
  const text = (raw[key] ?? "").trim();
  if (!text) {
    messages.push(`${label} is missing`);
    return null;
  }
  const amount = parseAmountValue(text);
  if (amount === null) messages.push(`${label} "${text}" is not a number`);
  else if (amount < 0 || (!options.allowZero && amount === 0)) messages.push(`${label} must be ${options.allowZero ? "zero or more" : "more than zero"}`);
  else return amount;
  return null;
}

function requirePastDate(raw: Raw, key: string, label: string, messages: string[]) {
  const text = (raw[key] ?? "").trim();
  if (!text) {
    messages.push(`${label} is missing`);
    return null;
  }
  const date = parseDateValue(text);
  if (!date) messages.push(`${label} "${text}" is not a valid date (use YYYY-MM-DD or DD/MM/YYYY)`);
  else if (date > calendarDateInKarachi()) messages.push(`${label} ${date} is in the future`);
  else return date;
  return null;
}

function requireEnum<T extends string>(raw: Raw, key: string, label: string, labels: Record<T, string>, messages: string[]) {
  const text = (raw[key] ?? "").trim();
  if (!text) {
    messages.push(`${label} is missing`);
    return null;
  }
  const value = parseEnumValue(text, labels);
  if (!value) messages.push(`${label} "${text}" is not one of: ${Object.values(labels).join(", ")}`);
  return value;
}

function requireFeeMonth(raw: Raw, messages: string[]) {
  const month = parseMonthValue(raw.month ?? "");
  if (!raw.month) messages.push("Fee Month is missing");
  else if (!month) messages.push(`Fee Month "${raw.month}" is not 1-12 or a month name`);
  const year = Number(raw.year);
  if (!raw.year) messages.push("Fee Year is missing");
  else if (!Number.isInteger(year) || year < 2000 || year > 2100) messages.push(`Fee Year "${raw.year}" is not valid`);
  return month && Number.isInteger(year) && year >= 2000 && year <= 2100 ? { month, year } : null;
}

/** Fee month states per student and year, loaded once. */
function feeMonthCache() {
  const cache = new Map<string, Promise<FeeMonthState[]>>();
  return (studentId: string, year: number) => {
    const key = `${studentId}:${year}`;
    if (!cache.has(key)) cache.set(key, getStudentFeeMonths(studentId, year));
    return cache.get(key)!;
  };
}

// ---------------------------------------------------------------- Undo helpers

function undoFeePayment(paymentId: string, incomeId: string, feeRecordId: string): Undo {
  return async () => {
    const payment = await db().from("FeePayment").delete().eq("id", paymentId);
    if (payment.error) throw payment.error;
    const income = await db().from("IncomeTransaction").delete().eq("id", incomeId);
    if (income.error) throw income.error;
    await recalculateFeeRecord(feeRecordId);
  };
}

function undoIncome(id: string): Undo {
  return async () => {
    const { error } = await db().from("IncomeTransaction").delete().eq("id", id);
    if (error) throw error;
  };
}

// ---------------------------------------------------------------- Students

async function studentsPlanner(userId: string) {
  const [students, classesRes] = await Promise.all([
    loadStudents(),
    db().from("Class").select("id, name, code, feeAmount, status, program:Program(name)"),
  ]);
  if (classesRes.error) throw classesRes.error;
  const classes = classesRes.data ?? [];
  const seenReg = new Set<string>();
  const seenPerson = new Set<string>();
  const personKey = (first: string, last: string, father: string, classId: string, admitted: string) =>
    [first, last, father, classId, admitted].map(lower).join("|");
  const existingPeople = new Set(
    students.all
      .filter((student) => !student.deletedAt)
      .map((student) => personKey(student.firstName, student.lastName, student.fatherName, student.classId, calendarDateFromValue(student.dateOfAdmission))),
  );

  return (line: number, raw: Raw): Planned => {
    const messages: string[] = [];
    const firstName = requireText(raw, "firstName", "First Name", messages);
    const lastName = requireText(raw, "lastName", "Last Name", messages);
    const fatherName = requireText(raw, "fatherName", "Father Name", messages);
    // Excel stores 03001234567 as the number 3001234567; put the leading 0 back.
    const contactText = requireText(raw, "contactNumber", "Contact Number", messages);
    const contactNumber = /^3\d{9}$/.test(contactText) ? `0${contactText}` : contactText;
    const address = requireText(raw, "address", "Address", messages);
    const gender = requireEnum<Gender>(raw, "gender", "Gender", GENDER_LABELS, messages);
    const admittedText = (raw.dateOfAdmission ?? "").trim();
    const admitted = admittedText ? parseDateValue(admittedText) : null;
    if (!admittedText) messages.push("Admission Date is missing");
    else if (!admitted) messages.push(`Admission Date "${admittedText}" is not a valid date (use YYYY-MM-DD or DD/MM/YYYY)`);

    const classText = (raw.class ?? "").trim();
    let schoolClass: (typeof classes)[number] | null = null;
    if (!classText) messages.push("Class is missing");
    else {
      const byCode = classes.filter((item) => lower(item.code) === lower(classText));
      let matches = byCode.length ? byCode : classes.filter((item) => lower(item.name) === lower(classText));
      if (raw.program) matches = matches.filter((item) => lower(item.program?.name) === lower(raw.program));
      if (!matches.length) messages.push(`Class "${classText}"${raw.program ? ` in ${raw.program}` : ""} was not found`);
      else if (matches.length > 1) messages.push(`More than one class is called "${classText}"; add the Program column or use the class code`);
      else schoolClass = matches[0];
    }

    const studentType = raw.studentType ? parseEnumValue<StudentType>(raw.studentType, STUDENT_TYPE_LABELS) : "SELF";
    if (!studentType) messages.push(`Student Type "${raw.studentType}" is not one of: ${Object.values(STUDENT_TYPE_LABELS).join(", ")}`);
    const status = raw.status ? parseEnumValue<StudentStatus>(raw.status, STUDENT_STATUS_LABELS) : "ACTIVE";
    if (!status) messages.push(`Status "${raw.status}" is not one of: ${Object.values(STUDENT_STATUS_LABELS).join(", ")}`);
    let feeAmount = schoolClass?.feeAmount ?? 0;
    if (raw.feeAmount) {
      const parsed = parseAmountValue(raw.feeAmount);
      if (parsed === null || parsed < 0) messages.push(`Monthly Fee "${raw.feeAmount}" is not a valid amount`);
      else feeAmount = parsed;
    }
    const email = (raw.email ?? "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) messages.push(`Email "${email}" is not valid`);
    const registrationNo = (raw.registrationNo ?? "").trim();
    if (registrationNo.length > 40) messages.push("Registration No is too long");

    const summary = `${[firstName, lastName].filter(Boolean).join(" ") || "—"}${registrationNo ? ` · ${registrationNo}` : ""}${schoolClass ? ` · ${schoolClass.name}` : ""}`;
    if (messages.length) return { line, status: "invalid", summary, messages, raw };

    if (registrationNo) {
      const existing = students.byReg.get(lower(registrationNo));
      if (existing) {
        return { line, status: "duplicate", summary, raw, messages: [`Registration No ${registrationNo} already belongs to ${existing.firstName} ${existing.lastName}${existing.deletedAt ? " (deleted)" : ""}`] };
      }
      if (seenReg.has(lower(registrationNo))) return { line, status: "duplicate", summary, raw, messages: [`Registration No ${registrationNo} appears earlier in this file`] };
      seenReg.add(lower(registrationNo));
    }
    const person = personKey(firstName, lastName, fatherName, schoolClass!.id, admitted!);
    if (existingPeople.has(person)) return { line, status: "duplicate", summary, raw, messages: ["A student with the same name, father, class and admission date already exists"] };
    if (seenPerson.has(person)) return { line, status: "duplicate", summary, raw, messages: ["The same student appears earlier in this file"] };
    seenPerson.add(person);

    return {
      line,
      status: "valid",
      summary,
      raw,
      messages: schoolClass!.status !== "ACTIVE" ? ["Class is inactive"] : [],
      run: async () => {
        const created = await createStudentRecord({
          registrationNo: registrationNo || null,
          firstName,
          lastName,
          fatherName,
          classId: schoolClass!.id,
          dateOfAdmission: parseDateInput(admitted!),
          gender: gender!,
          contactNumber,
          email: email || null,
          address,
          studentType: studentType!,
          feeAmount,
          status: status!,
          userId,
          auditDetails: { source: "CSV import" },
        });
        return async () => {
          const fees = await db().from("FeeRecord").delete().eq("studentId", created.id);
          if (fees.error) throw fees.error;
          const student = await db().from("Student").delete().eq("id", created.id);
          if (student.error) throw student.error;
          invalidateFeeMaintenance();
        };
      },
    };
  };
}

// ---------------------------------------------------------------- Fee collections

async function feesPlanner(userId: string, students: Students, rawRows: Raw[]) {
  const ids = [...new Set(rawRows.map((raw) => students.byReg.get(lower(raw.registrationNo))?.id).filter((id): id is string => Boolean(id)))];
  const existingRes = ids.length
    ? await db()
        .from("FeePayment")
        .select("studentId, amount, paymentDate, referenceNumber, feeRecord:FeeRecord(month, year)")
        .in("studentId", ids)
        .is("voidedAt", null)
    : { data: [], error: null };
  if (existingRes.error) throw existingRes.error;
  const key = (studentId: string, month: number, year: number, amount: number, date: string, reference: string) =>
    [studentId, month, year, amount, date, lower(reference)].join("|");
  const existing = new Set(
    (existingRes.data ?? []).flatMap((payment) => {
      const record = Array.isArray(payment.feeRecord) ? payment.feeRecord[0] : payment.feeRecord;
      return record ? [key(payment.studentId, record.month, record.year, payment.amount, calendarDateFromValue(payment.paymentDate), payment.referenceNumber ?? "")] : [];
    }),
  );
  const seen = new Set<string>();
  const months = feeMonthCache();
  // What earlier rows in this file pay towards each month, in total and by the due date.
  const pending = new Map<string, { total: number; onTime: number }>();

  return async (line: number, raw: Raw): Promise<Planned> => {
    const messages: string[] = [];
    const student = findStudent(students, (raw.registrationNo ?? "").trim(), messages);
    const period = requireFeeMonth(raw, messages);
    const amount = requireAmount(raw, "amount", "Amount", messages);
    const date = requirePastDate(raw, "paymentDate", "Payment Date", messages);
    const method = requireEnum<PaymentMethod>(raw, "paymentMethod", "Payment Method", PAYMENT_METHOD_LABELS, messages);
    const reference = (raw.referenceNumber ?? "").trim();
    const summary = `${student ? `${student.firstName} ${student.lastName}` : raw.registrationNo || "—"} · ${period ? monthLabel(period.month, period.year) : "—"} · ${amount !== null ? formatPKR(amount) : "—"}`;
    if (messages.length) return { line, status: "invalid", summary, messages, raw };

    const dupKey = key(student!.id, period!.month, period!.year, amount!, date!, reference);
    if (existing.has(dupKey)) return { line, status: "duplicate", summary, raw, messages: ["This payment is already recorded"] };
    if (seen.has(dupKey)) return { line, status: "duplicate", summary, raw, messages: ["The same payment appears earlier in this file"] };

    const state = (await months(student!.id, period!.year)).find((row) => row.month === period!.month)!;
    if (state.blocked) return { line, status: "invalid", summary, raw, messages: [`${state.blockedReason}, so there is no fee for ${state.label}`] };
    if (state.status === "WAIVED") return { line, status: "invalid", summary, raw, messages: [`${state.label} is fully waived and needs no payment`] };
    const monthKey = `${student!.id}:${period!.year}:${period!.month}`;
    const earlier = pending.get(monthKey) ?? { total: 0, onTime: 0 };
    const already = earlier.total;
    const paidByDue = date! <= state.dueDate ? amount! : 0;
    const base = Math.max(0, state.expected - state.waived - state.paid);
    // Same rule as the server: no late fee once the fee is fully covered by the due date.
    const coveredOnTime = state.onTimePaid + earlier.onTime + paidByDue + state.waived >= state.expected;
    const fine = coveredOnTime ? 0 : Math.max(state.fine, state.lateFeeIfPaidLate);
    const maxDue = Math.max(0, base + fine - already);
    if (amount! > maxDue) {
      return {
        line,
        status: "invalid",
        summary,
        raw,
        messages: [maxDue ? `Only ${formatPKR(maxDue)} is owed for ${state.label}${already ? " after earlier rows in this file" : ""}` : `${state.label} is already fully paid`],
      };
    }
    seen.add(dupKey);
    pending.set(monthKey, { total: already + amount!, onTime: earlier.onTime + paidByDue });

    return {
      line,
      status: "valid",
      summary,
      raw,
      messages: [],
      run: async () => {
        const result = await recordStudentPayment({
          studentId: student!.id,
          amount: amount!,
          paymentDate: parseDateInput(date!),
          paymentMethod: method!,
          referenceNumber: reference || null,
          notes: (raw.notes ?? "").trim() || null,
          month: period!.month,
          year: period!.year,
          userId,
        });
        return undoFeePayment(result.payment.id, result.income.id, result.feeRecordId);
      },
    };
  };
}

// ---------------------------------------------------------------- Receivables

async function receivablesPlanner(userId: string, students: Students) {
  const months = feeMonthCache();
  const seen = new Set<string>();
  return async (line: number, raw: Raw): Promise<Planned> => {
    const messages: string[] = [];
    const student = findStudent(students, (raw.registrationNo ?? "").trim(), messages);
    const period = requireFeeMonth(raw, messages);
    const expected = requireAmount(raw, "expectedAmount", "Fee Amount", messages, { allowZero: true });
    let waived = 0;
    if (raw.waivedAmount) {
      const parsed = parseAmountValue(raw.waivedAmount);
      if (parsed === null || parsed < 0) messages.push(`Discount "${raw.waivedAmount}" is not a valid amount`);
      else waived = parsed;
    }
    const reason = requireText(raw, "reason", "Reason", messages);
    if (expected !== null && waived > expected) messages.push("Discount cannot be more than the fee");
    const summary = `${student ? `${student.firstName} ${student.lastName}` : raw.registrationNo || "—"} · ${period ? monthLabel(period.month, period.year) : "—"} · ${expected !== null ? formatPKR(expected - waived) : "—"}`;
    if (messages.length) return { line, status: "invalid", summary, messages, raw };

    const monthKey = `${student!.id}:${period!.year}:${period!.month}`;
    if (seen.has(monthKey)) return { line, status: "duplicate", summary, raw, messages: ["The same student and month appear earlier in this file"] };
    const state = (await months(student!.id, period!.year)).find((row) => row.month === period!.month)!;
    if (state.blocked) return { line, status: "invalid", summary, raw, messages: [`${state.blockedReason}, so there is no fee for ${state.label}`] };
    if (state.feeRecordId && state.expected === expected && state.waived === waived) {
      return { line, status: "duplicate", summary, raw, messages: [`${state.label} is already set to these amounts`] };
    }
    if (state.paid > expected! - waived + state.fine) {
      return { line, status: "invalid", summary, raw, messages: [`${formatPKR(state.paid)} is already paid for ${state.label}, more than the new amount`] };
    }
    seen.add(monthKey);

    return {
      line,
      status: "valid",
      summary,
      raw,
      messages: state.feeRecordId ? [`Changes ${formatPKR(state.expected - state.waived)} to ${formatPKR(expected! - waived)}`] : [],
      run: async () => {
        const before = state.feeRecordId
          ? await db().from("FeeRecord").select("id, expectedAmount, waivedAmount").eq("id", state.feeRecordId).single()
          : null;
        if (before?.error) throw before.error;
        const record = await adjustFeeRecord({
          studentId: student!.id,
          month: period!.month,
          year: period!.year,
          expectedAmount: expected!,
          waivedAmount: waived,
          reason: `CSV import: ${reason}`,
          userId,
        });
        return async () => {
          if (before?.data) {
            const { error } = await db()
              .from("FeeRecord")
              .update({ expectedAmount: before.data.expectedAmount, waivedAmount: before.data.waivedAmount })
              .eq("id", before.data.id);
            if (error) throw error;
            await recalculateFeeRecord(before.data.id);
          } else {
            const { error } = await db().from("FeeRecord").delete().eq("id", record.id);
            if (error) throw error;
          }
          invalidateFeeMaintenance();
        };
      },
    };
  };
}

// ---------------------------------------------------------------- Income and expenses

async function existingKeys(table: "IncomeTransaction" | "ExpenseTransaction", rawRows: Raw[]) {
  const dates = rawRows.map((raw) => parseDateValue(raw.date ?? "")).filter((date): date is string => Boolean(date)).sort();
  if (!dates.length) return [];
  const res = await db()
    .from(table)
    .select("*")
    .is("voidedAt", null)
    .gte("date", `${dates[0]}T00:00:00.000Z`)
    .lte("date", `${dates[dates.length - 1]}T23:59:59.999Z`);
  if (res.error) throw res.error;
  return (res.data ?? []) as Array<Record<string, unknown>>;
}

const OTHER_INCOME = Object.fromEntries(Object.entries(INCOME_CATEGORY_LABELS).filter(([code]) => code !== "STUDENT_FEE")) as Record<Exclude<IncomeCategory, "STUDENT_FEE">, string>;

async function incomePlanner(userId: string, students: Students, rawRows: Raw[]) {
  const key = (date: string, amount: number, category: string, reference: string, source: string) =>
    [date, amount, category, reference ? `ref:${lower(reference)}` : `src:${lower(source)}`].join("|");
  const existing = new Set(
    (await existingKeys("IncomeTransaction", rawRows)).map((row) =>
      key(calendarDateFromValue(String(row.date)), Number(row.amount), String(row.category), String(row.referenceNumber ?? ""), String(row.source ?? "")),
    ),
  );
  const seen = new Set<string>();
  return (line: number, raw: Raw): Planned => {
    const messages: string[] = [];
    const date = requirePastDate(raw, "date", "Date", messages);
    const amount = requireAmount(raw, "amount", "Amount", messages);
    let category: IncomeCategory | null = null;
    if (parseEnumValue<IncomeCategory>(raw.category ?? "", INCOME_CATEGORY_LABELS) === "STUDENT_FEE") {
      messages.push("Monthly student fees must be imported as fee collections so the fee balance updates");
    } else category = requireEnum(raw, "category", "Category", OTHER_INCOME, messages);
    const method = requireEnum<PaymentMethod>(raw, "paymentMethod", "Payment Method", PAYMENT_METHOD_LABELS, messages);
    const student = raw.registrationNo ? findStudent(students, raw.registrationNo.trim(), messages) : null;
    const source = (raw.source ?? "").trim();
    const reference = (raw.referenceNumber ?? "").trim();
    const summary = `${date ?? "—"} · ${category ? INCOME_CATEGORY_LABELS[category] : raw.category || "—"} · ${amount !== null ? formatPKR(amount) : "—"}${source ? ` · ${source}` : ""}`;
    if (messages.length) return { line, status: "invalid", summary, messages, raw };

    const dupKey = key(date!, amount!, category!, reference, source);
    if (existing.has(dupKey)) return { line, status: "duplicate", summary, raw, messages: ["An income entry with the same date, amount, category and reference/source already exists"] };
    if (seen.has(dupKey)) return { line, status: "duplicate", summary, raw, messages: ["The same entry appears earlier in this file"] };
    seen.add(dupKey);
    return {
      line,
      status: "valid",
      summary,
      raw,
      messages: [],
      run: async () => {
        const result = await recordIncome({
          date: parseDateInput(date!),
          amount: amount!,
          category: category!,
          source: source || null,
          studentId: student?.id ?? null,
          classId: student?.classId ?? null,
          paymentMethod: method!,
          referenceNumber: reference || null,
          notes: (raw.notes ?? "").trim() || null,
          userId,
        });
        return undoIncome(result.income.id);
      },
    };
  };
}

async function expensePlanner(userId: string, rawRows: Raw[]) {
  const key = (date: string, amount: number, category: string, paidTo: string, reference: string) =>
    [date, amount, category, lower(paidTo), lower(reference)].join("|");
  const existing = new Set(
    (await existingKeys("ExpenseTransaction", rawRows)).map((row) =>
      key(calendarDateFromValue(String(row.date)), Number(row.amount), String(row.category), String(row.paidTo ?? ""), String(row.referenceNumber ?? "")),
    ),
  );
  const seen = new Set<string>();
  return (line: number, raw: Raw): Planned => {
    const messages: string[] = [];
    const date = requirePastDate(raw, "date", "Date", messages);
    const amount = requireAmount(raw, "amount", "Amount", messages);
    const category = requireEnum<ExpenseCategory>(raw, "category", "Category", EXPENSE_CATEGORY_LABELS, messages);
    const paidTo = requireText(raw, "paidTo", "Paid To", messages);
    const method = requireEnum<PaymentMethod>(raw, "paymentMethod", "Payment Method", PAYMENT_METHOD_LABELS, messages);
    const reference = (raw.referenceNumber ?? "").trim();
    const summary = `${date ?? "—"} · ${category ? EXPENSE_CATEGORY_LABELS[category] : raw.category || "—"} · ${amount !== null ? formatPKR(amount) : "—"}${paidTo ? ` · ${paidTo}` : ""}`;
    if (messages.length) return { line, status: "invalid", summary, messages, raw };

    const dupKey = key(date!, amount!, category!, paidTo, reference);
    if (existing.has(dupKey)) return { line, status: "duplicate", summary, raw, messages: ["An expense with the same date, amount, category, payee and reference already exists"] };
    if (seen.has(dupKey)) return { line, status: "duplicate", summary, raw, messages: ["The same entry appears earlier in this file"] };
    seen.add(dupKey);
    return {
      line,
      status: "valid",
      summary,
      raw,
      messages: category === "SALARIES" ? ["Salary expenses imported here are not linked to a staff salary record"] : [],
      run: async () => {
        const expense = await recordExpense({
          date: parseDateInput(date!),
          amount: amount!,
          category: category!,
          paidTo,
          paymentMethod: method!,
          referenceNumber: reference || null,
          description: (raw.description ?? "").trim() || null,
          notes: (raw.notes ?? "").trim() || null,
          userId,
        });
        return async () => {
          const { error } = await db().from("ExpenseTransaction").delete().eq("id", expense.id);
          if (error) throw error;
        };
      },
    };
  };
}

// ---------------------------------------------------------------- Mixed transactions

function asFeeRow(raw: Raw): Raw {
  return { ...raw, paymentDate: raw.date ?? "" };
}

async function transactionsPlanner(userId: string, students: Students, rawRows: Raw[]) {
  const isFee = (raw: Raw) =>
    lower(raw.direction) === "income" && parseEnumValue<IncomeCategory>(raw.category ?? "", INCOME_CATEGORY_LABELS) === "STUDENT_FEE";
  const feeRows = rawRows.filter(isFee).map(asFeeRow);
  const incomeRows = rawRows.filter((raw) => lower(raw.direction) === "income" && !isFee(raw)).map((raw) => ({ ...raw, source: raw.party ?? "" }));
  const expenseRows = rawRows.filter((raw) => lower(raw.direction) === "expense").map((raw) => ({ ...raw, paidTo: raw.party ?? "" }));
  const [fee, income, expense] = await Promise.all([
    feesPlanner(userId, students, feeRows),
    incomePlanner(userId, students, incomeRows),
    expensePlanner(userId, expenseRows),
  ]);
  return async (line: number, raw: Raw): Promise<Planned> => {
    const direction = lower(raw.direction);
    let planned: Planned;
    if (isFee(raw)) planned = await fee(line, asFeeRow(raw));
    else if (direction === "income") planned = income(line, { ...raw, source: raw.party ?? "" });
    else if (direction === "expense") planned = expense(line, { ...raw, paidTo: raw.party ?? "" });
    else return { line, status: "invalid", summary: raw.category || "—", raw, messages: [raw.direction ? `Type "${raw.direction}" must be Income or Expense` : "Type is missing (Income or Expense)"] };
    // Keep the original row (with Type and Source / Paid To) for the error report.
    return { ...planned, raw, summary: `${direction === "income" ? "Income" : "Expense"} · ${planned.summary}` };
  };
}

// ---------------------------------------------------------------- Entry points

async function plan(type: ImportType, text: string, fileName: string, userId: string) {
  const preview: ImportPreview = { type, fileName, total: 0, valid: 0, invalid: 0, duplicates: 0, fileErrors: [], unknownColumns: [], rows: [] };
  if (new TextEncoder().encode(text).length > IMPORT_MAX_BYTES) {
    preview.fileErrors.push(`The file is larger than ${Math.round(IMPORT_MAX_BYTES / 1024)} KB. Split it into smaller files.`);
    return { preview, planned: [] as Planned[] };
  }
  if (/\u0000/.test(text)) {
    preview.fileErrors.push("This does not look like a CSV text file.");
    return { preview, planned: [] as Planned[] };
  }
  const { rows, missing, unknown, duplicateHeaders } = readImportRows(type, text);
  preview.unknownColumns = unknown;
  if (missing.length) preview.fileErrors.push(`Missing required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}. Download the template to see the expected headers.`);
  if (duplicateHeaders.length) preview.fileErrors.push(`Columns appear more than once: ${duplicateHeaders.join(", ")}`);
  if (!rows.length) preview.fileErrors.push("The file has no data rows.");
  if (rows.length > IMPORT_MAX_ROWS) preview.fileErrors.push(`The file has ${rows.length} rows; the limit is ${IMPORT_MAX_ROWS} per import.`);
  preview.total = rows.length;
  if (preview.fileErrors.length) return { preview, planned: [] as Planned[] };

  const raws = rows.map((row) => row.raw);
  const students = type === "students" || type === "expenses" ? null : await loadStudents();
  const planner: (line: number, raw: Raw) => Planned | Promise<Planned> =
    type === "students"
      ? await studentsPlanner(userId)
      : type === "fees"
        ? await feesPlanner(userId, students!, raws)
        : type === "receivables"
          ? await receivablesPlanner(userId, students!)
          : type === "income"
            ? await incomePlanner(userId, students!, raws)
            : type === "expenses"
              ? await expensePlanner(userId, raws)
              : await transactionsPlanner(userId, students!, raws);

  const planned: Planned[] = [];
  for (const row of rows) planned.push(await planner(row.line, row.raw));
  preview.rows = planned.map(({ line, status, summary, messages, raw }) => ({ line, status, summary, messages, raw }));
  preview.valid = planned.filter((row) => row.status === "valid").length;
  preview.invalid = planned.filter((row) => row.status === "invalid").length;
  preview.duplicates = planned.filter((row) => row.status === "duplicate").length;
  return { preview, planned };
}

export async function previewImport(type: ImportType, text: string, fileName: string, userId: string) {
  return (await plan(type, text, fileName, userId)).preview;
}

export async function runImport(type: ImportType, text: string, fileName: string, userId: string): Promise<ImportResult> {
  const { preview, planned } = await plan(type, text, fileName, userId);
  const result: ImportResult = {
    ok: false,
    type,
    fileName,
    total: preview.total,
    imported: 0,
    duplicates: preview.duplicates,
    failed: preview.invalid,
    rolledBack: false,
    error: preview.fileErrors.join(" ") || null,
    rows: planned.map((row) => ({
      line: row.line,
      outcome: row.status === "duplicate" ? "duplicate" : "failed",
      summary: row.summary,
      reason: row.messages.join("; "),
    })),
  };
  if (preview.fileErrors.length) return result;
  if (!preview.valid) {
    result.error = "There are no valid rows to import.";
    return result;
  }

  const undos: Undo[] = [];
  for (const [index, row] of planned.entries()) {
    if (row.status !== "valid" || !row.run) continue;
    try {
      undos.push(await row.run());
      result.rows[index] = { line: row.line, outcome: "imported", summary: row.summary, reason: row.messages.join("; ") };
      result.imported += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error";
      // Undo everything this file added, newest first, so the database is as it was.
      const undoErrors: string[] = [];
      for (const undo of undos.reverse()) {
        try {
          await undo();
        } catch (undoError) {
          undoErrors.push(undoError instanceof Error ? undoError.message : String(undoError));
        }
      }
      result.rolledBack = true;
      result.imported = 0;
      result.error = `Row ${row.line} could not be saved (${reason}). Nothing from this file was imported.`;
      if (undoErrors.length) result.error += ` Some changes could not be undone: ${undoErrors.join("; ")}`;
      result.rows = result.rows.map((entry, position) =>
        position === index
          ? { ...entry, outcome: "failed", reason }
          : entry.outcome === "imported" || planned[position].status === "valid"
            ? { ...entry, outcome: "failed", reason: "Not imported: the import was cancelled and undone" }
            : entry,
      );
      result.failed = result.rows.filter((entry) => entry.outcome === "failed").length;
      // Reverses anything the undone rows had already posted.
      await syncLedger(undefined, userId);
      await writeAudit({
        userId,
        action: "DATA_IMPORT_ROLLED_BACK",
        entityType: "Import",
        details: { type, fileName, failedLine: row.line, reason, undoErrors },
      });
      return result;
    }
  }

  result.ok = true;
  result.failed = result.rows.filter((entry) => entry.outcome === "failed").length;
  await syncLedger(undefined, userId);
  await writeAudit({
    userId,
    action: "DATA_IMPORTED",
    entityType: "Import",
    details: { type, label: IMPORT_SPECS[type].label, fileName, total: result.total, imported: result.imported, duplicates: result.duplicates, failed: result.failed },
  });
  return result;
}
