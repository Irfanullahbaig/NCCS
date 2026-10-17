import { db } from "@/lib/db";
import { FEE_STATUS_LABELS } from "@/lib/constants";
import { fullName, monthLabel } from "@/lib/utils";

export async function getMonthlyStudentProgress(input: {
  month: number;
  year: number;
  classId?: string;
}) {
  let classQuery = db()
    .from("Class")
    .select("*, program:Program(*), classTeacher:Staff(*), subjects:ClassSubject(subject:Subject(*)), students:Student(*)")
    .order("name", { ascending: true });
  if (input.classId) classQuery = classQuery.eq("id", input.classId);
  const classesRes = await classQuery;
  if (classesRes.error) throw classesRes.error;

  const feeRes = await db()
    .from("FeeRecord")
    .select("studentId, status, paidAmount, remainingAmount, expectedAmount")
    .eq("month", input.month)
    .eq("year", input.year);
  if (feeRes.error) throw feeRes.error;
  const feeByStudent = new Map((feeRes.data ?? []).map((row) => [row.studentId, row]));

  const groups = (classesRes.data ?? []).map((schoolClass) => {
    const subjects = (schoolClass.subjects ?? [])
      .map((row) => row.subject)
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
    const students = (schoolClass.students ?? [])
      .filter((student) => !student.deletedAt && student.status === "ACTIVE")
      .sort((a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName))
      .map((student, index) => {
        const fee = feeByStudent.get(student.id);
        return {
          sr: index + 1,
          id: student.id,
          registrationNo: student.registrationNo,
          name: fullName(student.firstName, student.lastName),
          fatherName: student.fatherName,
          feeStatus: fee ? FEE_STATUS_LABELS[fee.status as keyof typeof FEE_STATUS_LABELS] : "Pending",
        };
      });
    return {
      classId: schoolClass.id,
      className: schoolClass.name,
      programName: schoolClass.program.name,
      teacher: schoolClass.classTeacher
        ? fullName(schoolClass.classTeacher.firstName, schoolClass.classTeacher.lastName)
        : "Unassigned",
      subjects,
      students,
    };
  });

  return {
    month: input.month,
    year: input.year,
    label: monthLabel(input.month, input.year),
    groups: groups.filter((group) => group.students.length),
  };
}
