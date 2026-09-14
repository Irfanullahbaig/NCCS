export type BackupKind = "weekly" | "manual" | "pre-restore";

export type BackupMeta = {
  filename: string;
  createdAt: string;
  kind: BackupKind;
  size: number;
  checksum: string;
  counts: {
    students: number;
    staff: number;
    classes: number;
    subjects: number;
    feeRecords: number;
    salaryRecords: number;
    income: number;
    expenses: number;
    users: number;
  };
};

export const SNAPSHOT_VERSION = 1 as const;

export type SnapshotData = {
  users: unknown[];
  sequences: unknown[];
  settings: unknown[];
  academicYears: unknown[];
  programs: unknown[];
  subjects: unknown[];
  staff: unknown[];
  classes: unknown[];
  classSubjects: unknown[];
  staffSubjects: unknown[];
  staffAssignments: unknown[];
  students: unknown[];
  feeRecords: unknown[];
  incomeTransactions: unknown[];
  feePayments: unknown[];
  expenseTransactions: unknown[];
  salaryRecords: unknown[];
  salaryPayments: unknown[];
  auditLogs: unknown[];
};

export type DatabaseSnapshot = {
  version: typeof SNAPSHOT_VERSION;
  meta: BackupMeta;
  data: SnapshotData;
};
