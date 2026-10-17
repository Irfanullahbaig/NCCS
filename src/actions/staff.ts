"use server";

import { revalidatePath } from "next/cache";
import { EmploymentStatus, FacultyType, Gender } from "@/lib/enums";
import { requirePermission } from "@/lib/auth";
import { db, newId, nowIso } from "@/lib/db";
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
  const facultyType = (String(formData.get("facultyType") ?? "PERMANENT") as FacultyType) || "PERMANENT";
  const subjectIds = formData.getAll("subjectIds").map(String).filter(Boolean);
  const classIds = formData.getAll("classIds").map(String).filter(Boolean);
  const salaryAmount = Number(formData.get("salaryAmount") ?? 0);

  if (!firstName || !lastName || !qualification || !dateOfJoining || !contactNumber || !address || !gender) {
    return fail("Please complete all required staff fields");
  }
  if (facultyType !== "PERMANENT" && facultyType !== "VISITING") {
    return fail("Select whether faculty is Permanent or Visiting");
  }
  if (!Number.isFinite(salaryAmount) || salaryAmount < 0) return fail("Monthly salary is invalid");

  const staffId = String(formData.get("staffId") ?? "").trim() || (await nextStaffId());
  const stamp = nowIso();

  const staff = await db()
    .from("Staff")
    .insert({
      id: newId(),
      staffId,
      firstName,
      lastName,
      qualification,
      dateOfJoining: nowIso(parseDateInput(dateOfJoining)),
      contactNumber,
      emergencyContact: emergencyContact || null,
      email: email || null,
      address,
      gender,
      employmentStatus,
      facultyType,
      salaryAmount: Math.round(salaryAmount),
      createdAt: stamp,
      updatedAt: stamp,
      createdById: user.id,
      updatedById: user.id,
    })
    .select("id")
    .single();
  if (staff.error) throw staff.error;

  if (subjectIds.length) {
    const subjects = await db()
      .from("StaffSubject")
      .insert(subjectIds.map((subjectId) => ({ staffId: staff.data.id, subjectId })));
    if (subjects.error) throw subjects.error;
  }
  if (classIds.length) {
    const assignments = await db()
      .from("StaffAssignment")
      .insert(classIds.map((classId) => ({ id: newId(), staffId: staff.data.id, classId })));
    if (assignments.error) throw assignments.error;
  }

  await writeAudit({
    userId: user.id,
    action: "STAFF_ADDED",
    entityType: "Staff",
    entityId: staff.data.id,
    details: { staffId, name: `${firstName} ${lastName}` },
  });

  revalidatePath("/staff");
  revalidatePath("/");
  revalidatePath("/finance/salaries");
  return { ok: true as const, id: staff.data.id };
}

export async function updateStaff(formData: FormData) {
  const user = await requirePermission("staff.edit");
  const id = String(formData.get("id") ?? "");
  const existing = await db().from("Staff").select("id").eq("id", id).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) return fail("Staff member not found");

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
  const facultyType = (String(formData.get("facultyType") ?? "PERMANENT") as FacultyType) || "PERMANENT";
  const subjectIds = formData.getAll("subjectIds").map(String).filter(Boolean);
  const classIds = formData.getAll("classIds").map(String).filter(Boolean);
  const salaryAmount = Number(formData.get("salaryAmount") ?? 0);
  if (!Number.isFinite(salaryAmount) || salaryAmount < 0) return fail("Monthly salary is invalid");
  if (facultyType !== "PERMANENT" && facultyType !== "VISITING") {
    return fail("Select whether faculty is Permanent or Visiting");
  }

  const delSubjects = await db().from("StaffSubject").delete().eq("staffId", id);
  if (delSubjects.error) throw delSubjects.error;
  const delAssignments = await db().from("StaffAssignment").delete().eq("staffId", id);
  if (delAssignments.error) throw delAssignments.error;

  const updated = await db()
    .from("Staff")
    .update({
      firstName,
      lastName,
      qualification,
      dateOfJoining: nowIso(parseDateInput(dateOfJoining)),
      contactNumber,
      emergencyContact: emergencyContact || null,
      email: email || null,
      address,
      gender,
      employmentStatus,
      facultyType,
      salaryAmount: Math.round(salaryAmount),
      updatedAt: nowIso(),
      updatedById: user.id,
    })
    .eq("id", id);
  if (updated.error) throw updated.error;

  if (subjectIds.length) {
    const subjects = await db()
      .from("StaffSubject")
      .insert(subjectIds.map((subjectId) => ({ staffId: id, subjectId })));
    if (subjects.error) throw subjects.error;
  }
  if (classIds.length) {
    const assignments = await db()
      .from("StaffAssignment")
      .insert(classIds.map((classId) => ({ id: newId(), staffId: id, classId })));
    if (assignments.error) throw assignments.error;
  }

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
  const existing = await db().from("Staff").select("id, staffId").eq("id", id).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) return fail("Staff member not found");

  const updated = await db()
    .from("Staff")
    .update({ employmentStatus: "TERMINATED", updatedAt: nowIso(), updatedById: user.id })
    .eq("id", id);
  if (updated.error) throw updated.error;

  await writeAudit({
    userId: user.id,
    action: "STAFF_DELETED",
    entityType: "Staff",
    entityId: id,
    details: { staffId: existing.data.staffId },
  });

  revalidatePath("/staff");
  return { ok: true as const };
}
