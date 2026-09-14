import { NextResponse } from "next/server";
import { mkdtemp, writeFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { writeAudit } from "@/lib/audit";
import { restoreFromFile } from "@/lib/backup";

export const runtime = "nodejs";

const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getSession();
  if (!user || !can(user.role, "backup.manage")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  if (String(formData.get("confirm") ?? "") !== "RESTORE") {
    return NextResponse.json({ error: "Type RESTORE to confirm that current data will be replaced" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Upload a backup JSON file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Backup file is too large" }, { status: 400 });
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "nccs-restore-"));
  const tempPath = path.join(tempDir, "upload.json");
  try {
    await writeFile(tempPath, Buffer.from(await file.arrayBuffer()));
    const safety = await restoreFromFile(tempPath);
    await writeAudit({
      userId: user.id,
      action: "BACKUP_RESTORED",
      entityType: "Backup",
      entityId: file.name,
      details: { source: "upload", safetyBackup: safety.filename },
    });
    return NextResponse.json({ ok: true, safety: safety.filename });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to restore backup" },
      { status: 400 },
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
