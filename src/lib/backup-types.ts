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
