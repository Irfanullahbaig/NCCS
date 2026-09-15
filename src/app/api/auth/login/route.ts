import { NextResponse } from "next/server";
import { authenticate, createSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nextPath(value: string) {
  return value.startsWith("/") ? value : "/";
}

export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = nextPath(String(form.get("next") ?? "/") || "/");
  const login = new URL("/login", request.url);

  try {
    const user = await authenticate(email, password);
    if (!user) {
      login.searchParams.set("error", "invalid");
      return NextResponse.redirect(login, 303);
    }

    await createSession(user);
    await writeAudit({
      userId: user.id,
      action: "USER_LOGIN",
      entityType: "User",
      entityId: user.id,
      details: { email: user.email },
    });
    return NextResponse.redirect(new URL(next, request.url), 303);
  } catch (error) {
    console.error("Login failed", error);
    login.searchParams.set("error", "server");
    return NextResponse.redirect(login, 303);
  }
}
