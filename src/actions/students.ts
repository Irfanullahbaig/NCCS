"use server";

import { revalidatePath } from "next/cache";
import { Gender, StudentStatus, StudentType } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { nextStudentRegNo } from "@/lib/ids";
import { parseDateInput } from "@/lib/utils";
import { ensureStudentFeeRecord } from "@/lib/finance";

function fail(error: string) {
  return { ok: false as const, error };
}

export async function createStudent(formData: FormData) {
  const user = await requirePermission("students.create");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const fatherName = String(formData.get("fatherName") ?? "").trim();
  const classId = String(formData.get("classId") ?? "");
  const dateOfAdmission = String(formData.get("dateOfAdmission") ?? "");
  const gender = String(formData.get("gender") ?? "") as Gender;
  const contactNumber = String(formData.get("contactNumber") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const studentType = String(formData.get("studentType") ?? "") as StudentType;
  const feeAmount = Number(formData.get("feeAmount") ?? 0);
  const status = (String(formData.get("status") ?? "ACTIVE") as StudentStatus) || "ACTIVE";

  if (!firstName || !lastName || !fatherName || !classId || !dateOfAdmission || !gender || !contactNumber || !address || !studentType) {
    return fail("Please complete all required student fields");
  }
  if (!Number.isFinite(feeAmount) || feeAmount < 0) return fail("Fee amount is invalid");

  const schoolClass = await prisma.class.findUnique({ where: { id: classId } });
  if (!schoolClass) return fail("Class not found");

  const year = parseDateInput(dateOfAdmission).getFullYear();
  const registrationNo = String(formData.get("registrationNo") ?? "").trim() || (await nextStudentRegNo(year));

  const student = await prisma.student.create({
    data: {
      registrationNo,
      firstName,
      lastName,
      fatherName,
      classId,
      dateOfAdmission: parseDateInput(dateOfAdmission),
      gender,
      contactNumber,
      email: email || null,
      address,
      studentType,
      feeAmount: Math.round(feeAmount),
      status,
      createdById: user.id,
      updatedById: user.id,
    },
  });

  await ensureStudentFeeRecord({ studentId: student.id, userId: user.id });
  await writeAudit({
    userId: user.id,
    action: "STUDENT_ADDED",
    entityType: "Student",
    entityId: student.id,
    details: { registrationNo, name: `${firstName} ${lastName}`, studentType },
  });

  revalidatePath("/students");
  revalidatePath("/classes");
  revalidatePath("/");
  return { ok: true as const, id: student.id };
}

export async function updateStudent(formData: FormData) {
  const user = await requirePermission("students.edit");
  const id = String(formData.get("id") ?? "");
  const existing = await prisma.student.findFirst({ where: { id, deletedAt: null } });
  if (!existing) return fail("Student not found");

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const fatherName = String(formData.get("fatherName") ?? "").trim();
  const classId = String(formData.get("classId") ?? "");
  const dateOfAdmission = String(formData.get("dateOfAdmission") ?? "");
  const gender = String(formData.get("gender") ?? "") as Gender;
  const contactNumber = String(formData.get("contactNumber") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim();
  const studentType = String(formData.get("studentType") ?? "") as StudentType;
  const feeAmount = Number(formData.get("feeAmount") ?? 0);
  const status = String(formData.get("status") ?? "ACTIVE") as StudentStatus;

  if (!firstName || !lastName || !fatherName || !classId) return fail("Please complete required fields");

  await prisma.student.update({
    where: { id },
    data: {
      firstName,
      lastName,
      fatherName,
      classId,
      dateOfAdmission: parseDateInput(dateOfAdmission),
      gender,
      contactNumber,
      email: email || null,
      address,
      studentType,
      feeAmount: Math.round(feeAmount),
      status,
      updatedById: user.id,
    },
  });

  await writeAudit({
    userId: user.id,
    action: "STUDENT_EDITED",
    entityType: "Student",
    entityId: id,
    details: { name: `${firstName} ${lastName}` },
  });

  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  revalidatePath("/classes");
  revalidatePath("/");
  return { ok: true as const, id };
}

export async function deleteStudent(formData: FormData) {
  const user = await requirePermission("students.delete");
  const id = String(formData.get("id") ?? "");
  const existing = await prisma.student.findFirst({ where: { id, deletedAt: null } });
  if (!existing) return fail("Student not found");

  await prisma.student.update({
    where: { id },
    data: { deletedAt: new Date(), status: "INACTIVE", updatedById: user.id },
  });

  await writeAudit({
    userId: user.id,
    action: "STUDENT_DELETED",
    entityType: "Student",
    entityId: id,
    details: { registrationNo: existing.registrationNo },
  });

  revalidatePath("/students");
  revalidatePath("/");
  return { ok: true as const };
}
