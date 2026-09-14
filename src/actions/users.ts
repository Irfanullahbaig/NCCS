"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { hashPassword, requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
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

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return fail("A user with this email already exists");

  const user = await prisma.user.create({
    data: {
      name,
      email,
      role,
      passwordHash: await hashPassword(password),
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  await writeAudit({
    userId: actor.id,
    action: "USER_CREATED",
    entityType: "User",
    entityId: user.id,
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

  await prisma.user.update({
    where: { id },
    data: {
      name,
      role,
      isActive,
      updatedById: actor.id,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    },
  });

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
    await prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  await writeAudit({
    userId: user.id,
    action: "SETTINGS_UPDATED",
    entityType: "Setting",
    details: Object.fromEntries(entries),
  });

  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true as const };
}

export async function saveSettingsForm(formData: FormData): Promise<void> {
  await saveSettingsAction(formData);
}
