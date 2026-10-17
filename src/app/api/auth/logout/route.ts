import { NextResponse } from "next/server";
import { destroySession, getSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getSession();
  await destroySession();
  if (user) {
    await writeAudit({
      userId: user.id,
      action: "USER_LOGOUT",
      entityType: "User",
      entityId: user.id,
    }).catch((error) => console.error("Logout audit failed", error));
  }
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
