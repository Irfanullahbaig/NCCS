"use server";

import { revalidatePath } from "next/cache";
import { Gender, StudentStatus, StudentType } from "@/lib/enums";
import { requirePermission } from "@/lib/auth";
import { db, newId, nowIso } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { nextStudentRegNo } from "@/lib/ids";
import { parseDateInput } from "@/lib/utils";
import { ensureStudentFeeRecord, invalidateFeeMaintenance } from "@/lib/finance";

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

  const schoolClass = await db().from("Class").select("id").eq("id", classId).maybeSingle();
  if (schoolClass.error) throw schoolClass.error;
  if (!schoolClass.data) return fail("Class not found");

  const year = parseDateInput(dateOfAdmission).getFullYear();
  const registrationNo = String(formData.get("registrationNo") ?? "").trim() || (await nextStudentRegNo(year));
  const stamp = nowIso();

  const student = await db()
    .from("Student")
    .insert({
      id: newId(),
      registrationNo,
      firstName,
      lastName,
      fatherName,
      classId,
      dateOfAdmission: nowIso(parseDateInput(dateOfAdmission)),
      gender,
      contactNumber,
      email: email || null,
      address,
      studentType,
      feeAmount: Math.round(feeAmount),
      status,
      createdAt: stamp,
      updatedAt: stamp,
      createdById: user.id,
      updatedById: user.id,
    })
    .select("id")
    .single();
  if (student.error) throw student.error;

  await ensureStudentFeeRecord({ studentId: student.data.id, userId: user.id });
  invalidateFeeMaintenance();
  await writeAudit({
    userId: user.id,
    action: "STUDENT_ADDED",
    entityType: "Student",
    entityId: student.data.id,
    details: { registrationNo, name: `${firstName} ${lastName}`, studentType },
  });

  revalidatePath("/students");
  revalidatePath("/classes");
  revalidatePath("/");
  return { ok: true as const, id: student.data.id };
}

export async function updateStudent(formData: FormData) {
  const user = await requirePermission("students.edit");
  const id = String(formData.get("id") ?? "");
  const existing = await db().from("Student").select("id").eq("id", id).is("deletedAt", null).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) return fail("Student not found");

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

  const updated = await db()
    .from("Student")
    .update({
      firstName,
      lastName,
      fatherName,
      classId,
      dateOfAdmission: nowIso(parseDateInput(dateOfAdmission)),
      gender,
      contactNumber,
      email: email || null,
      address,
      studentType,
      feeAmount: Math.round(feeAmount),
      status,
      updatedAt: nowIso(),
      updatedById: user.id,
    })
    .eq("id", id);
  if (updated.error) throw updated.error;

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
  const existing = await db().from("Student").select("id, registrationNo").eq("id", id).is("deletedAt", null).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) return fail("Student not found");

  const updated = await db()
    .from("Student")
    .update({ deletedAt: nowIso(), status: "INACTIVE", updatedAt: nowIso(), updatedById: user.id })
    .eq("id", id);
  if (updated.error) throw updated.error;

  await writeAudit({
    userId: user.id,
    action: "STUDENT_DELETED",
    entityType: "Student",
    entityId: id,
    details: { registrationNo: existing.data.registrationNo },
  });

  revalidatePath("/students");
  revalidatePath("/");
  return { ok: true as const };
}
