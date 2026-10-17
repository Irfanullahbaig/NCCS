"use server";

import { revalidatePath } from "next/cache";
import { ClassStatus } from "@/lib/enums";
import { requirePermission } from "@/lib/auth";
import { db, newId, nowIso } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { nextClassCode } from "@/lib/ids";
import { ensureActiveAcademicYear, ensureLocalSystemProgram } from "@/lib/programs";

function fail(error: string) {
  return { ok: false as const, error };
}

export async function createProgram(formData: FormData) {
  const user = await requirePermission("classes.create");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name) return fail("Program name is required");

  const stamp = nowIso();
  const program = await db()
    .from("Program")
    .insert({
      id: newId(),
      name,
      description: description || null,
      createdAt: stamp,
      updatedAt: stamp,
      createdById: user.id,
      updatedById: user.id,
    })
    .select("id")
    .single();
  if (program.error) throw program.error;

  await writeAudit({
    userId: user.id,
    action: "PROGRAM_CREATED",
    entityType: "Program",
    entityId: program.data.id,
    details: { name },
  });

  revalidatePath("/classes");
  return { ok: true as const, id: program.data.id };
}

export async function createSubject(formData: FormData) {
  const user = await requirePermission("classes.create");
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!name || !code) return fail("Subject name and code are required");

  const existing = await db().from("Subject").select("id").eq("code", code).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return fail("A subject with this code already exists");

  const stamp = nowIso();
  const subject = await db()
    .from("Subject")
    .insert({
      id: newId(),
      name,
      code,
      createdAt: stamp,
      updatedAt: stamp,
      createdById: user.id,
      updatedById: user.id,
    })
    .select("id")
    .single();
  if (subject.error) throw subject.error;

  await writeAudit({
    userId: user.id,
    action: "SUBJECT_CREATED",
    entityType: "Subject",
    entityId: subject.data.id,
    details: { name, code },
  });

  revalidatePath("/classes");
  revalidatePath("/staff");
  return { ok: true as const, id: subject.data.id };
}

export async function updateSubject(formData: FormData) {
  const user = await requirePermission("classes.edit");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!id || !name || !code) return fail("Subject name and code are required");

  const existing = await db().from("Subject").select("id").eq("id", id).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) return fail("Subject not found");

  const clash = await db().from("Subject").select("id").eq("code", code).neq("id", id).maybeSingle();
  if (clash.error) throw clash.error;
  if (clash.data) return fail("A subject with this code already exists");

  const updated = await db().from("Subject").update({ name, code, updatedAt: nowIso(), updatedById: user.id }).eq("id", id);
  if (updated.error) throw updated.error;

  await writeAudit({
    userId: user.id,
    action: "SUBJECT_EDITED",
    entityType: "Subject",
    entityId: id,
    details: { name, code },
  });

  revalidatePath("/classes");
  revalidatePath("/staff");
  return { ok: true as const, id };
}

export async function deleteSubject(formData: FormData) {
  const user = await requirePermission("classes.delete");
  const id = String(formData.get("id") ?? "");
  const existing = await db().from("Subject").select("id, name, code").eq("id", id).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) return fail("Subject not found");

  const delAssignments = await db().from("StaffAssignment").delete().eq("subjectId", id);
  if (delAssignments.error) throw delAssignments.error;
  const delClassSubjects = await db().from("ClassSubject").delete().eq("subjectId", id);
  if (delClassSubjects.error) throw delClassSubjects.error;
  const delStaffSubjects = await db().from("StaffSubject").delete().eq("subjectId", id);
  if (delStaffSubjects.error) throw delStaffSubjects.error;
  const deleted = await db().from("Subject").delete().eq("id", id);
  if (deleted.error) throw deleted.error;

  await writeAudit({
    userId: user.id,
    action: "SUBJECT_DELETED",
    entityType: "Subject",
    entityId: id,
    details: { name: existing.data.name, code: existing.data.code },
  });

  revalidatePath("/classes");
  revalidatePath("/staff");
  return { ok: true as const };
}

