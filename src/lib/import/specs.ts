import type { Role } from "@/lib/enums";
import { can, type Permission } from "@/lib/permissions";

/** Import definitions (CSV, Excel, PDF and text files all become CSV rows). Safe to import from client components: no database access here. */

export type ImportType = "students" | "fees" | "receivables" | "income" | "expenses" | "transactions";

export type ImportColumn = {
  key: string;
  header: string;
  required?: boolean;
  /** Other header spellings accepted in uploaded files. */
  aliases?: string[];
  example: string;
  help: string;
};

export type ImportSpec = {
  type: ImportType;
  label: string;
  description: string;
  /** Every one of these is checked on the server before preview and import. */
  permissions: Permission[];
  columns: ImportColumn[];
};

export const IMPORT_MAX_BYTES = 900 * 1024;
export const IMPORT_MAX_ROWS = 2000;

const METHOD_HELP = "Cash, Bank Transfer, Cheque, Online or Other";

const col = (key: string, header: string, example: string, help: string, extra: Partial<ImportColumn> = {}): ImportColumn => ({
  key,
  header,
  example,
  help,
  ...extra,
});

export const IMPORT_SPECS: Record<ImportType, ImportSpec> = {
  students: {
    type: "students",
    label: "Students",
    description: "Add students in bulk. Existing registration numbers are skipped, never overwritten.",
    permissions: ["data.import", "students.create"],
    columns: [
      col("registrationNo", "Registration No", "STU-2026-0101", "Leave blank to generate one automatically", { aliases: ["Reg No", "Registration Number", "Roll No"] }),
      col("firstName", "First Name", "Ali", "Required", { required: true }),
      col("lastName", "Last Name", "Khan", "Required", { required: true }),
      col("fatherName", "Father Name", "Imran Khan", "Required", { required: true, aliases: ["Father's Name", "Father"] }),
      col("class", "Class", "1st Year", "Class code (e.g. CLS-0001) or class name", { required: true, aliases: ["Class Code", "Class Name", "Grade"] }),
      col("program", "Program", "FSc", "Needed only when two classes share a name", { aliases: ["Programme"] }),
      col("gender", "Gender", "Male", "Male, Female or Other", { required: true }),
      col("contactNumber", "Contact Number", "03001234567", "Required", { required: true, aliases: ["Contact", "Phone", "Mobile"] }),
      col("email", "Email", "", "Optional"),
      col("address", "Address", "House 1, Street 2, Gilgit", "Required", { required: true }),
      col("dateOfAdmission", "Admission Date", "2026-09-01", "YYYY-MM-DD or DD/MM/YYYY", { required: true, aliases: ["Date of Admission", "Admission"] }),
      col("studentType", "Student Type", "Self", "Self, Scholarship or Need-Based", { aliases: ["Type"] }),
      col("feeAmount", "Monthly Fee", "5000", "Fixed monthly fee in rupees. Blank uses the class fee", { aliases: ["Fee", "Fee Amount", "Total Fee", "Fees"] }),
      col("status", "Status", "Active", "Active, Inactive, Graduated or Suspended. Blank means Active"),
    ],
  },
  fees: {
    type: "fees",
    label: "Fee collections",
    description: "Record fee payments received from students. Each row becomes a fee payment and an Income entry.",
    permissions: ["data.import", "fees.record"],
    columns: [
      col("registrationNo", "Registration No", "STU-2026-0101", "Student's registration number", { required: true, aliases: ["Reg No", "Registration Number"] }),
      col("month", "Fee Month", "9", "1-12 or month name", { required: true, aliases: ["Month"] }),
      col("year", "Fee Year", "2026", "Year of the fee month", { required: true, aliases: ["Year"] }),
      col("amount", "Amount", "5000", "Amount paid in rupees", { required: true, aliases: ["Amount Paid", "Paid"] }),
      col("paymentDate", "Payment Date", "2026-09-05", "YYYY-MM-DD or DD/MM/YYYY; not in the future", { required: true, aliases: ["Date", "Paid On"] }),
      col("paymentMethod", "Payment Method", "Cash", METHOD_HELP, { required: true, aliases: ["Method"] }),
      col("referenceNumber", "Reference", "RCPT-1001", "Optional receipt or bank reference", { aliases: ["Reference Number", "Receipt No"] }),
      col("notes", "Notes", "", "Optional"),
    ],
  },
  receivables: {
    type: "receivables",
    label: "Student receivables",
    description: "Set what a student owes for a fee month (opening balances, fee changes or discounts). Payments are imported separately as fee collections.",
    permissions: ["data.import", "finance.edit"],
    columns: [
      col("registrationNo", "Registration No", "STU-2026-0101", "Student's registration number", { required: true, aliases: ["Reg No", "Registration Number"] }),
      col("month", "Fee Month", "9", "1-12 or month name", { required: true, aliases: ["Month"] }),
      col("year", "Fee Year", "2026", "Year of the fee month", { required: true, aliases: ["Year"] }),
      col("expectedAmount", "Fee Amount", "5000", "What the student is charged for that month", { required: true, aliases: ["Fee", "Expected", "Amount"] }),
      col("waivedAmount", "Discount", "0", "Optional discount or waiver for that month", { aliases: ["Waiver", "Waived"] }),
      col("reason", "Reason", "Opening balance from old register", "Why the amount is set", { required: true }),
    ],
  },
  income: {
    type: "income",
    label: "Other income",
    description: "Income that is not a monthly student fee, such as admission or transport fees. Use fee collections for monthly fees.",
    permissions: ["data.import", "finance.create"],
    columns: [
      col("date", "Date", "2026-09-10", "YYYY-MM-DD or DD/MM/YYYY; not in the future", { required: true }),
      col("amount", "Amount", "15000", "Rupees", { required: true }),
      col("category", "Category", "Admission Fee", "Admission Fee, Registration Fee, Transport Fee or Other Income", { required: true }),
      col("source", "Source", "Admission fee — new intake", "Who or what it came from"),
      col("registrationNo", "Registration No", "", "Optional student registration number", { aliases: ["Reg No"] }),
      col("paymentMethod", "Payment Method", "Bank Transfer", METHOD_HELP, { required: true, aliases: ["Method"] }),
      col("referenceNumber", "Reference", "", "Optional", { aliases: ["Reference Number"] }),
      col("notes", "Notes", "", "Optional"),
    ],
  },
  expenses: {
    type: "expenses",
    label: "Expenses",
    description: "Operating costs such as utilities, rent and supplies. Staff salaries are best recorded from Payroll so salary records stay in step.",
    permissions: ["data.import", "finance.create"],
    columns: [
      col("date", "Date", "2026-09-12", "YYYY-MM-DD or DD/MM/YYYY; not in the future", { required: true }),
      col("amount", "Amount", "8500", "Rupees", { required: true }),
      col("category", "Category", "Utilities", "Salaries, Utilities, Rent, Maintenance, Supplies, Transport or Other Expenses", { required: true }),
      col("paidTo", "Paid To", "WAPDA", "Required", { required: true, aliases: ["Payee", "Vendor"] }),
      col("paymentMethod", "Payment Method", "Cash", METHOD_HELP, { required: true, aliases: ["Method"] }),
      col("referenceNumber", "Reference", "BILL-0925", "Optional", { aliases: ["Reference Number"] }),
      col("description", "Description", "Electricity bill September", "Optional"),
      col("notes", "Notes", "", "Optional"),
    ],
  },
  transactions: {
    type: "transactions",
    label: "Transactions",
    description: "A mixed ledger of income and expenses. Student Fee rows need a registration number and fee month, and are recorded as fee collections.",
    permissions: ["data.import", "finance.create", "fees.record"],
    columns: [
      col("direction", "Type", "Income", "Income or Expense", { required: true, aliases: ["Direction", "Transaction Type"] }),
      col("date", "Date", "2026-09-05", "YYYY-MM-DD or DD/MM/YYYY; not in the future", { required: true }),
      col("amount", "Amount", "5000", "Rupees", { required: true }),
      col("category", "Category", "Student Fee", "An income or expense category", { required: true }),
      col("registrationNo", "Registration No", "STU-2026-0101", "Required for Student Fee rows", { aliases: ["Reg No"] }),
      col("month", "Fee Month", "9", "Required for Student Fee rows", { aliases: ["Month"] }),
      col("year", "Fee Year", "2026", "Required for Student Fee rows", { aliases: ["Year"] }),
      col("party", "Source / Paid To", "", "Income source, or who an expense was paid to (required for expenses)", { aliases: ["Source", "Paid To", "Party"] }),
      col("paymentMethod", "Payment Method", "Cash", METHOD_HELP, { required: true, aliases: ["Method"] }),
      col("referenceNumber", "Reference", "RCPT-1002", "Optional", { aliases: ["Reference Number"] }),
      col("description", "Description", "", "Optional (expenses)"),
      col("notes", "Notes", "", "Optional"),
    ],
  },
};

