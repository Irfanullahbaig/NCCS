"use server";

import { revalidatePath } from "next/cache";
import { EmploymentStatus, Gender } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { nextStaffId } from "@/lib/ids";
import { parseDateInput } from "@/lib/utils";

function fail(error: string) {
  return { ok: false as const, error };
}

export async function createStaff(formData: FormData) {
  const user = await requirePermission("staff.create");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const qualification = String(formData.get("qualification") ?? "").trim();
  const dateOfJoining = String(formData.get("dateOfJoining") ?? "");
  const contactNumber = String(formData.get("contactNumber") ?? "").trim();
  const emergencyContact = String(formData.get("emergencyContact") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const gender = String(formData.get("gender") ?? "") as Gender;
  const employmentStatus = (String(formData.get("employmentStatus") ?? "ACTIVE") as EmploymentStatus) || "ACTIVE";
  const subjectIds = formData.getAll("subjectIds").map(String).filter(Boolean);
  const classIds = formData.getAll("classIds").map(String).filter(Boolean);
  const salaryAmount = Number(formData.get("salaryAmount") ?? 0);

  if (!firstName || !lastName || !qualification || !dateOfJoining || !contactNumber || !address || !gender) {
    return fail("Please complete all required staff fields");
  }
  if (!Number.isFinite(salaryAmount) || salaryAmount < 0) return fail("Monthly salary is invalid");

  const staffId = String(formData.get("staffId") ?? "").trim() || (await nextStaffId());

  const staff = await prisma.staff.create({
    data: {
      staffId,
      firstName,
      lastName,
      qualification,
      dateOfJoining: parseDateInput(dateOfJoining),
      contactNumber,
      emergencyContact: emergencyContact || null,
      email: email || null,
      address,
      gender,
      employmentStatus,
      salaryAmount: Math.round(salaryAmount),
      createdById: user.id,
      updatedById: user.id,
      subjects: {
        create: subjectIds.map((subjectId) => ({ subjectId })),
      },
      assignments: {
        create: classIds.map((classId) => ({ classId })),
      },
    },
  });

  await writeAudit({
    userId: user.id,
    action: "STAFF_ADDED",
    entityType: "Staff",
    entityId: staff.id,
    details: { staffId, name: `${firstName} ${lastName}` },
  });

  revalidatePath("/staff");
  revalidatePath("/");
  revalidatePath("/finance/salaries");
  return { ok: true as const, id: staff.id };
}

export async function updateStaff(formData: FormData) {
  const user = await requirePermission("staff.edit");
  const id = String(formData.get("id") ?? "");
  const existing = await prisma.staff.findUnique({ where: { id } });
  if (!existing) return fail("Staff member not found");

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const qualification = String(formData.get("qualification") ?? "").trim();
  const dateOfJoining = String(formData.get("dateOfJoining") ?? "");
  const contactNumber = String(formData.get("contactNumber") ?? "").trim();
  const emergencyContact = String(formData.get("emergencyContact") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const gender = String(formData.get("gender") ?? "") as Gender;
  const employmentStatus = String(formData.get("employmentStatus") ?? "ACTIVE") as EmploymentStatus;
  const subjectIds = formData.getAll("subjectIds").map(String).filter(Boolean);
  const classIds = formData.getAll("classIds").map(String).filter(Boolean);
  const salaryAmount = Number(formData.get("salaryAmount") ?? 0);
  if (!Number.isFinite(salaryAmount) || salaryAmount < 0) return fail("Monthly salary is invalid");

  await prisma.$transaction([
    prisma.staffSubject.deleteMany({ where: { staffId: id } }),
    prisma.staffAssignment.deleteMany({ where: { staffId: id } }),
    prisma.staff.update({
      where: { id },
      data: {
        firstName,
        lastName,
        qualification,
        dateOfJoining: parseDateInput(dateOfJoining),
        contactNumber,
        emergencyContact: emergencyContact || null,
        email: email || null,
        address,
        gender,
        employmentStatus,
        salaryAmount: Math.round(salaryAmount),
        updatedById: user.id,
        subjects: { create: subjectIds.map((subjectId) => ({ subjectId })) },
        assignments: { create: classIds.map((classId) => ({ classId })) },
      },
    }),
  ]);

  await writeAudit({
    userId: user.id,
    action: "STAFF_EDITED",
    entityType: "Staff",
    entityId: id,
    details: { name: `${firstName} ${lastName}` },
  });

  revalidatePath("/staff");
  revalidatePath(`/staff/${id}`);
  revalidatePath("/finance/salaries");
  return { ok: true as const, id };
}

export async function deleteStaff(formData: FormData) {
  const user = await requirePermission("staff.delete");
  const id = String(formData.get("id") ?? "");
  const existing = await prisma.staff.findUnique({ where: { id } });
  if (!existing) return fail("Staff member not found");

  await prisma.staff.update({
    where: { id },
    data: { employmentStatus: "TERMINATED", updatedById: user.id },
  });

  await writeAudit({
    userId: user.id,
    action: "STAFF_DELETED",
    entityType: "Staff",
    entityId: id,
    details: { staffId: existing.staffId },
  });

  revalidatePath("/staff");
  return { ok: true as const };
}