function subjectNamesFromForm(formData: FormData) {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of formData.getAll("subjectNames")) {
    const name = String(value ?? "").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function subjectCodeFromName(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  const fromWords = words.length > 1
    ? words.map((word) => word[0] ?? "").join("")
    : name;
  const code = fromWords.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase();
  return code || "SUB";
}

async function resolveSubjectIds(names: string[], userId: string) {
  if (!names.length) return [];

  const existing = await db().from("Subject").select("id, name, code");
  if (existing.error) throw existing.error;

  const byName = new Map((existing.data ?? []).map((subject) => [subject.name.trim().toLowerCase(), subject]));
  const usedCodes = new Set((existing.data ?? []).map((subject) => subject.code.toUpperCase()));
  const ids: string[] = [];
  const stamp = nowIso();

  for (const name of names) {
    const match = byName.get(name.toLowerCase());
    if (match) {
      ids.push(match.id);
      continue;
    }

    let code = subjectCodeFromName(name);
    let suffix = 2;
    while (usedCodes.has(code)) {
      const base = subjectCodeFromName(name).slice(0, 4);
      code = `${base}${suffix}`.slice(0, 8).toUpperCase();
      suffix += 1;
    }

    const created = await db()
      .from("Subject")
      .insert({
        id: newId(),
        name,
        code,
        createdAt: stamp,
        updatedAt: stamp,
        createdById: userId,
        updatedById: userId,
      })
      .select("id, name, code")
      .single();
    if (created.error) throw created.error;
    byName.set(name.toLowerCase(), created.data);
    usedCodes.add(created.data.code.toUpperCase());
    ids.push(created.data.id);
  }

  return ids;
}

async function replaceClassSubjects(classId: string, subjectIds: string[]) {
  const delSubjects = await db().from("ClassSubject").delete().eq("classId", classId);
  if (delSubjects.error) throw delSubjects.error;
  if (!subjectIds.length) return;
  const subjects = await db()
    .from("ClassSubject")
    .insert(subjectIds.map((subjectId) => ({ classId, subjectId })));
  if (subjects.error) throw subjects.error;
}

export async function createClass(formData: FormData) {
  const user = await requirePermission("classes.create");
  const name = String(formData.get("name") ?? "").trim();
  const classTeacherId = String(formData.get("classTeacherId") ?? "");
  const status = (String(formData.get("status") ?? "ACTIVE") as ClassStatus) || "ACTIVE";
  const subjectNames = subjectNamesFromForm(formData);

  if (!name) return fail("Class or grade name is required");

  const [programId, academicYearId, subjectIds] = await Promise.all([
    ensureLocalSystemProgram(user.id),
    ensureActiveAcademicYear(user.id),
    resolveSubjectIds(subjectNames, user.id),
  ]);

  const stamp = nowIso();
  const schoolClass = await db()
    .from("Class")
    .insert({
      id: newId(),
      code: await nextClassCode(),
      name,
      programId,
      academicYearId,
      classTeacherId: classTeacherId || null,
      feeAmount: 0,
      status,
      createdAt: stamp,
      updatedAt: stamp,
      createdById: user.id,
      updatedById: user.id,
    })
    .select("id")
    .single();
  if (schoolClass.error) throw schoolClass.error;

  await replaceClassSubjects(schoolClass.data.id, subjectIds);

  await writeAudit({
    userId: user.id,
    action: "CLASS_CREATED",
    entityType: "Class",
    entityId: schoolClass.data.id,
    details: { name, subjects: subjectNames },
  });

  revalidatePath("/classes");
  revalidatePath("/staff");
  revalidatePath("/");
  return { ok: true as const, id: schoolClass.data.id };
}

export async function updateClass(formData: FormData) {
  const user = await requirePermission("classes.edit");
  const id = String(formData.get("id") ?? "");
  const existing = await db().from("Class").select("id").eq("id", id).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) return fail("Class not found");

  const name = String(formData.get("name") ?? "").trim();
  const classTeacherId = String(formData.get("classTeacherId") ?? "");
  const status = String(formData.get("status") ?? "ACTIVE") as ClassStatus;
  const subjectNames = subjectNamesFromForm(formData);
  if (!name) return fail("Class or grade name is required");

  const subjectIds = await resolveSubjectIds(subjectNames, user.id);

  const updated = await db()
    .from("Class")
    .update({
      name,
      classTeacherId: classTeacherId || null,
      status,
      updatedAt: nowIso(),
      updatedById: user.id,
    })
    .eq("id", id);
  if (updated.error) throw updated.error;

  await replaceClassSubjects(id, subjectIds);

  await writeAudit({
    userId: user.id,
    action: "CLASS_EDITED",
    entityType: "Class",
    entityId: id,
    details: { name, subjects: subjectNames },
  });

  revalidatePath("/classes");
  revalidatePath(`/classes/${id}`);
  return { ok: true as const, id };
}

