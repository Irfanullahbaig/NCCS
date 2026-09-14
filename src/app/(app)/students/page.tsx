import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { ensureCurrentMonthFees } from "@/lib/finance";
import { currentMonthYear, formatPKR, fullName, toDateInput } from "@/lib/utils";
import { PageHeader, EmptyState, Input, Select } from "@/components/ui";
import { FeeBadge, TypeBadge } from "@/components/badges";
import { AddStudentButton, DeleteStudentButton, EditStudentButton } from "@/components/forms";
import Link from "next/link";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("students.view");
  await ensureCurrentMonthFees();
  const params = await searchParams;
  const { month, year } = currentMonthYear();

  const where: Prisma.StudentWhereInput = {
    deletedAt: null,
    ...(params.q
      ? {
          OR: [
            { firstName: { contains: params.q } },
            { lastName: { contains: params.q } },
            { fatherName: { contains: params.q } },
            { registrationNo: { contains: params.q } },
            { class: { name: { contains: params.q } } },
            { class: { program: { name: { contains: params.q } } } },
          ],
        }
      : {}),
    ...(params.studentType ? { studentType: params.studentType as never } : {}),
    ...(params.gender ? { gender: params.gender as never } : {}),
    ...(params.classId ? { classId: params.classId } : {}),
    ...(params.academicYearId ? { class: { academicYearId: params.academicYearId } } : {}),
    ...(params.feeStatus
      ? { feeRecords: { some: { month, year, status: params.feeStatus as never } } }
      : {}),
  };

  const [students, classes, years] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      include: {
        class: { include: { program: true, academicYear: true } },
        feeRecords: { where: { month, year } },
      },
    }),
    prisma.class.findMany({
      where: { status: "ACTIVE" },
      include: { program: true },
      orderBy: { name: "asc" },
    }),
    prisma.academicYear.findMany({ orderBy: { startDate: "desc" } }),
  ]);

  const classOptions = classes.map((item) => ({
    id: item.id,
    name: item.name,
    program: item.program.name,
    feeAmount: item.feeAmount,
  }));

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle="Search, filter, and manage student records. Fee status is calculated from actual payments."
        actions={can(user.role, "students.create") ? <AddStudentButton classes={classOptions} /> : null}
      />
      <form className="mb-4 grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:grid-cols-6">
        <Input name="q" defaultValue={params.q} placeholder="Name, father, ID, class..." className="md:col-span-2" />
        <Select name="studentType" defaultValue={params.studentType ?? ""}>
          <option value="">All types</option>
          <option value="SELF">Self</option>
          <option value="SCHOLARSHIP">Scholarship</option>
          <option value="NEED_BASED">Need-Based</option>
        </Select>
        <Select name="gender" defaultValue={params.gender ?? ""}>
          <option value="">All genders</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
        </Select>
        <Select name="classId" defaultValue={params.classId ?? ""}>
          <option value="">All classes</option>
          {classOptions.map((item) => (
            <option key={item.id} value={item.id}>{item.name} — {item.program}</option>
          ))}
        </Select>
        <Select name="feeStatus" defaultValue={params.feeStatus ?? ""}>
          <option value="">All fee statuses</option>
          <option value="PAID">Paid</option>
          <option value="PARTIALLY_PAID">Partially Paid</option>
          <option value="PENDING">Pending</option>
          <option value="OVERDUE">Overdue</option>
          <option value="WAIVED">Waived</option>
        </Select>
        <Select name="academicYearId" defaultValue={params.academicYearId ?? ""}>
          <option value="">All years</option>
          {years.map((yearItem) => (
            <option key={yearItem.id} value={yearItem.id}>{yearItem.name}</option>
          ))}
        </Select>
        <button className="h-10 rounded-xl bg-navy text-sm font-medium text-white">Apply filters</button>
      </form>
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {students.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Father</th>
                  <th>Class</th>
                  <th>Type</th>
                  <th>Fee</th>
                  <th>Paid</th>
                  <th>Remaining</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const fee = student.feeRecords[0];
                  return (
                    <tr key={student.id}>
                      <td>
                        <Link href={`/students/${student.id}`} className="font-medium text-navy">
                          {fullName(student.firstName, student.lastName)}
                        </Link>
                        <div className="text-xs text-slate-500">{student.registrationNo}</div>
                      </td>
                      <td>{student.fatherName}</td>
                      <td>{student.class.name} — {student.class.program.name}</td>
                      <td><TypeBadge type={student.studentType} /></td>
                      <td>{formatPKR(fee?.expectedAmount ?? student.feeAmount)}</td>
                      <td>{formatPKR(fee?.paidAmount ?? 0)}</td>
                      <td>{formatPKR(fee?.remainingAmount ?? 0)}</td>
                      <td><FeeBadge status={fee?.status ?? "PENDING"} /></td>
                      <td>
                        <div className="flex justify-end gap-2">
                          {can(user.role, "students.edit") ? (
                            <EditStudentButton
                              classes={classOptions}
                              initial={{
                                id: student.id,
                                registrationNo: student.registrationNo,
                                firstName: student.firstName,
                                lastName: student.lastName,
                                fatherName: student.fatherName,
                                classId: student.classId,
                                dateOfAdmission: toDateInput(student.dateOfAdmission),
                                gender: student.gender,
                                contactNumber: student.contactNumber,
                                email: student.email,
                                address: student.address,
                                studentType: student.studentType,
                                feeAmount: student.feeAmount,
                                status: student.status,
                              }}
                            />
                          ) : null}
                          {can(user.role, "students.delete") ? (
                            <DeleteStudentButton id={student.id} name={fullName(student.firstName, student.lastName)} />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No students found" description="Create a class first, then add students to begin fee tracking." />
        )}
      </div>
    </div>
  );
}
