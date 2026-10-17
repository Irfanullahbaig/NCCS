"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@/lib/enums";
import { hashPassword, requirePermission } from "@/lib/auth";
import { db, newId, nowIso } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

function fail(error: string) {
  return { ok: false as const, error };
}

export async function createUserAction(formData: FormData) {
  const actor = await requirePermission("users.manage");
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  if (!name || !email || !password || !role) return fail("All user fields are required");
  if (password.length < 8) return fail("Password must be at least 8 characters");

  const [existing, passwordHash] = await Promise.all([
    db().from("User").select("id").eq("email", email).maybeSingle(),
    hashPassword(password),
  ]);
  if (existing.error) throw existing.error;
  if (existing.data) return fail("A user with this email already exists");

  const stamp = nowIso();
  const user = await db()
    .from("User")
    .insert({
      id: newId(),
      name,
      email,
      role,
      passwordHash,
      createdAt: stamp,
      updatedAt: stamp,
      createdById: actor.id,
      updatedById: actor.id,
    })
    .select("id")
    .single();
  if (user.error) throw user.error;

  await writeAudit({
    userId: actor.id,
    action: "USER_CREATED",
    entityType: "User",
    entityId: user.data.id,
    details: { email, role },
  });

  revalidatePath("/users");
  return { ok: true as const };
}

export async function updateUserAction(formData: FormData) {
  const actor = await requirePermission("users.manage");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "") as Role;
  const isActive = String(formData.get("isActive") ?? "true") === "true";
  const password = String(formData.get("password") ?? "");

  if (id === actor.id && !isActive) return fail("You cannot deactivate your own account");

  const updated = await db()
    .from("User")
    .update({
      name,
      role,
      isActive,
      updatedAt: nowIso(),
      updatedById: actor.id,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    })
    .eq("id", id);
  if (updated.error) throw updated.error;

  await writeAudit({
    userId: actor.id,
    action: "USER_UPDATED",
    entityType: "User",
    entityId: id,
    details: { role, isActive },
  });

  revalidatePath("/users");
  return { ok: true as const };
}

export async function saveSettingsAction(formData: FormData) {
  const user = await requirePermission("settings.manage");
  const entries = [
    ["schoolName", String(formData.get("schoolName") ?? "").trim()],
    ["schoolAddress", String(formData.get("schoolAddress") ?? "").trim()],
    ["schoolPhone", String(formData.get("schoolPhone") ?? "").trim()],
    ["currencyPrefix", String(formData.get("currencyPrefix") ?? "Rs.").trim()],
  ];

  for (const [key, value] of entries) {
    const existing = await db().from("Setting").select("id").eq("key", key).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      const updated = await db().from("Setting").update({ value }).eq("key", key);
      if (updated.error) throw updated.error;
    } else {
      const inserted = await db().from("Setting").insert({ id: newId(), key, value });
      if (inserted.error) throw inserted.error;
    }
  }

  await writeAudit({
    userId: user.id,
    action: "SETTINGS_UPDATED",
    entityType: "Setting",
    details: Object.fromEntries(entries),
  });

  revalidatePath("/settings");
  revalidatePath("/");
  const { invalidateSchoolName } = await import("@/lib/school");
  invalidateSchoolName();
  return { ok: true as const };
}

export async function saveSettingsForm(formData: FormData): Promise<void> {
  await saveSettingsAction(formData);
}
