import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PostgrestError } from "@supabase/supabase-js";
import type { AdminClient } from "@/lib/supabase/admin";

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;
type Filter =
  | { kind: "eq" | "neq" | "gt" | "gte" | "lt" | "lte"; column: string; value: unknown }
  | { kind: "is"; column: string; value: unknown }
  | { kind: "in"; column: string; values: unknown[] }
  | { kind: "not"; column: string; op: string; value: unknown };

type Embed = { alias: string; table: string; inner: SelectSpec };
type SelectSpec = { star: boolean; columns: string[]; embeds: Embed[] };

const TABLES = [
  "User",
  "Setting",
  "Sequence",
  "AcademicYear",
  "Program",
  "Subject",
  "Class",
  "ClassSubject",
  "Staff",
  "StaffSubject",
  "StaffAssignment",
  "Student",
  "FeeRecord",
  "FeePayment",
  "IncomeTransaction",
  "ExpenseTransaction",
  "SalaryRecord",
  "SalaryPayment",
  "AuditLog",
] as const;

const BELONGS_TO: Record<string, Record<string, { table: string; fk: string }>> = {
  Student: { class: { table: "Class", fk: "classId" }, academicYear: { table: "AcademicYear", fk: "academicYearId" } },
  Class: {
    program: { table: "Program", fk: "programId" },
    academicYear: { table: "AcademicYear", fk: "academicYearId" },
    classTeacher: { table: "Staff", fk: "classTeacherId" },
  },
  ClassSubject: { class: { table: "Class", fk: "classId" }, subject: { table: "Subject", fk: "subjectId" } },
  StaffSubject: { staff: { table: "Staff", fk: "staffId" }, subject: { table: "Subject", fk: "subjectId" } },
  StaffAssignment: {
    staff: { table: "Staff", fk: "staffId" },
    class: { table: "Class", fk: "classId" },
    subject: { table: "Subject", fk: "subjectId" },
  },
  FeeRecord: { student: { table: "Student", fk: "studentId" }, class: { table: "Class", fk: "classId" } },
  FeePayment: {
    student: { table: "Student", fk: "studentId" },
    incomeTransaction: { table: "IncomeTransaction", fk: "incomeTransactionId" },
    feeRecord: { table: "FeeRecord", fk: "feeRecordId" },
  },
  IncomeTransaction: {
    student: { table: "Student", fk: "studentId" },
    class: { table: "Class", fk: "classId" },
    feePayment: { table: "FeePayment", fk: "feePaymentId" },
  },
  ExpenseTransaction: { salaryPayment: { table: "SalaryPayment", fk: "salaryPaymentId" } },
  SalaryRecord: { staff: { table: "Staff", fk: "staffId" } },
  SalaryPayment: { staff: { table: "Staff", fk: "staffId" }, salaryRecord: { table: "SalaryRecord", fk: "salaryRecordId" } },
  AuditLog: { user: { table: "User", fk: "userId" } },
};

const HAS_MANY: Record<string, Record<string, { table: string; fk: string }>> = {
  Staff: {
    subjects: { table: "StaffSubject", fk: "staffId" },
    assignments: { table: "StaffAssignment", fk: "staffId" },
  },
  Class: { subjects: { table: "ClassSubject", fk: "classId" }, students: { table: "Student", fk: "classId" } },
  Student: { feeRecords: { table: "FeeRecord", fk: "studentId" }, payments: { table: "FeePayment", fk: "studentId" } },
  FeeRecord: { payments: { table: "FeePayment", fk: "feeRecordId" } },
  SalaryRecord: { payments: { table: "SalaryPayment", fk: "salaryRecordId" } },
};

function dataDir() {
  return process.env.NCCS_DATA_DIR || join(process.cwd(), ".data");
}

function storePath() {
  return join(dataDir(), "dummy.json");
}

function emptyStore(): Store {
  return Object.fromEntries(TABLES.map((table) => [table, []])) as Store;
}

function loadStore(): Store {
  const file = storePath();
  if (!existsSync(file)) return emptyStore();
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Store;
    const store = emptyStore();
    for (const table of TABLES) store[table] = Array.isArray(parsed[table]) ? parsed[table] : [];
    return store;
  } catch {
    return emptyStore();
  }
}

