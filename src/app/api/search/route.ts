import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { fullName } from "@/lib/utils";
import { isDummyDataEnabled } from "@/lib/supabase/dummy";

export const dynamic = "force-dynamic";

function pack(input: {
  students: Array<{ id: string; firstName: string; lastName: string; fatherName?: string | null; registrationNo: string; class?: { name: string; program?: { name: string } | null } | null }>;
  staff: Array<{ id: string; firstName: string; lastName: string; staffId: string }>;
  classes: Array<{ id: string; name: string; code: string; program?: { name: string } | null }>;
  needle: string;
}) {
  return {
    students: input.students
      .filter((student) => [student.firstName, student.lastName, student.fatherName, student.registrationNo].join(" ").toLowerCase().includes(input.needle))
      .slice(0, 6)
      .map((student) => ({
        id: student.id,
        name: fullName(student.firstName, student.lastName),
        meta: `${student.registrationNo} · ${student.class?.name ?? ""} ${student.class?.program?.name ?? ""}`.trim(),
      })),
    staff: input.staff
      .filter((member) => `${member.firstName} ${member.lastName} ${member.staffId}`.toLowerCase().includes(input.needle))
      .slice(0, 6)
      .map((member) => ({
        id: member.id,
        name: fullName(member.firstName, member.lastName),
        meta: member.staffId,
      })),
    classes: input.classes
      .filter((item) => `${item.name} ${item.program?.name ?? ""} ${item.code}`.toLowerCase().includes(input.needle))
      .slice(0, 6)
      .map((item) => ({
        id: item.id,
        name: `${item.name} — ${item.program?.name ?? ""}`,
        meta: item.code,
      })),
  };
}

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ students: [], staff: [], classes: [] });
  }
  const needle = q.toLowerCase();
  const safe = q.replace(/[%_,()]/g, "");
  const pattern = `%${safe}%`;

  if (!isDummyDataEnabled()) {
    const [studentsRes, staffRes, classesRes] = await Promise.all([
      db()
        .from("Student")
        .select("id, firstName, lastName, fatherName, registrationNo, class:Class(name, program:Program(name))")
        .is("deletedAt", null)
        .or(`firstName.ilike.${pattern},lastName.ilike.${pattern},fatherName.ilike.${pattern},registrationNo.ilike.${pattern}`)
        .limit(12),
      db()
        .from("Staff")
        .select("id, firstName, lastName, staffId")
        .or(`firstName.ilike.${pattern},lastName.ilike.${pattern},staffId.ilike.${pattern}`)
        .limit(12),
      db()
        .from("Class")
        .select("id, name, code, program:Program(name)")
        .or(`name.ilike.${pattern},code.ilike.${pattern}`)
        .limit(12),
    ]);
    if (!studentsRes.error && !staffRes.error && !classesRes.error) {
      return NextResponse.json(pack({
        students: studentsRes.data ?? [],
        staff: staffRes.data ?? [],
        classes: classesRes.data ?? [],
        needle,
      }));
    }
  }

  const [studentsAll, staffAll, classesAll] = await Promise.all([
    db().from("Student").select("id, firstName, lastName, fatherName, registrationNo, class:Class(name, program:Program(name))").is("deletedAt", null),
    db().from("Staff").select("id, firstName, lastName, staffId"),
    db().from("Class").select("id, name, code, program:Program(name)"),
  ]);
  if (studentsAll.error) throw studentsAll.error;
  if (staffAll.error) throw staffAll.error;
  if (classesAll.error) throw classesAll.error;
  return NextResponse.json(pack({
    students: studentsAll.data ?? [],
    staff: staffAll.data ?? [],
    classes: classesAll.data ?? [],
    needle,
  }));
}
