import { db, newId, nowIso } from "@/lib/db";

export async function ensureActiveAcademicYear(userId: string) {
  const active = await db().from("AcademicYear").select("id").eq("isActive", true).maybeSingle();
  if (active.error) throw active.error;
  if (active.data) return active.data.id;

  const latest = await db().from("AcademicYear").select("id").order("startDate", { ascending: false }).limit(1).maybeSingle();
  if (latest.error) throw latest.error;
  if (latest.data) return latest.data.id;

  const year = new Date().getFullYear();
  const stamp = nowIso();
  const created = await db()
    .from("AcademicYear")
    .insert({
      id: newId(),
      name: `${year}-${year + 1}`,
      startDate: nowIso(new Date(Date.UTC(year, 3, 1))),
      endDate: nowIso(new Date(Date.UTC(year + 1, 2, 31))),
      isActive: true,
      createdAt: stamp,
      updatedAt: stamp,
      createdById: userId,
      updatedById: userId,
    })
    .select("id")
    .single();
  if (created.error) throw created.error;
  return created.data.id;
}

export async function ensureLocalSystemProgram(userId: string) {
  const existing = await db().from("Program").select("id").eq("name", "Local System").maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data.id;

  const stamp = nowIso();
  const created = await db()
    .from("Program")
    .insert({
      id: newId(),
      name: "Local System",
      description: "Local academic system",
      createdAt: stamp,
      updatedAt: stamp,
      createdById: userId,
      updatedById: userId,
    })
    .select("id")
    .single();
  if (created.error) throw created.error;
  return created.data.id;
}
