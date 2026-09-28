import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { db } from "@/lib/db";
import {
  SNAPSHOT_VERSION,
  type BackupKind,
  type BackupMeta,
  type DatabaseSnapshot,
  type SnapshotData,
} from "@/lib/backup-types";

export type { BackupKind, BackupMeta, DatabaseSnapshot, SnapshotData } from "@/lib/backup-types";
export { SNAPSHOT_VERSION } from "@/lib/backup-types";

export const BACKUP_DIR = path.join(process.cwd(), "backups");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CHECK_MS = 60 * 60 * 1000;
const SNAPSHOT_KEYS: Array<keyof SnapshotData> = [
  "users",
  "sequences",
  "settings",
  "academicYears",
  "programs",
  "subjects",
  "staff",
  "classes",
  "classSubjects",
  "staffSubjects",
  "staffAssignments",
  "students",
  "feeRecords",
  "incomeTransactions",
  "feePayments",
  "expenseTransactions",
  "salaryRecords",
  "salaryPayments",
  "auditLogs",
];

const DUMP_TABLES = [
  ["users", "User"],
  ["sequences", "Sequence"],
  ["settings", "Setting"],
  ["academicYears", "AcademicYear"],
  ["programs", "Program"],
  ["subjects", "Subject"],
  ["staff", "Staff"],
  ["classes", "Class"],
  ["classSubjects", "ClassSubject"],
  ["staffSubjects", "StaffSubject"],
  ["staffAssignments", "StaffAssignment"],
  ["students", "Student"],
  ["feeRecords", "FeeRecord"],
  ["incomeTransactions", "IncomeTransaction"],
  ["feePayments", "FeePayment"],
  ["expenseTransactions", "ExpenseTransaction"],
  ["salaryRecords", "SalaryRecord"],
  ["salaryPayments", "SalaryPayment"],
  ["auditLogs", "AuditLog"],
] as const;

const DELETE_ORDER: Array<[string, string]> = [
  ["AuditLog", "id"],
  ["SalaryPayment", "id"],
  ["SalaryRecord", "id"],
  ["FeePayment", "id"],
  ["IncomeTransaction", "id"],
  ["ExpenseTransaction", "id"],
  ["FeeRecord", "id"],
  ["Student", "id"],
  ["StaffAssignment", "id"],
  ["StaffSubject", "staffId"],
  ["ClassSubject", "classId"],
  ["Class", "id"],
  ["Staff", "id"],
  ["Subject", "id"],
  ["Program", "id"],
  ["AcademicYear", "id"],
  ["Setting", "id"],
  ["Sequence", "name"],
  ["User", "id"],
];

const INSERT_ORDER = [
  ["users", "User"],
  ["sequences", "Sequence"],
  ["settings", "Setting"],
  ["academicYears", "AcademicYear"],
  ["programs", "Program"],
  ["subjects", "Subject"],
  ["staff", "Staff"],
  ["classes", "Class"],
  ["classSubjects", "ClassSubject"],
  ["staffSubjects", "StaffSubject"],
  ["staffAssignments", "StaffAssignment"],
  ["students", "Student"],
  ["feeRecords", "FeeRecord"],
  ["incomeTransactions", "IncomeTransaction"],
  ["feePayments", "FeePayment"],
  ["expenseTransactions", "ExpenseTransaction"],
  ["salaryRecords", "SalaryRecord"],
  ["salaryPayments", "SalaryPayment"],
  ["auditLogs", "AuditLog"],
] as const;

type GlobalBackup = typeof globalThis & { nccsBackupTimer?: NodeJS.Timeout };

function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function backupPath(filename: string) {
  return path.join(BACKUP_DIR, filename);
}

export async function ensureBackupDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

async function countRows(
  table:
    | "Student"
    | "Staff"
    | "Class"
    | "Subject"
    | "FeeRecord"
    | "SalaryRecord"
    | "IncomeTransaction"
    | "ExpenseTransaction"
    | "User",
  apply?: (query: ReturnType<ReturnType<typeof db>["from"]>) => ReturnType<ReturnType<typeof db>["from"]>,
) {
  let query = db().from(table).select("id", { count: "exact", head: true });
  if (apply) query = apply(query) as typeof query;
  const result = await query;
  if (result.error) throw result.error;
  return result.count ?? 0;
}

async function collectCounts(): Promise<BackupMeta["counts"]> {
  const [students, staff, classes, subjects, feeRecords, salaryRecords, income, expenses, users] = await Promise.all([
    countRows("Student", (query) => query.is("deletedAt", null)),
    countRows("Staff"),
    countRows("Class"),
    countRows("Subject"),
    countRows("FeeRecord"),
    countRows("SalaryRecord"),
    countRows("IncomeTransaction", (query) => query.is("voidedAt", null)),
    countRows("ExpenseTransaction", (query) => query.is("voidedAt", null)),
    countRows("User"),
  ]);
  return { students, staff, classes, subjects, feeRecords, salaryRecords, income, expenses, users };
}

async function fetchAll(table: (typeof DUMP_TABLES)[number][1]) {
  const result = await db().from(table).select("*");
  if (result.error) throw result.error;
  return result.data ?? [];
}

