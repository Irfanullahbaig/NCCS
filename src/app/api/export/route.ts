import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { currentMonthYear, fullName, toCsv } from "@/lib/utils";
import { STUDENT_TYPE_LABELS, FACULTY_TYPE_LABELS } from "@/lib/constants";
import { getMonthlyStudentProgress } from "@/lib/progress";

export const dynamic = "force-dynamic";

function dateOnly(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

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
    const studentsRes = await db()
      .from("Student")
      .select("*, class:Class(*, program:Program(*))")
      .is("deletedAt", null)
      .order("firstName", { ascending: true });
    if (studentsRes.error) throw studentsRes.error;
    const students = (studentsRes.data ?? []).filter((student) => (studentType ? student.studentType === studentType : true));
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
    const staffRes = await db()
      .from("Staff")
      .select("*, subjects:StaffSubject(*, subject:Subject(*)), assignments:StaffAssignment(*, class:Class(*, program:Program(*)))")
      .order("dateOfJoining", { ascending: true });
    if (staffRes.error) throw staffRes.error;
    const staff = staffRes.data ?? [];
    rows = [
      ["Staff ID", "Name", "Faculty", "Qualification", "Joined", "Status", "Subjects", "Classes"],
      ...staff.map((member) => [
        member.staffId,
        fullName(member.firstName, member.lastName),
        FACULTY_TYPE_LABELS[member.facultyType ?? "PERMANENT"],
        member.qualification,
        dateOnly(member.dateOfJoining),
        member.employmentStatus,
        member.subjects.map((row) => row.subject.name).join("; "),
        member.assignments.map((row) => `${row.class.name} ${row.class.program.name}`).join("; "),
      ]),
    ];
  } else if (type === "monthly-expenses") {
    const expensesRes = await db().from("ExpenseTransaction").select("*").is("voidedAt", null).order("date", { ascending: false });
    if (expensesRes.error) throw expensesRes.error;
    const expenses = expensesRes.data ?? [];
    rows = [
      ["Expense ID", "Date", "Category", "Paid To", "Amount", "Method"],
      ...expenses.map((row) => [row.expenseId, dateOnly(row.date), row.category, row.paidTo, row.amount, row.paymentMethod]),
    ];
  } else if (type === "daily-income" || type === "monthly-income" || type === "income-vs-expenses") {
    const incomeRes = await db().from("IncomeTransaction").select("*").is("voidedAt", null).order("date", { ascending: false });
    if (incomeRes.error) throw incomeRes.error;
    const income = incomeRes.data ?? [];
    rows = [
      ["Income ID", "Date", "Category", "Source", "Amount", "Method"],
      ...income.map((row) => [row.incomeId, dateOnly(row.date), row.category, row.source ?? "", row.amount, row.paymentMethod]),
    ];
  } else if (type === "student-progress") {
    const progress = await getMonthlyStudentProgress({
      month,
      year,
      classId: searchParams.get("classId") ?? undefined,
    });
    rows = [
      ["Class", "Program", "Teacher", "Sr", "Student ID", "Student", "Father", "Fee status"],
      ...progress.groups.flatMap((group) =>
        group.students.map((student) => [
          group.className,
          group.programName,
          group.teacher,
          student.sr,
          student.registrationNo,
          student.name,
          student.fatherName,
          student.feeStatus,
        ]),
      ),
    ];
  } else {
    const recordsRes = await db()
      .from("FeeRecord")
      .select("*, student:Student(*, class:Class(*, program:Program(*)))")
      .eq("month", month)
      .eq("year", year);
    if (recordsRes.error) throw recordsRes.error;
    const records = (recordsRes.data ?? []).filter((record) => (type === "outstanding" ? record.remainingAmount > 0 : true));
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
