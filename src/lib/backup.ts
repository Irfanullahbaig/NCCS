import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { prisma, reconnectPrisma } from "@/lib/db";
import type { BackupKind, BackupMeta } from "@/lib/backup-types";

export type { BackupKind, BackupMeta } from "@/lib/backup-types";

export const BACKUP_DIR = path.join(process.cwd(), "backups");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CHECK_MS = 60 * 60 * 1000;
const SQLITE_HEADER = Buffer.from("SQLite format 3\0");

type GlobalBackup = typeof globalThis & { nccsBackupTimer?: NodeJS.Timeout };

export function resolveDatabasePath() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const file = url.replace(/^file:/, "");
  if (path.isAbsolute(file)) return file;
  return path.join(process.cwd(), "prisma", file.replace(/^\.\//, ""));
}

function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function backupPaths(filename: string) {
  const dbPath = path.join(BACKUP_DIR, filename);
  const metaPath = dbPath.replace(/\.db$/i, ".json");
  return { dbPath, metaPath };
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

async function checkpointSqlite() {
  try {
    await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch {
    // Ignore if the connection does not support WAL checkpoints.
  }
}

async function copyDatabase(destination: string) {
  const source = resolveDatabasePath();
  await checkpointSqlite();
  await fs.copyFile(source, destination);
  const wal = `${source}-wal`;
  const shm = `${source}-shm`;
  try {
    await fs.access(wal);
    await fs.copyFile(wal, `${destination}-wal`);
  } catch {
    // No WAL file.
  }
  try {
    await fs.access(shm);
    await fs.copyFile(shm, `${destination}-shm`);
  } catch {
    // No SHM file.
  }
}

async function fileChecksum(filePath: string) {
  const buffer = await fs.readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
}

export async function isSqliteFile(filePath: string) {
  const handle = await fs.open(filePath, "r");
  try {
    const header = Buffer.alloc(16);
    await handle.read(header, 0, 16, 0);
    return header.equals(SQLITE_HEADER);
  } finally {
    await handle.close();
  }
}

export async function createBackup(kind: BackupKind, userId?: string | null) {
  await ensureBackupDir();
  const createdAt = new Date();
  const filename = `nccs-backup-${stamp(createdAt)}.db`;
  const { dbPath, metaPath } = backupPaths(filename);
  await copyDatabase(dbPath);
  const stats = await fs.stat(dbPath);
  const meta: BackupMeta = {
    filename,
    createdAt: createdAt.toISOString(),
    kind,
    size: stats.size,
    checksum: await fileChecksum(dbPath),
    counts: await collectCounts(),
  };
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
  return meta;
}

export async function listBackups(): Promise<BackupMeta[]> {
  await ensureBackupDir();
  const names = await fs.readdir(BACKUP_DIR);
  const files = names.filter((name) => name.endsWith(".db") && !name.endsWith("-wal") && !name.endsWith("-shm"));
  const backups: BackupMeta[] = [];
  for (const filename of files) {
    const { dbPath, metaPath } = backupPaths(filename);
    try {
      const raw = await fs.readFile(metaPath, "utf8");
      backups.push(JSON.parse(raw) as BackupMeta);
    } catch {
      const stats = await fs.stat(dbPath);
      backups.push({
        filename,
        createdAt: stats.mtime.toISOString(),
        kind: "manual",
        size: stats.size,
        checksum: "",
        counts: {
          students: 0,
          staff: 0,
          classes: 0,
          subjects: 0,
          feeRecords: 0,
          salaryRecords: 0,
          income: 0,
          expenses: 0,
          users: 0,
        },
      });
    }
  }
  return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getBackupFile(filename: string) {
  if (!/^[A-Za-z0-9._-]+\.db$/.test(filename)) {
    throw new Error("Invalid backup filename");
  }
  const { dbPath } = backupPaths(filename);
  const resolved = path.resolve(dbPath);
  if (!resolved.startsWith(path.resolve(BACKUP_DIR) + path.sep)) {
    throw new Error("Invalid backup path");
  }
  await fs.access(resolved);
  if (!(await isSqliteFile(resolved))) throw new Error("Backup file is not a valid database");
  return resolved;
}

export async function restoreFromFile(sourcePath: string) {
  if (!(await isSqliteFile(sourcePath))) {
    throw new Error("The selected file is not a valid SQLite database backup");
  }
  const current = resolveDatabasePath();
  await ensureBackupDir();
  const safety = await createBackup("pre-restore");
  await checkpointSqlite();
  await prisma.$disconnect();
  try {
    await fs.copyFile(sourcePath, current);
    for (const suffix of ["-wal", "-shm"]) {
      try {
        await fs.unlink(`${current}${suffix}`);
      } catch {
        // Optional sidecar files.
      }
    }
  } catch (error) {
    await fs.copyFile(backupPaths(safety.filename).dbPath, current).catch(() => undefined);
    await reconnectPrisma();
    throw error;
  }
  await reconnectPrisma();
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
