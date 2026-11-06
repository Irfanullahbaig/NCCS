import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { IMPORT_MAX_BYTES, IMPORT_SPECS, isImportType } from "@/lib/import/specs";
import { previewImport, runImport } from "@/lib/import/server";
import { IMPORT_EXTENSIONS, fileExtension } from "@/lib/import/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Large files run every row through the same checks as the forms.
export const maxDuration = 300;

const REFRESH = [
  "/dashboard",
  "/students",
  "/classes",
  "/finance",
  "/finance/fees",
  "/finance/receivables",
  "/finance/income",
  "/finance/expenses",
  "/finance/ledger",
  "/finance/profit-loss",
  "/reports",
];

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Please sign in again" }, { status: 401 });

  // Only the app's own pages may call this (blocks cross-site form posts).
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) {
    return NextResponse.json({ error: "Request not allowed" }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Expected JSON" }, { status: 415 });
  }
  if (Number(request.headers.get("content-length") ?? 0) > IMPORT_MAX_BYTES * 2 + 4096) {
    return NextResponse.json({ error: "The file is too large" }, { status: 413 });
  }

  let body: { type?: unknown; mode?: unknown; fileName?: unknown; text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const type = String(body.type ?? "");
  const mode = String(body.mode ?? "");
  const fileName = String(body.fileName ?? "import.csv").slice(0, 200);
  if (!isImportType(type)) return NextResponse.json({ error: "Unknown import type" }, { status: 400 });
  if (mode !== "preview" && mode !== "import") return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
  if (typeof body.text !== "string") return NextResponse.json({ error: "No file content received" }, { status: 400 });
  // Spreadsheets and PDFs are converted to CSV text in the browser; the text gets the same checks either way.
  if (!IMPORT_EXTENSIONS.includes(fileExtension(fileName))) return NextResponse.json({ error: "This file type cannot be imported" }, { status: 400 });

  const missing = IMPORT_SPECS[type].permissions.filter((permission) => !can(user.role, permission));
  if (missing.length) {
    return NextResponse.json({ error: `Your role cannot import ${IMPORT_SPECS[type].label.toLowerCase()}` }, { status: 403 });
  }

  try {
    if (mode === "preview") return NextResponse.json({ preview: await previewImport(type, body.text, fileName, user.id) });
    const result = await runImport(type, body.text, fileName, user.id);
    if (result.imported) {
      for (const path of REFRESH) revalidatePath(path);
      revalidatePath("/students/[id]", "page");
      revalidatePath("/classes/[id]", "page");
    }
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 500 });
  }
}
