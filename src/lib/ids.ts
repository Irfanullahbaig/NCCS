import { db } from "@/lib/db";

export async function nextSequence(name: string) {
  const existing = await db().from("Sequence").select("name, value").eq("name", name).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) {
    const inserted = await db().from("Sequence").insert({ name, value: 1 }).select("value").single();
    if (inserted.error) {
      const retry = await db().from("Sequence").select("value").eq("name", name).single();
      if (retry.error) throw inserted.error;
      const updated = await db()
        .from("Sequence")
        .update({ value: retry.data.value + 1 })
        .eq("name", name)
        .select("value")
        .single();
      if (updated.error) throw updated.error;
      return updated.data.value;
    }
    return inserted.data.value;
  }
  const updated = await db()
    .from("Sequence")
    .update({ value: existing.data.value + 1 })
    .eq("name", name)
    .select("value")
    .single();
  if (updated.error) throw updated.error;
  return updated.data.value;
}

function pad(value: number, size = 4) {
  return String(value).padStart(size, "0");
}

export async function nextStudentRegNo(year: number) {
  const n = await nextSequence(`student-${year}`);
  return `STU-${year}-${pad(n)}`;
}

export async function nextStaffId() {
  const n = await nextSequence("staff");
  return `STF-${pad(n)}`;
}

export async function nextClassCode() {
  const n = await nextSequence("class");
  return `CLS-${pad(n)}`;
}

export async function nextIncomeId(date: Date) {
  const key = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  const n = await nextSequence(`income-${key}`);
  return `INC-${key}-${pad(n)}`;
}

export async function nextExpenseId(date: Date) {
  const key = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}`;
  const n = await nextSequence(`expense-${key}`);
  return `EXP-${key}-${pad(n)}`;
}
