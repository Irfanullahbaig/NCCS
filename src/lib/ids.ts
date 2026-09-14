import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";

type Db = PrismaClient | Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export async function nextSequence(name: string, db: Db = prisma) {
  const row = await db.sequence.upsert({
    where: { name },
    create: { name, value: 1 },
    update: { value: { increment: 1 } },
  });
  return row.value;
}

function pad(value: number, size = 4) {
  return String(value).padStart(size, "0");
}

export async function nextStudentRegNo(year: number, db: Db = prisma) {
  const n = await nextSequence(`student-${year}`, db);
  return `STU-${year}-${pad(n)}`;
}

export async function nextStaffId(db: Db = prisma) {
  const n = await nextSequence("staff", db);
  return `STF-${pad(n)}`;
}

export async function nextClassCode(db: Db = prisma) {
  const n = await nextSequence("class", db);
  return `CLS-${pad(n)}`;
}

export async function nextIncomeId(date: Date, db: Db = prisma) {
  const key = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  const n = await nextSequence(`income-${key}`, db);
  return `INC-${key}-${pad(n)}`;
}

export async function nextExpenseId(date: Date, db: Db = prisma) {
  const key = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  const n = await nextSequence(`expense-${key}`, db);
  return `EXP-${key}-${pad(n)}`;
}
