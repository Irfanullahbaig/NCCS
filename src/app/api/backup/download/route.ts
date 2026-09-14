import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getBackupFile } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user || !can(user.role, "backup.manage")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const filename = new URL(request.url).searchParams.get("file");
  if (!filename) {
    return NextResponse.json({ error: "Backup file is required" }, { status: 400 });
  }

  try {
    const filePath = await getBackupFile(filename);
    const [data, info] = await Promise.all([readFile(filePath), stat(filePath)]);
    return new NextResponse(data, {
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(info.size),
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to download backup" },
      { status: 400 },
    );
  }
}
