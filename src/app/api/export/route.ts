import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { currentMonthYear, fullName, toCsv } from "@/lib/utils";
import { STUDENT_TYPE_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSession();
  if (!user || !can(user.role, "reports.export")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "students";
  if (type === "income-vs-expenses" && !can(user.role, "finance.analytics")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { month, year } = currentMonthYear();
  let rows: Array<Array<unknown>> = [];

  if (["students", "scholarship", "need-based", "self", "class-students"].includes(type)) {
    const studentType = type === "scholarship" ? "SCHOLARSHIP" : type === "need-based" ? "NEED_BASED" : type === "self" ? "SELF" : undefined;
    const students = await prisma.student.findMany({
      where: { deletedAt: null, ...(studentType ? { studentType } : {}) },
      include: { class: { include: { program: true } } },
      orderBy: { firstName: "asc" },
    });
    rows = [
      ["Registration No", "Student", "Father", "Class", "Program", "Type", "Fee", "Status"],
      ...students.map((student) => [
        student.registrationNo,
        fullName(student.firstName, student.lastName),
        student.fatherName,
        student.class.name,
        student.class.program.name,
        STUDENT_TYPE_LABELS[student.studentType],
        student.feeAmount,
        student.status,
      ]),
    ];
  } else if (["staff", "assignments", "joining"].includes(type)) {
    const staff = await prisma.staff.findMany({
      include: {
        subjects: { include: { subject: true } },
        assignments: { include: { class: { include: { program: true } } } },
      },
      orderBy: { dateOfJoining: "asc" },
    });
    rows = [
      ["Staff ID", "Name", "Qualification", "Joined", "Status", "Subjects", "Classes"],
      ...staff.map((member) => [
        member.staffId,
        fullName(member.firstName, member.lastName),
        member.qualification,
        member.dateOfJoining.toISOString().slice(0, 10),
        member.employmentStatus,
        member.subjects.map((row) => row.subject.name).join("; "),
        member.assignments.map((row) => `${row.class.name} ${row.class.program.name}`).join("; "),
      ]),
    ];
  } else if (type === "monthly-expenses") {
    const expenses = await prisma.expenseTransaction.findMany({
      where: { voidedAt: null },
      orderBy: { date: "desc" },
    });
    rows = [
      ["Expense ID", "Date", "Category", "Paid To", "Amount", "Method"],
      ...expenses.map((row) => [row.expenseId, row.date.toISOString().slice(0, 10), row.category, row.paidTo, row.amount, row.paymentMethod]),
    ];
  } else if (type === "daily-income" || type === "monthly-income" || type === "income-vs-expenses") {
    const income = await prisma.incomeTransaction.findMany({
      where: { voidedAt: null },
      orderBy: { date: "desc" },
    });
    rows = [
      ["Income ID", "Date", "Category", "Source", "Amount", "Method"],
      ...income.map((row) => [row.incomeId, row.date.toISOString().slice(0, 10), row.category, row.source ?? "", row.amount, row.paymentMethod]),
    ];
  } else {
    const records = await prisma.feeRecord.findMany({
      where: {
        month,
        year,
        ...(type === "outstanding" ? { remainingAmount: { gt: 0 } } : {}),
      },
      include: { student: { include: { class: { include: { program: true } } } } },
    });
    rows = [
      ["Student", "Class", "Program", "Type", "Expected", "Paid", "Waived", "Remaining", "Status"],
      ...records.map((record) => [
        fullName(record.student.firstName, record.student.lastName),
        record.student.class.name,
        record.student.class.program.name,
        record.student.studentType,
        record.expectedAmount,
        record.paidAmount,
        record.waivedAmount,
        record.remainingAmount,
        record.status,
      ]),
    ];
  }

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type}.csv"`,
    },
  });
}
