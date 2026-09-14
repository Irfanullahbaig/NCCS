"use server";

import { redirect } from "next/navigation";
import { authenticate, createSession, destroySession, getSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";

  const user = await authenticate(email, password);
  if (!user) {
    redirect("/login?error=invalid");
  }

  await createSession(user);
  await writeAudit({
    userId: user.id,
    action: "USER_LOGIN",
    entityType: "User",
    entityId: user.id,
    details: { email: user.email },
  });
  redirect(next.startsWith("/") ? next : "/");
}

export async function logoutAction() {
  const user = await getSession();
  await destroySession();
  if (user) {
    await writeAudit({
      userId: user.id,
      action: "USER_LOGOUT",
      entityType: "User",
      entityId: user.id,
    });
  }
  redirect("/login");
}
