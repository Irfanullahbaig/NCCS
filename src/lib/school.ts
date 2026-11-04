import { REPLACED_SCHOOL_NAMES, SCHOOL_NAME } from "@/lib/constants";
import { db } from "@/lib/db";

function isClockSkewError(error: { code?: string; message?: string } | null) {
  return error?.code === "PGRST303" || Boolean(error?.message?.toLowerCase().includes("jwt issued at future"));
}

async function readSchoolName() {
  return db().from("Setting").select("value").eq("key", "schoolName").maybeSingle();
}

function displayName(stored: string | undefined) {
  return !stored || REPLACED_SCHOOL_NAMES.includes(stored) ? SCHOOL_NAME : stored;
}

let cachedName: { value: string; at: number } | null = null;

export function invalidateSchoolName() {
  cachedName = null;
}

export async function getSchoolName() {
  if (cachedName && Date.now() - cachedName.at < 60_000) return cachedName.value;
  const first = await readSchoolName();
  if (!first.error) {
    const value = displayName(first.data?.value);
    cachedName = { value, at: Date.now() };
    return value;
  }
  if (isClockSkewError(first.error)) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const retry = await readSchoolName();
    if (!retry.error) {
      const value = displayName(retry.data?.value);
      cachedName = { value, at: Date.now() };
      return value;
    }
  }
  return SCHOOL_NAME;
}
