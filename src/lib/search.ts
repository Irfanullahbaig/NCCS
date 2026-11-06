import type { SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, type Permission } from "@/lib/permissions";
import { NAV_PAGES } from "@/lib/navigation";
import { isDummyDataEnabled } from "@/lib/supabase/dummy";
import {
  EXPENSE_CATEGORY_LABELS,
  FEE_STATUS_LABELS,
  INCOME_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  ROLE_LABELS,
  STUDENT_STATUS_LABELS,
  STUDENT_TYPE_LABELS,
} from "@/lib/constants";
import { currentMonthYear, formatDate, formatPKR, fullName, monthLabel, MONTH_NAMES } from "@/lib/utils";

export type SearchType =
  | "page"
  | "action"
  | "student"
  | "staff"
  | "class"
  | "program"
  | "subject"
  | "income"
  | "expense"
  | "payment"
  | "user";

export type SearchLink = { label: string; href: string };

export type SearchHit = {
  key: string;
  type: SearchType;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  badge?: string;
  /** Extra shortcuts shown next to the result, e.g. "Edit" or "Record payment". */
  actions: SearchLink[];
  /** True when the preview endpoint can show more detail for this result. */
  previewable: boolean;
  score: number;
};

export type SearchGroup = { type: SearchType; label: string; hits: SearchHit[] };

const GROUP_LABELS: Record<SearchType, string> = {
  page: "Pages",
  action: "Quick actions",
  student: "Students",
  staff: "Staff",
  class: "Classes",
  program: "Programs",
  subject: "Subjects",
  income: "Income",
  expense: "Expenses",
  payment: "Fee receipts",
  user: "Users",
};

const PER_GROUP = 6;

type Row = Record<string, unknown>;
type LooseQuery = PromiseLike<{ data: Row[] | null; error: unknown }> & {
  or(filters: string): LooseQuery;
  is(column: string, value: null): LooseQuery;
  limit(count: number): LooseQuery;
};
type LooseClient = { from(table: string): { select(columns: string): LooseQuery } };

function tokens(query: string) {
  return query.toLowerCase().split(/\s+/).map((part) => part.trim()).filter(Boolean);
}

