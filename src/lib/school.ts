import { SCHOOL_NAME } from "@/lib/constants";
import { db } from "@/lib/db";

function isClockSkewError(error: { code?: string; message?: string } | null) {
  return error?.code === "PGRST303" || Boolean(error?.message?.toLowerCase().includes("jwt issued at future"));
}

async function readSchoolName() {
  return db().from("Setting").select("value").eq("key", "schoolName").maybeSingle();
}

export async function getSchoolName() {
  const first = await readSchoolName();
  if (!first.error) return first.data?.value || SCHOOL_NAME;
  if (isClockSkewError(first.error)) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const retry = await readSchoolName();
    if (!retry.error) return retry.data?.value || SCHOOL_NAME;
  }
  return SCHOOL_NAME;
}
