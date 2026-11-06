import type { Gender, StudentStatus, StudentType } from "@/lib/enums";
import { db, newId, nowIso } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { nextStudentRegNo } from "@/lib/ids";
import { invalidateFeeMaintenance } from "@/lib/finance";

/** Shared by the Add student form and CSV import, so both save students the same way. */
export async function createStudentRecord(input: {
  registrationNo?: string | null;
  firstName: string;
  lastName: string;
  fatherName: string;
  classId: string;
  dateOfAdmission: Date;
  gender: Gender;
  contactNumber: string;
  email?: string | null;
  address: string;
  studentType: StudentType;
  feeAmount: number;
  status?: StudentStatus;
  userId: string;
  auditDetails?: Record<string, unknown>;
}) {
  const registrationNo = input.registrationNo?.trim() || (await nextStudentRegNo(input.dateOfAdmission.getFullYear()));
  const stamp = nowIso();
  const student = await db()
    .from("Student")
    .insert({
      id: newId(),
      registrationNo,
      firstName: input.firstName,
      lastName: input.lastName,
      fatherName: input.fatherName,
      classId: input.classId,
      dateOfAdmission: nowIso(input.dateOfAdmission),
      gender: input.gender,
      contactNumber: input.contactNumber,
      email: input.email || null,
      address: input.address,
      studentType: input.studentType,
      feeAmount: Math.round(input.feeAmount),
      status: input.status ?? "ACTIVE",
      createdAt: stamp,
      updatedAt: stamp,
      createdById: input.userId,
      updatedById: input.userId,
    })
    .select("id")
    .single();
  if (student.error) throw student.error;

  invalidateFeeMaintenance();
  await writeAudit({
    userId: input.userId,
    action: "STUDENT_ADDED",
    entityType: "Student",
    entityId: student.data.id,
    details: { registrationNo, name: `${input.firstName} ${input.lastName}`, studentType: input.studentType, ...input.auditDetails },
  });
  return { id: student.data.id, registrationNo };
}
