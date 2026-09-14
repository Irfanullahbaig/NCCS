import { Prisma } from "@prisma/client";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { fullName, toDateInput, formatPKR } from "@/lib/utils";
import { PageHeader, EmptyState, Input, Select } from "@/components/ui";
import { AddStaffButton, EditStaffButton } from "@/components/forms";
import { EMPLOYMENT_LABELS } from "@/lib/constants";

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("staff.view");
  const params = await searchParams;
  const where: Prisma.StaffWhereInput = {
    ...(params.q
      ? {
          OR: [
            { firstName: { contains: params.q } },
            { lastName: { contains: params.q } },
            { staffId: { contains: params.q } },
            { subjects: { some: { subject: { name: { contains: params.q } } } } },
          ],
        }
      : {}),
    ...(params.gender ? { gender: params.gender as never } : {}),
    ...(params.employmentStatus ? { employmentStatus: params.employmentStatus as never } : {}),
    ...(params.qualification ? { qualification: { contains: params.qualification } } : {}),
    ...(params.joinedFrom ? { dateOfJoining: { gte: new Date(params.joinedFrom) } } : {}),
  };

  const [staff, subjects, classes] = await Promise.all([
    prisma.staff.findMany({
      where,
      orderBy: { firstName: "asc" },
      include: {
        subjects: { include: { subject: true } },
        assignments: { include: { class: { include: { program: true } } } },
      },
    }),
    prisma.subject.findMany({ orderBy: { name: "asc" } }),
    prisma.class.findMany({ where: { status: "ACTIVE" }, include: { program: true } }),
  ]);

  const classOptions = classes.map((item) => ({
    id: item.id,
    name: item.name,
    program: item.program.name,
    feeAmount: item.feeAmount,
  }));
  const subjectOptions = subjects.map((subject) => ({ id: subject.id, name: subject.name }));

  return (
    <div>
      <PageHeader
        title="Staff / Teachers"
        subtitle="HR records, qualifications, and class/subject assignments."
        actions={can(user.role, "staff.create") ? <AddStaffButton subjects={subjectOptions} classes={classOptions} /> : null}
      />
      <form className="mb-4 grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:grid-cols-5">
        <Input name="q" defaultValue={params.q} placeholder="Name, staff ID, subject..." className="md:col-span-2" />
        <Select name="gender" defaultValue={params.gender ?? ""}>
          <option value="">All genders</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
        </Select>
        <Select name="employmentStatus" defaultValue={params.employmentStatus ?? ""}>
          <option value="">All statuses</option>
          {Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
        <Input name="qualification" defaultValue={params.qualification} placeholder="Qualification" />
        <Input type="date" name="joinedFrom" defaultValue={params.joinedFrom} />
        <button className="h-10 rounded-xl bg-navy text-sm font-medium text-white">Apply filters</button>
      </form>
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {staff.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Qualification</th>
                  <th>Salary</th>
                  <th>Subjects</th>
                  <th>Classes</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <Link href={`/staff/${member.id}`} className="font-medium text-navy">
                        {fullName(member.firstName, member.lastName)}
                      </Link>
                      <div className="text-xs text-slate-500">{member.staffId}</div>
                    </td>
                    <td>{member.qualification}</td>
                    <td>{formatPKR(member.salaryAmount)}</td>
                    <td>{member.subjects.map((row) => row.subject.name).join(", ") || "—"}</td>
                    <td>
                      {member.assignments.map((row) => `${row.class.name} ${row.class.program.name}`).join(", ") || "—"}
                    </td>
                    <td>{member.dateOfJoining.toLocaleDateString()}</td>
                    <td>{EMPLOYMENT_LABELS[member.employmentStatus]}</td>
                    <td>
                      {can(user.role, "staff.edit") ? (
                        <EditStaffButton
                          subjects={subjectOptions}
                          classes={classOptions}
                          initial={{
                            id: member.id,
                            staffId: member.staffId,
                            firstName: member.firstName,
                            lastName: member.lastName,
                            qualification: member.qualification,
                            dateOfJoining: toDateInput(member.dateOfJoining),
                            contactNumber: member.contactNumber,
                            emergencyContact: member.emergencyContact,
                            email: member.email,
                            address: member.address,
                            gender: member.gender,
                            employmentStatus: member.employmentStatus,
                            subjectIds: member.subjects.map((row) => row.subjectId),
                            classIds: member.assignments.map((row) => row.classId),
                            salaryAmount: member.salaryAmount,
                          }}
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No staff found" description="Add teachers and staff to assign them to classes and subjects." />
        )}
      </div>
    </div>
  );
}