export async function deleteClass(formData: FormData) {
  const user = await requirePermission("classes.delete");
  const id = String(formData.get("id") ?? "");
  const existing = await db().from("Class").select("id, name, code").eq("id", id).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) return fail("Class not found");

  const studentCount = await db().from("Student").select("id", { count: "exact", head: true }).eq("classId", id).is("deletedAt", null);
  if (studentCount.error) throw studentCount.error;
  if ((studentCount.count ?? 0) > 0) return fail("Cannot delete a class that still has students. Move or remove the students first.");

  const [feeCount, incomeCount] = await Promise.all([
    db().from("FeeRecord").select("id", { count: "exact", head: true }).eq("classId", id),
    db().from("IncomeTransaction").select("id", { count: "exact", head: true }).eq("classId", id),
  ]);
  if (feeCount.error) throw feeCount.error;
  if (incomeCount.error) throw incomeCount.error;
  if ((feeCount.count ?? 0) > 0 || (incomeCount.count ?? 0) > 0) {
    return fail("Cannot delete a class with fee or income history. Mark it inactive instead.");
  }

  const delAssignments = await db().from("StaffAssignment").delete().eq("classId", id);
  if (delAssignments.error) throw delAssignments.error;
  const delSubjects = await db().from("ClassSubject").delete().eq("classId", id);
  if (delSubjects.error) throw delSubjects.error;
  const deleted = await db().from("Class").delete().eq("id", id);
  if (deleted.error) throw deleted.error;

  await writeAudit({
    userId: user.id,
    action: "CLASS_DELETED",
    entityType: "Class",
    entityId: id,
    details: { name: existing.data.name, code: existing.data.code },
  });

  revalidatePath("/classes");
  revalidatePath("/staff");
  revalidatePath("/");
  return { ok: true as const };
}

export async function createAcademicYear(formData: FormData) {
  const user = await requirePermission("classes.create");
  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const isActive = String(formData.get("isActive") ?? "") === "on";
  if (!name || !startDate || !endDate) return fail("Academic year details are required");

  if (isActive) {
    const deactivated = await db().from("AcademicYear").update({ isActive: false, updatedAt: nowIso() }).not("id", "is", null);
    if (deactivated.error) throw deactivated.error;
  }

  const stamp = nowIso();
  const year = await db()
    .from("AcademicYear")
    .insert({
      id: newId(),
      name,
      startDate: nowIso(new Date(startDate)),
      endDate: nowIso(new Date(endDate)),
      isActive,
      createdAt: stamp,
      updatedAt: stamp,
      createdById: user.id,
      updatedById: user.id,
    })
    .select("id")
    .single();
  if (year.error) throw year.error;

  revalidatePath("/classes");
  revalidatePath("/settings");
  return { ok: true as const, id: year.data.id };
}

export async function createAcademicYearForm(formData: FormData): Promise<void> {
  await createAcademicYear(formData);
}