function saveStore(store: Store) {
  const file = storePath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(store, null, 2));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function splitTop(input: string) {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of input) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseSelect(spec = "*"): SelectSpec {
  const parsed: SelectSpec = { star: false, columns: [], embeds: [] };
  for (const part of splitTop(spec)) {
    if (part === "*" || part === "") {
      parsed.star = part === "*";
      continue;
    }
    const embed = part.match(/^([A-Za-z]+):([A-Za-z]+)\((.*)\)$/) ?? part.match(/^([A-Za-z]+)\((.*)\)$/);
    if (embed) {
      const alias = embed[1];
      const table = embed.length === 4 ? embed[2] : embed[1];
      const inner = embed[embed.length - 1];
      parsed.embeds.push({ alias, table, inner: parseSelect(inner || "*") });
      continue;
    }
    parsed.columns.push(part);
  }
  if (!parsed.columns.length && !parsed.embeds.length) parsed.star = true;
  return parsed;
}

function pickColumns(row: Row, spec: SelectSpec) {
  if (spec.star || spec.columns.length === 0) return clone(row);
  const next: Row = {};
  for (const column of spec.columns) next[column] = row[column];
  return next;
}

function findById(store: Store, table: string, id: unknown) {
  if (id == null) return null;
  return store[table]?.find((row) => row.id === id) ?? null;
}

function applyEmbeds(store: Store, table: string, row: Row, spec: SelectSpec): Row {
  const next = pickColumns(row, spec);
  for (const embed of spec.embeds) {
    const belongs = BELONGS_TO[table]?.[embed.alias];
    const hasMany = HAS_MANY[table]?.[embed.alias];
    if (belongs) {
      const related = findById(store, belongs.table, row[belongs.fk]);
      next[embed.alias] = related ? applyEmbeds(store, belongs.table, related, embed.inner) : null;
      continue;
    }
    if (hasMany) {
      const parentKey = table === "Sequence" ? row.name : row.id;
      const children = (store[hasMany.table] ?? []).filter((child) => child[hasMany.fk] === parentKey);
      next[embed.alias] = children.map((child) => applyEmbeds(store, hasMany.table, child, embed.inner));
      continue;
    }
    const fk = `${embed.alias}Id`;
    if (fk in row) {
      const related = findById(store, embed.table, row[fk]);
      next[embed.alias] = related ? applyEmbeds(store, embed.table, related, embed.inner) : null;
      continue;
    }
    const childFk = `${table.charAt(0).toLowerCase()}${table.slice(1)}Id`;
    const children = (store[embed.table] ?? []).filter((child) => child[childFk] === row.id);
    next[embed.alias] = children.map((child) => applyEmbeds(store, embed.table, child, embed.inner));
  }
  return next;
}

function matches(row: Row, filter: Filter) {
  const value = row[filter.column];
  switch (filter.kind) {
    case "eq":
      return value === filter.value;
    case "neq":
      return value !== filter.value;
    case "gt":
      return (value as number | string) > (filter.value as number | string);
    case "gte":
      return (value as number | string) >= (filter.value as number | string);
    case "lt":
      return (value as number | string) < (filter.value as number | string);
    case "lte":
      return (value as number | string) <= (filter.value as number | string);
    case "is":
      return filter.value === null ? value == null : value === filter.value;
    case "in":
      return filter.values.includes(value);
    case "not":
      if (filter.op === "is") return filter.value === null ? value != null : value !== filter.value;
      return true;
  }
}

function compare(a: unknown, b: unknown) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function asError(message: string): PostgrestError {
  return {
    name: "PostgrestError",
    message,
    details: "",
    hint: "",
    code: "PGRST116",
    toJSON() {
      return { name: this.name, message: this.message, details: this.details, hint: this.hint, code: this.code };
    },
  };
}

class DummyQuery {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private filters: Filter[] = [];
  private spec: SelectSpec = { star: true, columns: [], embeds: [] };
  private wantsSelect = false;
  private payload: Row[] = [];
  private patch: Row = {};
  private orderColumn?: string;
  private ascending = true;
  private limitCount?: number;
  private mode: "many" | "single" | "maybe" = "many";
  private countExact = false;
  private head = false;

  constructor(
    private store: Store,
    private persist: () => void,
    private table: string,
  ) {}

