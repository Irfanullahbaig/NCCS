"use server";

import { revalidatePath } from "next/cache";
import { ClassStatus } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { nextClassCode } from "@/lib/ids";

function fail(error: string) {
  return { ok: false as const, error };
}

export async function createProgram(formData: FormData) {
  const user = await requirePermission("classes.create");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name) return fail("Program name is required");

  const program = await prisma.program.create({
    data: { name, description: description || null, createdById: user.id, updatedById: user.id },
  });

  await writeAudit({
    userId: user.id,
    action: "PROGRAM_CREATED",
    entityType: "Program",
    entityId: program.id,
    details: { name },
  });

  revalidatePath("/classes");
  return { ok: true as const, id: program.id };
}

export async function createSubject(formData: FormData) {
  const user = await requirePermission("classes.create");
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!name || !code) return fail("Subject name and code are required");

  const existing = await prisma.subject.findUnique({ where: { code } });
  if (existing) return fail("A subject with this code already exists");

  const subject = await prisma.subject.create({
    data: { name, code, createdById: user.id, updatedById: user.id },
  });

  await writeAudit({
    userId: user.id,
    action: "SUBJECT_CREATED",
    entityType: "Subject",
    entityId: subject.id,
    details: { name, code },
  });

  revalidatePath("/classes");
  revalidatePath("/staff");
  return { ok: true as const, id: subject.id };
}

export async function updateSubject(formData: FormData) {
  const user = await requirePermission("classes.edit");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!id || !name || !code) return fail("Subject name and code are required");

  const existing = await prisma.subject.findUnique({ where: { id } });
  if (!existing) return fail("Subject not found");

  const clash = await prisma.subject.findFirst({ where: { code, NOT: { id } } });
  if (clash) return fail("A subject with this code already exists");

  await prisma.subject.update({
    where: { id },
    data: { name, code, updatedById: user.id },
  });

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
  const existing = await prisma.subject.findUnique({ where: { id } });
  if (!existing) return fail("Subject not found");

  await prisma.$transaction([
    prisma.staffAssignment.deleteMany({ where: { subjectId: id } }),
    prisma.subject.delete({ where: { id } }),
  ]);

  await writeAudit({
    userId: user.id,
    action: "SUBJECT_DELETED",
    entityType: "Subject",
    entityId: id,
    details: { name: existing.name, code: existing.code },
  });

  revalidatePath("/classes");
  revalidatePath("/staff");
  return { ok: true as const };
}

export async function createClass(formData: FormData) {
  const user = await requirePermission("classes.create");
  const name = String(formData.get("name") ?? "").trim();
  const programId = String(formData.get("programId") ?? "");
  const academicYearId = String(formData.get("academicYearId") ?? "");
  const classTeacherId = String(formData.get("classTeacherId") ?? "");
  const feeAmount = Number(formData.get("feeAmount") ?? 0);
  const status = (String(formData.get("status") ?? "ACTIVE") as ClassStatus) || "ACTIVE";
  const subjectIds = formData.getAll("subjectIds").map(String).filter(Boolean);

  if (!name || !programId || !academicYearId) return fail("Class name, program, and academic year are required");
  if (!Number.isFinite(feeAmount) || feeAmount < 0) return fail("Fee amount is invalid");

  const schoolClass = await prisma.class.create({
    data: {
      code: await nextClassCode(),
      name,
      programId,
      academicYearId,
      classTeacherId: classTeacherId || null,
      feeAmount: Math.round(feeAmount),
      status,
      createdById: user.id,
      updatedById: user.id,
      subjects: { create: subjectIds.map((subjectId) => ({ subjectId })) },
    },
  });

  await writeAudit({
    userId: user.id,
    action: "CLASS_CREATED",
    entityType: "Class",
    entityId: schoolClass.id,
    details: { name, programId, feeAmount },
  });

  revalidatePath("/classes");
  revalidatePath("/");
  return { ok: true as const, id: schoolClass.id };
}

export async function updateClass(formData: FormData) {
  const user = await requirePermission("classes.edit");
  const id = String(formData.get("id") ?? "");
  const existing = await prisma.class.findUnique({ where: { id } });
  if (!existing) return fail("Class not found");

  const name = String(formData.get("name") ?? "").trim();
  const programId = String(formData.get("programId") ?? "");
  const academicYearId = String(formData.get("academicYearId") ?? "");
  const classTeacherId = String(formData.get("classTeacherId") ?? "");
  const feeAmount = Number(formData.get("feeAmount") ?? 0);
  const status = String(formData.get("status") ?? "ACTIVE") as ClassStatus;
  const subjectIds = formData.getAll("subjectIds").map(String).filter(Boolean);

  await prisma.$transaction([
    prisma.classSubject.deleteMany({ where: { classId: id } }),
    prisma.class.update({
      where: { id },
      data: {
        name,
        programId,
        academicYearId,
        classTeacherId: classTeacherId || null,
        feeAmount: Math.round(feeAmount),
        status,
        updatedById: user.id,
        subjects: { create: subjectIds.map((subjectId) => ({ subjectId })) },
      },
    }),
  ]);

  await writeAudit({
    userId: user.id,
    action: "CLASS_EDITED",
    entityType: "Class",
    entityId: id,
    details: { name },
  });

  revalidatePath("/classes");
  revalidatePath(`/classes/${id}`);
  return { ok: true as const, id };
}

export async function deleteClass(formData: FormData) {
  const user = await requirePermission("classes.delete");
  const id = String(formData.get("id") ?? "");
  const existing = await prisma.class.findUnique({ where: { id } });
  if (!existing) return fail("Class not found");

  const studentCount = await prisma.student.count({ where: { classId: id, deletedAt: null } });
  if (studentCount > 0) return fail("Cannot delete a class that still has students. Move or remove the students first.");

  const [feeCount, incomeCount] = await Promise.all([
    prisma.feeRecord.count({ where: { classId: id } }),
    prisma.incomeTransaction.count({ where: { classId: id } }),
  ]);
  if (feeCount > 0 || incomeCount > 0) {
    return fail("Cannot delete a class with fee or income history. Mark it inactive instead.");
  }

  await prisma.$transaction([
    prisma.staffAssignment.deleteMany({ where: { classId: id } }),
    prisma.class.delete({ where: { id } }),
  ]);

  await writeAudit({
    userId: user.id,
    action: "CLASS_DELETED",
    entityType: "Class",
    entityId: id,
    details: { name: existing.name, code: existing.code },
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
    await prisma.academicYear.updateMany({ data: { isActive: false } });
  }

  const year = await prisma.academicYear.create({
    data: {
      name,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      isActive,
      createdById: user.id,
      updatedById: user.id,
    },
  });

  revalidatePath("/classes");
  revalidatePath("/settings");
  return { ok: true as const, id: year.id };
}

export async function createAcademicYearForm(formData: FormData): Promise<void> {
  await createAcademicYear(formData);
}
