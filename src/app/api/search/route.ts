import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
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

  const [students, staff, classes] = await Promise.all([
    prisma.student.findMany({
      where: {
        deletedAt: null,
        OR: [
          { firstName: { contains: q } },
          { lastName: { contains: q } },
          { fatherName: { contains: q } },
          { registrationNo: { contains: q } },
        ],
      },
      take: 6,
      include: { class: { include: { program: true } } },
    }),
    prisma.staff.findMany({
      where: {
        OR: [
          { firstName: { contains: q } },
          { lastName: { contains: q } },
          { staffId: { contains: q } },
        ],
      },
      take: 6,
    }),
    prisma.class.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { program: { name: { contains: q } } },
        ],
      },
      take: 6,
      include: { program: true },
    }),
  ]);

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
