import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { fullName } from "@/lib/utils";
import { PageHeader, EmptyState, Card } from "@/components/ui";
import { AddClassButtons, DeleteClassButton, EditClassButton, EditSubjectButton, DeleteSubjectButton } from "@/components/forms";

export default async function ClassesPage() {
  const user = await requirePermission("classes.view");
  const [classesRes, teachersRes, subjectsRes] = await Promise.all([
    db()
      .from("Class")
      .select("*, classTeacher:Staff(*), subjects:ClassSubject(*, subject:Subject(*)), students:Student(id, deletedAt)")
      .order("name", { ascending: true }),
    db().from("Staff").select("*").in("employmentStatus", ["ACTIVE", "ON_LEAVE"]).order("firstName", { ascending: true }),
    db().from("Subject").select("*").order("name", { ascending: true }),
  ]);
  for (const result of [classesRes, teachersRes, subjectsRes]) {
    if (result.error) throw result.error;
  }

  const teachers = (teachersRes.data ?? []).map((teacher) => ({
    id: teacher.id,
    name: fullName(teacher.firstName, teacher.lastName),
  }));
  const subjects = subjectsRes.data ?? [];
  const classes = (classesRes.data ?? []).map((schoolClass) => ({
    ...schoolClass,
    _count: { students: (schoolClass.students ?? []).filter((student) => !student.deletedAt).length },
  }));

  return (
    <div>
      <PageHeader
        title="Classes"
        subtitle="Create a class or grade, then add the subjects taught in it."
        actions={can(user.role, "classes.create") ? <AddClassButtons teachers={teachers} /> : null}
      />
      <div className="mb-6">
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
            <p className="text-sm text-slate-600">Add subjects while creating a class, or use Add subject.</p>
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
                    {schoolClass.name}
                  </Link>
                  <p className="text-sm text-slate-500">{schoolClass.code}</p>
                </div>
                {can(user.role, "classes.edit") ? (
                  <div className="flex shrink-0 gap-1">
                    <EditClassButton
                      teachers={teachers}
                      initial={{
                        id: schoolClass.id,
                        name: schoolClass.name,
                        classTeacherId: schoolClass.classTeacherId,
                        status: schoolClass.status,
                        subjectNames: schoolClass.subjects.map((row) => row.subject.name),
                      }}
                    />
                    {can(user.role, "classes.delete") ? (
                      <DeleteClassButton id={schoolClass.id} name={schoolClass.name} />
                    ) : null}
                  </div>
                ) : null}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-slate-500">Students</dt>
                  <dd className="font-semibold">{schoolClass._count.students}</dd>
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
        <EmptyState title="No classes yet" description="Create a class or grade and add its subjects." />
      )}
    </div>
  );
}
