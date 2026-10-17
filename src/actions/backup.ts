"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { createBackup, restoreNamedBackup } from "@/lib/backup";

function fail(error: string) {
  return { ok: false as const, error };
}

export async function createBackupAction() {
  const user = await requirePermission("backup.manage");
  try {
    const backup = await createBackup("manual", user.id);
    await writeAudit({
      userId: user.id,
      action: "BACKUP_CREATED",
      entityType: "Backup",
      entityId: backup.filename,
      details: { kind: backup.kind, createdAt: backup.createdAt },
    });
    revalidatePath("/settings");
    return { ok: true as const, filename: backup.filename };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to create backup");
  }
}

export async function restoreBackupAction(formData: FormData) {
  const user = await requirePermission("backup.manage");
  const filename = String(formData.get("filename") ?? "");
  const confirmed = String(formData.get("confirm") ?? "") === "RESTORE";
  if (!filename) return fail("Select a backup to restore");
  if (!confirmed) return fail("Type RESTORE to confirm that current data will be replaced");
  try {
    const safety = await restoreNamedBackup(filename);
    await writeAudit({
      userId: user.id,
      action: "BACKUP_RESTORED",
      entityType: "Backup",
      entityId: filename,
      details: { safetyBackup: safety.filename },
    });
    revalidatePath("/");
    revalidatePath("/settings");
    revalidatePath("/students");
    revalidatePath("/staff");
    revalidatePath("/classes");
    revalidatePath("/finance");
    return { ok: true as const, safety: safety.filename };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unable to restore backup");
  }
}