  select(columns?: string, options?: { count?: "exact"; head?: boolean }) {
    this.op = this.op === "insert" || this.op === "update" || this.op === "delete" ? this.op : "select";
    this.wantsSelect = true;
    this.spec = parseSelect(columns ?? "*");
    this.countExact = options?.count === "exact";
    this.head = options?.head === true;
    return this;
  }

  insert(values: Row | Row[]) {
    this.op = "insert";
    this.payload = Array.isArray(values) ? values.map((row) => clone(row)) : [clone(values)];
    return this;
  }

  update(values: Row) {
    this.op = "update";
    this.patch = clone(values);
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ kind: "neq", column, value });
    return this;
  }

  gt(column: string, value: unknown) {
    this.filters.push({ kind: "gt", column, value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ kind: "gte", column, value });
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push({ kind: "lt", column, value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ kind: "lte", column, value });
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push({ kind: "is", column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ kind: "in", column, values });
    return this;
  }

  not(column: string, op: string, value: unknown) {
    this.filters.push({ kind: "not", column, op, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderColumn = column;
    this.ascending = options?.ascending !== false;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  single() {
    this.mode = "single";
    return this;
  }

  private filteredRows() {
    return (this.store[this.table] ?? []).filter((row) => this.filters.every((filter) => matches(row, filter)));
  }

  private shape(rows: Row[]) {
    return rows.map((row) => applyEmbeds(this.store, this.table, row, this.spec));
  }

  private execute() {
    try {
      if (this.op === "insert") {
        if (!this.store[this.table]) this.store[this.table] = [];
        for (const row of this.payload) {
          if (this.table === "User" && row.isActive == null) row.isActive = true;
          if (this.table === "Staff" && row.facultyType == null) row.facultyType = "PERMANENT";
          if (row.createdAt == null) row.createdAt = new Date().toISOString();
        }
        this.store[this.table].push(...this.payload);
        this.persist();
        const data = this.wantsSelect ? this.shape(this.payload) : null;
        return this.finish(data, this.payload.length);
      }

      const matched = this.filteredRows();
      if (this.op === "update") {
        for (const row of matched) Object.assign(row, this.patch);
        this.persist();
        const data = this.wantsSelect ? this.shape(matched) : null;
        return this.finish(data, matched.length);
      }
      if (this.op === "delete") {
        this.store[this.table] = (this.store[this.table] ?? []).filter(
          (row) => !this.filters.every((filter) => matches(row, filter)),
        );
        this.persist();
        const data = this.wantsSelect ? this.shape(matched) : null;
        return this.finish(data, matched.length);
      }

      let rows = matched;
      if (this.orderColumn) {
        const column = this.orderColumn;
        rows = [...rows].sort((a, b) => {
          const result = compare(a[column], b[column]);
          return this.ascending ? result : -result;
        });
      }
      if (this.limitCount != null) rows = rows.slice(0, this.limitCount);
      const data = this.head ? null : this.shape(rows);
      return this.finish(data, matched.length);
    } catch (error) {
      return {
        data: null,
        error: asError(error instanceof Error ? error.message : "Dummy database error"),
        count: null,
        status: 500,
        statusText: "Error",
      };
    }
  }

  private finish(data: Row[] | null, count: number) {
    if (this.mode === "single" || this.mode === "maybe") {
      const rows = data ?? [];
      if (this.mode === "single" && rows.length !== 1) {
        return { data: null, error: asError("JSON object requested, multiple (or no) rows returned"), count: this.countExact ? count : null, status: 406, statusText: "Not Acceptable" };
      }
      if (this.mode === "maybe" && rows.length > 1) {
        return { data: null, error: asError("JSON object requested, multiple rows returned"), count: this.countExact ? count : null, status: 406, statusText: "Not Acceptable" };
      }
      return {
        data: (data ? rows[0] ?? null : null) as Row | null,
        error: null,
        count: this.countExact ? count : null,
        status: 200,
        statusText: "OK",
      };
    }
    return {
      data,
      error: null,
      count: this.countExact ? count : null,
      status: 200,
      statusText: "OK",
    };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: ReturnType<DummyQuery["execute"]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

export function isDummyDataEnabled() {
  return process.env.NCCS_USE_DUMMY_DATA === "1";
}

export function createDummyClient(): AdminClient {
  const store = loadStore();
  const persist = () => saveStore(store);
  return {
    from(table: string) {
      return new DummyQuery(store, persist, table);
    },
  } as unknown as AdminClient;
}