/** Characters that would break a PostgREST `or=(...)` filter. */
function safeToken(value: string) {
  return value.replace(/[%_,()*:"\\]/g, "");
}

function text(value: unknown) {
  return value == null ? "" : String(value);
}

/**
 * Ranks how well `title` and `extra` match every typed word.
 * Returns 0 when a word is missing, so "ali khan" needs both words somewhere.
 */
function rank(words: string[], title: string, extra: string[]) {
  const lowTitle = title.toLowerCase();
  const haystack = [lowTitle, ...extra.map((item) => item.toLowerCase())].join(" ");
  if (!words.every((word) => haystack.includes(word))) return 0;
  const phrase = words.join(" ");
  // "grade 10" should not match "Grade 9" plus a "10" inside a phone number.
  const fields = [lowTitle, ...extra.map((item) => item.toLowerCase())];
  if (words.length > 1 && !fields.some((field) => field.includes(phrase))) return 2;
  let score = 10;
  if (lowTitle === phrase) score += 100;
  else if (lowTitle.startsWith(phrase)) score += 60;
  else if (lowTitle.split(/\s+/).some((part) => part.startsWith(words[0]))) score += 35;
  else if (lowTitle.includes(phrase)) score += 20;
  if (extra.some((item) => item.toLowerCase() === phrase)) score += 80;
  return score;
}

async function fetchRows(table: string, columns: string, searchColumns: string[], words: string[], options?: { notDeleted?: boolean }) {
  const client = db() as unknown as LooseClient;
  let query = client.from(table).select(columns);
  if (options?.notDeleted) query = query.is("deletedAt", null);
  if (!isDummyDataEnabled()) {
    // Narrow on the longest word in the database, then rank on every word here.
    const needle = safeToken([...words].sort((a, b) => b.length - a.length)[0] ?? "");
    if (needle) {
      query = query.or(searchColumns.map((column) => `${column}.ilike.%${needle}%`).join(",")).limit(40);
    }
  }
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

function pick<T extends SearchHit>(hits: T[]) {
  const matched = hits.filter((hit) => hit.score > 0);
  // Loose matches (words found in different fields) only show when nothing better exists.
  const strong = matched.filter((hit) => hit.score >= 10);
  return (strong.length ? strong : matched).sort((a, b) => b.score - a.score).slice(0, PER_GROUP);
}

type QuickAction = { label: string; href: string; permission: Permission; keywords: string[] };

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Add student", href: "/students?action=new", permission: "students.create", keywords: ["new student", "admission", "enrol"] },
  { label: "Record fee payment", href: "/finance/fees?action=pay", permission: "fees.record", keywords: ["fee", "fees", "collect", "receive", "payment"] },
  { label: "Add income", href: "/finance/income?action=new", permission: "finance.create", keywords: ["receipt", "income"] },
  { label: "Add expense", href: "/finance/expenses?action=new", permission: "finance.create", keywords: ["bill", "expense", "spend"] },
  { label: "Add staff member", href: "/staff?action=new", permission: "staff.create", keywords: ["teacher", "hire", "employee"] },
  { label: "Late fee settings", href: "/settings#late-fees", permission: "settings.manage", keywords: ["late fee", "fine", "partial"] },
];

function pageHits(user: SessionUser, words: string[]) {
  const hits: SearchHit[] = NAV_PAGES.filter((page) => can(user.role, page.permission)).map((page) => ({
    key: `page:${page.href}`,
    type: "page" as const,
    id: page.href,
    title: page.label,
    subtitle: page.href === "/dashboard" ? "Go to the dashboard" : `Go to ${page.label}`,
    href: page.href,
    actions: [],
    previewable: false,
    score: rank(words, page.label, page.keywords),
  }));
  // Accountants are sent from /finance to /finance/income by the proxy.
  return pick(hits.filter((hit) => !(hit.id === "/finance" && !can(user.role, "finance.analytics"))));
}

function monthHits(user: SessionUser, words: string[]) {
  if (!can(user.role, "fees.view")) return [];
  const monthIndex = MONTH_NAMES.findIndex((name) =>
    words.some((word) => word.length >= 3 && name.toLowerCase().startsWith(word)),
  );
  if (monthIndex < 0) return [];
  const yearWord = words.find((word) => /^20\d{2}$/.test(word));
  const year = yearWord ? Number(yearWord) : currentMonthYear().year;
  const month = monthIndex + 1;
  const label = monthLabel(month, year);
  const hits: SearchHit[] = [
    {
      key: `page:fees:${year}-${month}`,
      type: "page",
      id: `fees-${year}-${month}`,
      title: `Student fees — ${label}`,
      subtitle: "Fee records, payments and late fees for this month",
      href: `/finance/fees?month=${month}&year=${year}`,
      actions: [],
      previewable: false,
      score: 90,
    },
  ];
  if (can(user.role, "salaries.view")) {
    hits.push({
      key: `page:payroll:${year}-${month}`,
      type: "page",
      id: `payroll-${year}-${month}`,
      title: `Payroll — ${label}`,
      subtitle: "Salaries for this month",
      href: `/finance/salaries?month=${month}&year=${year}`,
      actions: [],
      previewable: false,
      score: 70,
    });
  }
  return hits;
}

function actionHits(user: SessionUser, words: string[]) {
  return pick(
    QUICK_ACTIONS.filter((action) => can(user.role, action.permission)).map((action) => ({
      key: `action:${action.href}`,
      type: "action" as const,
      id: action.href,
      title: action.label,
      subtitle: "Quick action",
      href: action.href,
      actions: [],
      previewable: false,
      score: rank(words, action.label, action.keywords),
    })),
  );
}

async function studentHits(user: SessionUser, words: string[]) {
  if (!can(user.role, "students.view")) return [];
  const rows = await fetchRows(
    "Student",
    "id, firstName, lastName, fatherName, registrationNo, contactNumber, email, status, studentType, classId, class:Class(name, program:Program(name))",
    ["firstName", "lastName", "fatherName", "registrationNo", "contactNumber", "email"],
    words,
    { notDeleted: true },
  );
  return pick(
    rows.map((row) => {
      const schoolClass = row.class as { name?: string; program?: { name?: string } | null } | null;
      const classLabel = [schoolClass?.name, schoolClass?.program?.name].filter(Boolean).join(" — ");
      const title = fullName(text(row.firstName), text(row.lastName));
      const actions: SearchLink[] = [];
      if (can(user.role, "students.edit")) actions.push({ label: "Edit", href: `/students/${row.id}?action=edit` });
      if (can(user.role, "fees.record")) actions.push({ label: "Record payment", href: `/students/${row.id}?action=pay` });
      return {
        key: `student:${row.id}`,
        type: "student" as const,
        id: text(row.id),
        title,
        subtitle: [text(row.registrationNo), classLabel, `S/O ${text(row.fatherName)}`].filter(Boolean).join(" · "),
        href: `/students/${row.id}`,
        badge: row.status !== "ACTIVE" ? STUDENT_STATUS_LABELS[row.status as keyof typeof STUDENT_STATUS_LABELS] : undefined,
        actions,
        previewable: true,
        score: rank(words, title, [text(row.registrationNo), text(row.fatherName), text(row.contactNumber), text(row.email), classLabel]),
      };
    }),
  );
}

async function staffHits(user: SessionUser, words: string[]) {
  if (!can(user.role, "staff.view")) return [];
  const rows = await fetchRows(
    "Staff",
    "id, firstName, lastName, staffId, qualification, contactNumber, email, employmentStatus",
    ["firstName", "lastName", "staffId", "qualification", "contactNumber", "email"],
    words,
  );
  return pick(
    rows.map((row) => {
      const title = fullName(text(row.firstName), text(row.lastName));
      const actions: SearchLink[] = [];
      if (can(user.role, "staff.edit")) actions.push({ label: "Edit", href: `/staff?q=${encodeURIComponent(text(row.staffId))}` });
      if (can(user.role, "salaries.view")) actions.push({ label: "Payroll", href: "/finance/salaries" });
      return {
        key: `staff:${row.id}`,
        type: "staff" as const,
        id: text(row.id),
        title,
        subtitle: [text(row.staffId), text(row.qualification)].filter(Boolean).join(" · "),
        href: `/staff/${row.id}`,
        badge: row.employmentStatus !== "ACTIVE" ? text(row.employmentStatus).replace("_", " ").toLowerCase() : undefined,
        actions,
        previewable: true,
        score: rank(words, title, [text(row.staffId), text(row.qualification), text(row.contactNumber), text(row.email)]),
      };
    }),
  );
}

async function classHits(user: SessionUser, words: string[]) {
  if (!can(user.role, "classes.view")) return { classes: [], programs: [], subjects: [] };
  const [classRows, programRows, subjectRows] = await Promise.all([
    // Program names live on another table, so classes are ranked here rather than in the database.
    fetchRows("Class", "id, name, code, status, program:Program(name)", ["name", "code"], []),
    fetchRows("Program", "id, name, description", ["name", "description"], words),
    fetchRows("Subject", "id, name, code", ["name", "code"], words),
  ]);
  const classes = pick(
    classRows.map((row) => {
      const program = text((row.program as { name?: string } | null)?.name);
      const title = [text(row.name), program].filter(Boolean).join(" — ");
      return {
        key: `class:${row.id}`,
        type: "class" as const,
        id: text(row.id),
        title,
        subtitle: [text(row.code), row.status === "ACTIVE" ? "Active" : "Inactive"].filter(Boolean).join(" · "),
        href: `/classes/${row.id}`,
        actions: can(user.role, "students.view") ? [{ label: "Students", href: `/students?classId=${row.id}` }] : [],
        previewable: true,
        score: rank(words, title, [text(row.code)]),
      };
    }),
  );
  const programs = pick(
    programRows.map((row) => ({
      key: `program:${row.id}`,
      type: "program" as const,
      id: text(row.id),
      title: text(row.name),
      subtitle: text(row.description) || "Program",
      href: "/classes",
      actions: [],
      previewable: false,
      score: rank(words, text(row.name), [text(row.description)]),
    })),
  );
  const subjects = pick(
    subjectRows.map((row) => ({
      key: `subject:${row.id}`,
      type: "subject" as const,
      id: text(row.id),
      title: text(row.name),
      subtitle: text(row.code),
      href: "/classes",
      actions: [],
      previewable: false,
      score: rank(words, text(row.name), [text(row.code)]),
    })),
  );
  return { classes, programs, subjects };
}

async function financeHits(user: SessionUser, words: string[]) {
  const wantFinance = can(user.role, "finance.view");
  const wantPayments = can(user.role, "fees.view");
  const [incomeRows, expenseRows, paymentRows] = await Promise.all([
    wantFinance
      ? fetchRows("IncomeTransaction", "id, incomeId, date, amount, category, source, referenceNumber, notes, studentId, voidedAt", ["incomeId", "source", "referenceNumber", "notes"], words)
      : Promise.resolve([]),
    wantFinance
      ? fetchRows("ExpenseTransaction", "id, expenseId, date, amount, category, paidTo, description, referenceNumber, voidedAt", ["expenseId", "paidTo", "description", "referenceNumber"], words)
      : Promise.resolve([]),
    wantPayments
      ? fetchRows("FeePayment", "id, amount, paymentDate, paymentMethod, referenceNumber, studentId, voidedAt, student:Student(firstName, lastName)", ["referenceNumber"], words)
      : Promise.resolve([]),
  ]);

  const income = pick(
    incomeRows.map((row) => ({
      key: `income:${row.id}`,
      type: "income" as const,
      id: text(row.id),
      title: `${text(row.incomeId)} · ${formatPKR(Number(row.amount))}`,
      subtitle: [formatDate(text(row.date)), INCOME_CATEGORY_LABELS[row.category as keyof typeof INCOME_CATEGORY_LABELS], text(row.source)].filter(Boolean).join(" · "),
      href: `/finance/income?q=${encodeURIComponent(text(row.incomeId))}&includeVoided=1`,
      badge: row.voidedAt ? "Voided" : undefined,
      actions: row.studentId && can(user.role, "students.view") ? [{ label: "Student", href: `/students/${row.studentId}` }] : [],
      previewable: true,
      score: rank(words, text(row.incomeId), [text(row.source), text(row.referenceNumber), text(row.notes)]),
    })),
  );
  const expenses = pick(
    expenseRows.map((row) => ({
      key: `expense:${row.id}`,
      type: "expense" as const,
      id: text(row.id),
      title: `${text(row.expenseId)} · ${formatPKR(Number(row.amount))}`,
      subtitle: [formatDate(text(row.date)), EXPENSE_CATEGORY_LABELS[row.category as keyof typeof EXPENSE_CATEGORY_LABELS], text(row.paidTo)].filter(Boolean).join(" · "),
      href: `/finance/expenses?q=${encodeURIComponent(text(row.expenseId))}`,
      badge: row.voidedAt ? "Voided" : undefined,
      actions: [],
      previewable: true,
      score: rank(words, text(row.expenseId), [text(row.paidTo), text(row.description), text(row.referenceNumber)]),
    })),
  );
  const payments = pick(
    paymentRows
      .filter((row) => text(row.referenceNumber))
      .map((row) => {
        const student = row.student as { firstName?: string; lastName?: string } | null;
        return {
          key: `payment:${row.id}`,
          type: "payment" as const,
          id: text(row.id),
          title: `Receipt ${text(row.referenceNumber)} · ${formatPKR(Number(row.amount))}`,
          subtitle: [fullName(text(student?.firstName), text(student?.lastName)), formatDate(text(row.paymentDate)), PAYMENT_METHOD_LABELS[row.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS]].filter(Boolean).join(" · "),
          href: `/students/${row.studentId}`,
          badge: row.voidedAt ? "Voided" : undefined,
          actions: [],
          previewable: false,
          score: rank(words, text(row.referenceNumber), []),
        };
      }),
  );
  return { income, expenses, payments };
}

async function userHits(user: SessionUser, words: string[]) {
  if (!can(user.role, "users.manage")) return [];
  const rows = await fetchRows("User", "id, name, email, role, isActive", ["name", "email"], words);
  return pick(
    rows.map((row) => ({
      key: `user:${row.id}`,
      type: "user" as const,
      id: text(row.id),
      title: text(row.name),
      subtitle: [text(row.email), ROLE_LABELS[row.role as keyof typeof ROLE_LABELS]].filter(Boolean).join(" · "),
      href: "/users",
      badge: row.isActive ? undefined : "Inactive",
      actions: [],
      previewable: false,
      score: rank(words, text(row.name), [text(row.email)]),
    })),
  );
}

export async function globalSearch(user: SessionUser, query: string): Promise<SearchGroup[]> {
  const words = tokens(query);
  if (!words.length) return [];
  const [students, staff, classData, finance, users] = await Promise.all([
    studentHits(user, words),
    staffHits(user, words),
    classHits(user, words),
    financeHits(user, words),
    userHits(user, words),
  ]);
  const groups: Array<[SearchType, SearchHit[]]> = [
    ["page", [...monthHits(user, words), ...pageHits(user, words)].slice(0, PER_GROUP)],
    ["action", actionHits(user, words)],
    ["student", students],
    ["class", classData.classes],
    ["staff", staff],
    ["payment", finance.payments],
    ["income", finance.income],
    ["expense", finance.expenses],
    ["program", classData.programs],
    ["subject", classData.subjects],
    ["user", users],
  ];
  return groups
    .filter(([, hits]) => hits.length)
    .map(([type, hits]) => ({ type, label: GROUP_LABELS[type], hits }))
    // The group holding the single best match comes first.
    .sort((a, b) => Math.max(...b.hits.map((hit) => hit.score)) - Math.max(...a.hits.map((hit) => hit.score)));
}

export type PreviewStat = { label: string; value: string; tone?: "good" | "warn" | "bad" };
export type SearchPreview = {
  title: string;
  subtitle: string;
  stats: PreviewStat[];
  fields: Array<{ label: string; value: string }>;
  listTitle?: string;
  list: Array<{ title: string; subtitle: string; href?: string }>;
  actions: SearchLink[];
};

export async function searchPreview(user: SessionUser, type: string, id: string): Promise<SearchPreview | null> {
  const { month, year } = currentMonthYear();
  if (type === "student" && can(user.role, "students.view")) {
    const { data, error } = await db()
      .from("Student")
      .select("*, class:Class(id, name, program:Program(name)), feeRecords:FeeRecord(id, month, year, remainingAmount, fineAmount, status), payments:FeePayment(id, amount, paymentDate, paymentMethod, voidedAt, referenceNumber)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const records = (data.feeRecords ?? []).sort((a, b) => b.year - a.year || b.month - a.month);
    const current = records.find((record) => record.month === month && record.year === year);
    const outstanding = records.reduce((sum, record) => sum + Number(record.remainingAmount), 0);
    const lateFees = records.reduce((sum, record) => sum + (record.remainingAmount > 0 ? Number(record.fineAmount ?? 0) : 0), 0);
    const payments = (data.payments ?? [])
      .filter((payment) => !payment.voidedAt)
      .sort((a, b) => String(b.paymentDate).localeCompare(String(a.paymentDate)))
      .slice(0, 4);
    const actions: SearchLink[] = [{ label: "Open profile", href: `/students/${id}` }];
    if (can(user.role, "students.edit")) actions.push({ label: "Edit student", href: `/students/${id}?action=edit` });
    if (can(user.role, "fees.record")) actions.push({ label: "Record payment", href: `/students/${id}?action=pay` });
    if (data.class) actions.push({ label: "Open class", href: `/classes/${data.class.id}` });
    return {
      title: fullName(data.firstName, data.lastName),
      subtitle: [data.registrationNo, data.class ? `${data.class.name} — ${data.class.program?.name ?? ""}` : ""].filter(Boolean).join(" · "),
      stats: [
        {
          label: `${MONTH_NAMES[month - 1]} fee`,
          value: current ? FEE_STATUS_LABELS[current.status] : "—",
          tone: current?.status === "PAID" || current?.status === "WAIVED" ? "good" : current?.status === "OVERDUE" ? "bad" : "warn",
        },
        { label: "Outstanding", value: formatPKR(outstanding), tone: outstanding > 0 ? "bad" : "good" },
        { label: "Unpaid late fees", value: formatPKR(lateFees), tone: lateFees > 0 ? "warn" : "good" },
      ],
      fields: [
        { label: "Father's name", value: data.fatherName },
        { label: "Type", value: STUDENT_TYPE_LABELS[data.studentType] },
        { label: "Monthly fee", value: formatPKR(data.feeAmount) },
        { label: "Status", value: STUDENT_STATUS_LABELS[data.status] },
        { label: "Admission", value: formatDate(data.dateOfAdmission) },
        { label: "Contact", value: data.contactNumber },
      ],
      listTitle: "Recent payments",
      list: payments.map((payment) => ({
        title: formatPKR(payment.amount),
        subtitle: [formatDate(payment.paymentDate), PAYMENT_METHOD_LABELS[payment.paymentMethod], payment.referenceNumber].filter(Boolean).join(" · "),
      })),
      actions,
    };
  }

  if (type === "class" && can(user.role, "classes.view")) {
    const { data, error } = await db()
      .from("Class")
      .select("*, program:Program(name), classTeacher:Staff(firstName, lastName), students:Student(id, firstName, lastName, registrationNo, deletedAt, status, feeRecords:FeeRecord(month, year, paidAmount, remainingAmount, status))")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const students = (data.students ?? []).filter((student) => !student.deletedAt);
    const fees = students.flatMap((student) => (student.feeRecords ?? []).filter((record) => record.month === month && record.year === year));
    const collected = fees.reduce((sum, record) => sum + Number(record.paidAmount), 0);
    const outstanding = fees.reduce((sum, record) => sum + Number(record.remainingAmount), 0);
    const actions: SearchLink[] = [{ label: "Open class", href: `/classes/${id}` }];
    if (can(user.role, "students.view")) actions.push({ label: "View students", href: `/students?classId=${id}` });
    return {
      title: `${data.name} — ${data.program?.name ?? ""}`,
      subtitle: `${data.code} · ${data.status === "ACTIVE" ? "Active" : "Inactive"}`,
      stats: [
        { label: "Students", value: String(students.length) },
        { label: `${MONTH_NAMES[month - 1]} collected`, value: formatPKR(collected), tone: "good" },
        { label: "Outstanding", value: formatPKR(outstanding), tone: outstanding > 0 ? "bad" : "good" },
      ],
      fields: [
        { label: "Class teacher", value: data.classTeacher ? fullName(data.classTeacher.firstName, data.classTeacher.lastName) : "Unassigned" },
        { label: "Monthly fee", value: formatPKR(data.feeAmount) },
      ],
      listTitle: "Students",
      list: students
        .sort((a, b) => a.firstName.localeCompare(b.firstName))
        .slice(0, 6)
        .map((student) => {
          const fee = (student.feeRecords ?? []).find((record) => record.month === month && record.year === year);
          return {
            title: fullName(student.firstName, student.lastName),
            subtitle: [student.registrationNo, fee ? FEE_STATUS_LABELS[fee.status] : ""].filter(Boolean).join(" · "),
            href: `/students/${student.id}`,
          };
        }),
      actions,
    };
  }

  if (type === "staff" && can(user.role, "staff.view")) {
    const { data, error } = await db()
      .from("Staff")
      .select("*, subjects:StaffSubject(subject:Subject(name)), assignments:StaffAssignment(class:Class(id, name, program:Program(name)))")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const actions: SearchLink[] = [{ label: "Open profile", href: `/staff/${id}` }];
    if (can(user.role, "staff.edit")) actions.push({ label: "Edit in staff list", href: `/staff?q=${encodeURIComponent(data.staffId)}` });
    if (can(user.role, "salaries.view")) actions.push({ label: "Payroll", href: "/finance/salaries" });
    return {
      title: fullName(data.firstName, data.lastName),
      subtitle: [data.staffId, data.qualification].filter(Boolean).join(" · "),
      stats: [
        { label: "Status", value: text(data.employmentStatus).replace("_", " ").toLowerCase(), tone: data.employmentStatus === "ACTIVE" ? "good" : "warn" },
        ...(can(user.role, "salaries.view") ? [{ label: "Salary", value: formatPKR(data.salaryAmount) }] : []),
      ],
      fields: [
        { label: "Joined", value: formatDate(data.dateOfJoining) },
        { label: "Contact", value: data.contactNumber },
        { label: "Subjects", value: (data.subjects ?? []).map((row) => row.subject?.name).filter(Boolean).join(", ") || "—" },
      ],
      listTitle: "Classes",
      list: (data.assignments ?? []).filter((row) => row.class).map((row) => ({
        title: `${row.class.name} — ${row.class.program?.name ?? ""}`,
        subtitle: "Assigned class",
        href: `/classes/${row.class.id}`,
      })),
      actions,
    };
  }

  if (type === "income" && can(user.role, "finance.view")) {
    const { data, error } = await db().from("IncomeTransaction").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const actions: SearchLink[] = [{ label: "Open in income", href: `/finance/income?q=${encodeURIComponent(data.incomeId)}&includeVoided=1` }];
    if (data.studentId && can(user.role, "students.view")) actions.push({ label: "Open student", href: `/students/${data.studentId}` });
    return {
      title: data.incomeId,
      subtitle: INCOME_CATEGORY_LABELS[data.category],
      stats: [
        { label: "Amount", value: formatPKR(data.amount), tone: "good" },
        { label: "Status", value: data.voidedAt ? "Voided" : "Recorded", tone: data.voidedAt ? "bad" : "good" },
      ],
      fields: [
        { label: "Date", value: formatDate(data.date) },
        { label: "Source", value: data.source || "—" },
        { label: "Method", value: PAYMENT_METHOD_LABELS[data.paymentMethod] },
        { label: "Reference", value: data.referenceNumber || "—" },
        ...(data.voidReason ? [{ label: "Void reason", value: data.voidReason }] : []),
      ],
      list: [],
      actions,
    };
  }

  if (type === "expense" && can(user.role, "finance.view")) {
    const { data, error } = await db().from("ExpenseTransaction").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      title: data.expenseId,
      subtitle: EXPENSE_CATEGORY_LABELS[data.category],
      stats: [
        { label: "Amount", value: formatPKR(data.amount), tone: "bad" },
        { label: "Status", value: data.voidedAt ? "Voided" : "Recorded", tone: data.voidedAt ? "bad" : "good" },
      ],
      fields: [
        { label: "Date", value: formatDate(data.date) },
        { label: "Paid to", value: data.paidTo || "—" },
        { label: "Description", value: data.description || "—" },
        { label: "Method", value: PAYMENT_METHOD_LABELS[data.paymentMethod] },
        { label: "Reference", value: data.referenceNumber || "—" },
      ],
      list: [],
      actions: [{ label: "Open in expenses", href: `/finance/expenses?q=${encodeURIComponent(data.expenseId)}` }],
    };
  }

  return null;
}