export function isImportType(value: string): value is ImportType {
  return value in IMPORT_SPECS;
}

/** Blank template with headers and one example row. */
export function templateRows(type: ImportType) {
  const { columns } = IMPORT_SPECS[type];
  return [columns.map((column) => column.header), columns.map((column) => column.example)];
}

// ---------------------------------------------------------------- Results shared with the browser

export type PreviewStatus = "valid" | "invalid" | "duplicate";

export type PreviewRow = {
  /** Line in the uploaded file (header is line 1). */
  line: number;
  status: PreviewStatus;
  /** Short description shown in the preview table. */
  summary: string;
  messages: string[];
  raw: Record<string, string>;
};

export type ImportPreview = {
  type: ImportType;
  fileName: string;
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  /** Header problems that stop the whole file (missing required columns, etc). */
  fileErrors: string[];
  unknownColumns: string[];
  rows: PreviewRow[];
};

export type ImportResult = {
  ok: boolean;
  type: ImportType;
  fileName: string;
  total: number;
  imported: number;
  duplicates: number;
  failed: number;
  /** Set when something failed mid-import and every row from this file was undone. */
  rolledBack: boolean;
  error: string | null;
  rows: Array<{ line: number; outcome: "imported" | "duplicate" | "failed"; summary: string; reason: string }>;
};

/** Import types this role may use; the API checks the same permissions on every request. */
export function importTypesFor(role: Role, types: ImportType[]) {
  return types.filter((type) => IMPORT_SPECS[type].permissions.every((permission) => can(role, permission)));
}