async function dumpSnapshotData(): Promise<SnapshotData> {
  const entries = await Promise.all(DUMP_TABLES.map(async ([key, table]) => [key, await fetchAll(table)] as const));
  return Object.fromEntries(entries) as SnapshotData;
}

function isIsoDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
}

export function parseSnapshotJson(raw: string): DatabaseSnapshot {
  const parsed = JSON.parse(raw, (_key, value) => (isIsoDateString(value) ? new Date(value) : value)) as DatabaseSnapshot;
  if (!isDatabaseSnapshot(parsed)) {
    throw new Error("Backup file is not a valid NCCS snapshot");
  }
  return parsed;
}

export function isDatabaseSnapshot(value: unknown): value is DatabaseSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as DatabaseSnapshot;
  if (snapshot.version !== SNAPSHOT_VERSION || !snapshot.meta || !snapshot.data) return false;
  return SNAPSHOT_KEYS.every((key) => Array.isArray(snapshot.data[key]));
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function serializeRows(rows: unknown[]) {
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    return Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([key, value]) => [key, serializeValue(value)]));
  });
}

async function deleteAll(table: (typeof DELETE_ORDER)[number][0], column: string) {
  const result = await db().from(table as "User").delete().not(column, "is", null);
  if (result.error) throw result.error;
}

async function insertAll(table: (typeof INSERT_ORDER)[number][1], rows: unknown[]) {
  if (!rows.length) return;
  const result = await db().from(table).insert(serializeRows(rows) as never);
  if (result.error) throw result.error;
}

async function restoreSnapshotData(data: SnapshotData) {
  for (const [table, column] of DELETE_ORDER) {
    await deleteAll(table, column);
  }
  for (const [key, table] of INSERT_ORDER) {
    await insertAll(table, data[key]);
  }
}

export async function createBackup(kind: BackupKind, _userId?: string | null) {
  await ensureBackupDir();
  const createdAt = new Date();
  const filename = `nccs-backup-${stamp(createdAt)}.json`;
  const data = await dumpSnapshotData();
  const snapshot: DatabaseSnapshot = {
    version: SNAPSHOT_VERSION,
    meta: {
      filename,
      createdAt: createdAt.toISOString(),
      kind,
      size: 0,
      checksum: createHash("sha256").update(JSON.stringify(data)).digest("hex"),
      counts: await collectCounts(),
    },
    data,
  };
  const file = backupPath(filename);
  await fs.writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`);
  snapshot.meta.size = (await fs.stat(file)).size;
  await fs.writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`);
  snapshot.meta.size = (await fs.stat(file)).size;
  return snapshot.meta;
}

export async function listBackups(): Promise<BackupMeta[]> {
  await ensureBackupDir();
  const names = await fs.readdir(BACKUP_DIR);
  const files = names.filter((name) => name.endsWith(".json") && name.startsWith("nccs-backup-"));
  const backups: BackupMeta[] = [];
  for (const filename of files) {
    try {
      const raw = await fs.readFile(backupPath(filename), "utf8");
      const parsed = JSON.parse(raw) as DatabaseSnapshot;
      if (!isDatabaseSnapshot(parsed)) continue;
      backups.push({ ...parsed.meta, filename });
    } catch {
      // Ignore unrelated JSON files in the backup folder.
    }
  }
  return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getBackupFile(filename: string) {
  if (!/^[A-Za-z0-9._-]+\.json$/.test(filename)) {
    throw new Error("Invalid backup filename");
  }
  const resolved = path.resolve(backupPath(filename));
  if (!resolved.startsWith(path.resolve(BACKUP_DIR) + path.sep)) {
    throw new Error("Invalid backup path");
  }
  await fs.access(resolved);
  const raw = await fs.readFile(resolved, "utf8");
  parseSnapshotJson(raw);
  return resolved;
}

export async function restoreFromFile(sourcePath: string) {
  const raw = await fs.readFile(sourcePath, "utf8");
  const snapshot = parseSnapshotJson(raw);
  await ensureBackupDir();
  const safety = await createBackup("pre-restore");
  try {
    await restoreSnapshotData(snapshot.data);
  } catch (error) {
    const safetyRaw = await fs.readFile(backupPath(safety.filename), "utf8");
    await restoreSnapshotData(parseSnapshotJson(safetyRaw).data).catch(() => undefined);
    throw error;
  }
  return safety;
}

export async function restoreNamedBackup(filename: string) {
  const filePath = await getBackupFile(filename);
  return restoreFromFile(filePath);
}

export async function ensureWeeklyBackup() {
  await ensureBackupDir();
  const backups = await listBackups();
  const latestWeekly = backups.find((backup) => backup.kind === "weekly");
  if (latestWeekly && Date.now() - new Date(latestWeekly.createdAt).getTime() < WEEK_MS) {
    return latestWeekly;
  }
  return createBackup("weekly");
}

export async function startBackupScheduler() {
  const globalState = globalThis as GlobalBackup;
  if (globalState.nccsBackupTimer) return;
  try {
    await ensureWeeklyBackup();
  } catch (error) {
    console.error("Weekly backup failed on startup", error);
  }
  globalState.nccsBackupTimer = setInterval(() => {
    void ensureWeeklyBackup().catch((error) => {
      console.error("Weekly backup failed", error);
    });
  }, CHECK_MS);
  globalState.nccsBackupTimer.unref?.();
}
