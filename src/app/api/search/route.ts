import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { fullName } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ students: [], staff: [], classes: [] });
  }
  const needle = q.toLowerCase();

  const [studentsRes, staffRes, classesRes] = await Promise.all([
    db().from("Student").select("*, class:Class(*, program:Program(*))").is("deletedAt", null),
    db().from("Staff").select("*"),
    db().from("Class").select("*, program:Program(*)"),
  ]);
  if (studentsRes.error) throw studentsRes.error;
  if (staffRes.error) throw staffRes.error;
  if (classesRes.error) throw classesRes.error;

  const students = (studentsRes.data ?? [])
    .filter((student) =>
      [student.firstName, student.lastName, student.fatherName, student.registrationNo]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    )
    .slice(0, 6);
  const staff = (staffRes.data ?? [])
    .filter((member) => `${member.firstName} ${member.lastName} ${member.staffId}`.toLowerCase().includes(needle))
    .slice(0, 6);
  const classes = (classesRes.data ?? [])
    .filter((item) => `${item.name} ${item.program?.name ?? ""}`.toLowerCase().includes(needle))
    .slice(0, 6);

  return NextResponse.json({
    students: students.map((student) => ({
      id: student.id,
      name: fullName(student.firstName, student.lastName),
      meta: `${student.registrationNo} · ${student.class.name} ${student.class.program.name}`,
    })),
    staff: staff.map((member) => ({
      id: member.id,
      name: fullName(member.firstName, member.lastName),
      meta: member.staffId,
    })),
    classes: classes.map((item) => ({
      id: item.id,
      name: `${item.name} — ${item.program.name}`,
      meta: item.code,
    })),
  });
}
