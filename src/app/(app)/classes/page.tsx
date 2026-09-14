import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { formatPKR, fullName } from "@/lib/utils";
import { PageHeader, EmptyState, Card } from "@/components/ui";
import { AddClassButtons, DeleteClassButton, EditClassButton, EditSubjectButton, DeleteSubjectButton } from "@/components/forms";

export default async function ClassesPage() {
  const user = await requirePermission("classes.view");
  const [classes, programs, years, teachers, subjects] = await Promise.all([
    prisma.class.findMany({
      include: {
        program: true,
        academicYear: true,
        classTeacher: true,
        subjects: { include: { subject: true } },
        _count: { select: { students: { where: { deletedAt: null } } } },
      },
      orderBy: [{ name: "asc" }],
    }),
    prisma.program.findMany({ orderBy: { name: "asc" } }),
    prisma.academicYear.findMany({ orderBy: { startDate: "desc" } }),
    prisma.staff.findMany({
      where: { employmentStatus: { in: ["ACTIVE", "ON_LEAVE"] } },
      orderBy: { firstName: "asc" },
    }),
    prisma.subject.findMany({ orderBy: { name: "asc" } }),
  ]);

  const formProps = {
    programs: programs.map((program) => ({ id: program.id, name: program.name })),
    years: years.map((year) => ({ id: year.id, name: year.name })),
    teachers: teachers.map((teacher) => ({ id: teacher.id, name: fullName(teacher.firstName, teacher.lastName) })),
    subjects: subjects.map((subject) => ({ id: subject.id, name: subject.name })),
  };

  return (
    <div>
      <PageHeader
        title="Classes & Programs"
        subtitle="Create classes before assigning students and teachers. Each class has its own fee dashboard."
        actions={can(user.role, "classes.create") ? <AddClassButtons {...formProps} /> : null}
      />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card title="Programs">
          <div className="flex flex-wrap gap-2">
            {programs.map((program) => (
              <span key={program.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-navy">
                {program.name}
              </span>
            ))}
          </div>
        </Card>
        <Card title="Academic years">
          {years.map((year) => (
            <p key={year.id} className="text-sm text-slate-600">
              {year.name} {year.isActive ? <span className="text-teal">(active)</span> : null}
            </p>
          ))}
        </Card>
        <Card title="Subjects">
          {subjects.length ? (
            <div className="space-y-2">
              {subjects.map((subject) => (
                <div key={subject.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-navy">{subject.name}</p>
                    <p className="text-xs text-slate-500">{subject.code}</p>
                  </div>
                  {can(user.role, "classes.edit") ? (
                    <div className="flex gap-1">
                      <EditSubjectButton initial={{ id: subject.id, name: subject.name, code: subject.code }} />
                      {can(user.role, "classes.delete") ? (
                        <DeleteSubjectButton id={subject.id} name={subject.name} />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600">None yet</p>
          )}
        </Card>
      </div>
      {classes.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {classes.map((schoolClass) => (
            <div key={schoolClass.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/classes/${schoolClass.id}`} className="text-lg font-semibold text-navy">
                    {schoolClass.name} — {schoolClass.program.name}
                  </Link>
                  <p className="text-sm text-slate-500">{schoolClass.academicYear.name} · {schoolClass.code}</p>
                </div>
                {can(user.role, "classes.edit") ? (
                  <div className="flex shrink-0 gap-1">
                    <EditClassButton
                      programs={formProps.programs}
                      years={formProps.years}
                      teachers={formProps.teachers}
                      subjects={formProps.subjects}
                      initial={{
                        id: schoolClass.id,
                        name: schoolClass.name,
                        programId: schoolClass.programId,
                        academicYearId: schoolClass.academicYearId,
                        classTeacherId: schoolClass.classTeacherId,
                        feeAmount: schoolClass.feeAmount,
                        status: schoolClass.status,
                        subjectIds: schoolClass.subjects.map((row) => row.subjectId),
                      }}
                    />
                    {can(user.role, "classes.delete") ? (
                      <DeleteClassButton id={schoolClass.id} name={`${schoolClass.name} ${schoolClass.program.name}`} />
                    ) : null}
                  </div>
                ) : null}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-slate-500">Students</dt>
                  <dd className="font-semibold">{schoolClass._count.students}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Fee</dt>
                  <dd className="font-semibold">{formatPKR(schoolClass.feeAmount)}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-slate-500">Class teacher</dt>
                  <dd>{schoolClass.classTeacher ? fullName(schoolClass.classTeacher.firstName, schoolClass.classTeacher.lastName) : "Unassigned"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-slate-500">Subjects</dt>
                  <dd>{schoolClass.subjects.map((row) => row.subject.name).join(", ") || "—"}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No classes yet" description="Admin can create unlimited classes and programs, such as Grade 10 — ICS." />
      )}
    </div>
  );
}
