import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
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

async function collectCounts(): Promise<BackupMeta["counts"]> {
  const [students, staff, classes, subjects, feeRecords, salaryRecords, income, expenses, users] = await Promise.all([
    prisma.student.count({ where: { deletedAt: null } }),
    prisma.staff.count(),
    prisma.class.count(),
    prisma.subject.count(),
    prisma.feeRecord.count(),
    prisma.salaryRecord.count(),
    prisma.incomeTransaction.count({ where: { voidedAt: null } }),
    prisma.expenseTransaction.count({ where: { voidedAt: null } }),
    prisma.user.count(),
  ]);
  return { students, staff, classes, subjects, feeRecords, salaryRecords, income, expenses, users };
}

async function dumpSnapshotData(): Promise<SnapshotData> {
  const [
    users,
    sequences,
    settings,
    academicYears,
    programs,
    subjects,
    staff,
    classes,
    classSubjects,
    staffSubjects,
    staffAssignments,
    students,
    feeRecords,
    incomeTransactions,
    feePayments,
    expenseTransactions,
    salaryRecords,
    salaryPayments,
    auditLogs,
  ] = await prisma.$transaction([
    prisma.user.findMany(),
    prisma.sequence.findMany(),
    prisma.setting.findMany(),
    prisma.academicYear.findMany(),
    prisma.program.findMany(),
    prisma.subject.findMany(),
    prisma.staff.findMany(),
    prisma.class.findMany(),
    prisma.classSubject.findMany(),
    prisma.staffSubject.findMany(),
    prisma.staffAssignment.findMany(),
    prisma.student.findMany(),
    prisma.feeRecord.findMany(),
    prisma.incomeTransaction.findMany(),
    prisma.feePayment.findMany(),
    prisma.expenseTransaction.findMany(),
    prisma.salaryRecord.findMany(),
    prisma.salaryPayment.findMany(),
    prisma.auditLog.findMany(),
  ]);

  return {
    users,
    sequences,
    settings,
    academicYears,
    programs,
    subjects,
    staff,
    classes,
    classSubjects,
    staffSubjects,
    staffAssignments,
    students,
    feeRecords,
    incomeTransactions,
    feePayments,
    expenseTransactions,
    salaryRecords,
    salaryPayments,
    auditLogs,
  };
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

async function insertAll<T>(rows: unknown[], write: (records: T[]) => Promise<unknown>) {
  if (!rows.length) return;
  await write(rows as T[]);
}

async function restoreSnapshotData(data: SnapshotData) {
  await prisma.$transaction(
    async (tx) => {
      await tx.auditLog.deleteMany();
      await tx.salaryPayment.deleteMany();
      await tx.salaryRecord.deleteMany();
      await tx.feePayment.deleteMany();
      await tx.incomeTransaction.deleteMany();
      await tx.expenseTransaction.deleteMany();
      await tx.feeRecord.deleteMany();
      await tx.student.deleteMany();
      await tx.staffAssignment.deleteMany();
      await tx.staffSubject.deleteMany();
      await tx.classSubject.deleteMany();
      await tx.class.deleteMany();
      await tx.staff.deleteMany();
      await tx.subject.deleteMany();
      await tx.program.deleteMany();
      await tx.academicYear.deleteMany();
      await tx.setting.deleteMany();
      await tx.sequence.deleteMany();
      await tx.user.deleteMany();

      await insertAll<Prisma.UserCreateManyInput>(data.users, (records) => tx.user.createMany({ data: records }));
      await insertAll<Prisma.SequenceCreateManyInput>(data.sequences, (records) => tx.sequence.createMany({ data: records }));
      await insertAll<Prisma.SettingCreateManyInput>(data.settings, (records) => tx.setting.createMany({ data: records }));
      await insertAll<Prisma.AcademicYearCreateManyInput>(data.academicYears, (records) =>
        tx.academicYear.createMany({ data: records }),
      );
      await insertAll<Prisma.ProgramCreateManyInput>(data.programs, (records) => tx.program.createMany({ data: records }));
      await insertAll<Prisma.SubjectCreateManyInput>(data.subjects, (records) => tx.subject.createMany({ data: records }));
      await insertAll<Prisma.StaffCreateManyInput>(data.staff, (records) => tx.staff.createMany({ data: records }));
      await insertAll<Prisma.ClassCreateManyInput>(data.classes, (records) => tx.class.createMany({ data: records }));
      await insertAll<Prisma.ClassSubjectCreateManyInput>(data.classSubjects, (records) =>
        tx.classSubject.createMany({ data: records }),
      );
      await insertAll<Prisma.StaffSubjectCreateManyInput>(data.staffSubjects, (records) =>
        tx.staffSubject.createMany({ data: records }),
      );
      await insertAll<Prisma.StaffAssignmentCreateManyInput>(data.staffAssignments, (records) =>
        tx.staffAssignment.createMany({ data: records }),
      );
      await insertAll<Prisma.StudentCreateManyInput>(data.students, (records) => tx.student.createMany({ data: records }));
      await insertAll<Prisma.FeeRecordCreateManyInput>(data.feeRecords, (records) => tx.feeRecord.createMany({ data: records }));
      await insertAll<Prisma.IncomeTransactionCreateManyInput>(data.incomeTransactions, (records) =>
        tx.incomeTransaction.createMany({ data: records }),
      );
      await insertAll<Prisma.FeePaymentCreateManyInput>(data.feePayments, (records) => tx.feePayment.createMany({ data: records }));
      await insertAll<Prisma.ExpenseTransactionCreateManyInput>(data.expenseTransactions, (records) =>
        tx.expenseTransaction.createMany({ data: records }),
      );
      await insertAll<Prisma.SalaryRecordCreateManyInput>(data.salaryRecords, (records) =>
        tx.salaryRecord.createMany({ data: records }),
      );
      await insertAll<Prisma.SalaryPaymentCreateManyInput>(data.salaryPayments, (records) =>
        tx.salaryPayment.createMany({ data: records }),
      );
      await insertAll<Prisma.AuditLogCreateManyInput>(data.auditLogs, (records) => tx.auditLog.createMany({ data: records }));
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
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
